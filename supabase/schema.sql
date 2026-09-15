-- Análise de Jogo — esquema Supabase completo
-- Corre este script uma vez no SQL Editor de um projeto Supabase novo.
-- (Se já tinhas um projeto com o esquema antigo, usa antes, por ordem,
-- todos os ficheiros em supabase/migrations/, do 001 ao 028.)
--
-- Versão: 1.29 (2026-09-15) — reflete sempre o estado final cumulativo,
-- depois de todas as migrações em supabase/migrations/ terem sido aplicadas.
-- Histórico:
--   1.0  (2026-07-08) — criação: teams, matches, players, match_players, events.
--   1.1  (2026-07-08) — team_members e RLS por equipa (create_team, join_team_by_code).
--   1.2  (2026-07-10) — substituicao: minuto numérico -> badge Saiu/Entrou.
--   1.3  (2026-07-10) — segundo cartão amarelo (amarelo2).
--   1.4  (2026-07-10) — tabela player_events (histórico de ações da convocatória).
--   1.5  (2026-07-10) — matches ganha parte1_inicio/fim, parte2_inicio/fim.
--   1.6  (2026-07-10) — matches ganha orientacao_parte1 (direção de ataque).
--   1.7  (2026-07-10) — events ganha "parte" (Registo de Jogo por parte).
--   1.8  (2026-07-10) — view events_normalizado (1ª+2ª parte combinadas).
--   1.9  (2026-07-14) — events ganha "minuto"; tracker_id passa a aceitar "cruzamentos".
--   1.10 (2026-07-14) — movido de raiz para supabase/schema.sql.
--   1.11 (2026-07-15) — events ganha "player_id" (jogador que fez a ação, opcional).
--   1.12 (2026-07-15) — events_normalizado ganha "zona_col"/"zona_row" (grelha 6×4,
--                        para o mapa de calor por zonas ser calculável em SQL).
--   1.13 (2026-08-05) — questionário de wellness diário dos jogadores: players ganha
--                        login próprio (auth_user_id, data_nascimento, login_email),
--                        tabela wellness_responses, e a função submit_wellness().
--   1.14 (2026-08-07) — wellness_responses ganha "peso" (kg, opcional).
--   1.15 (2026-08-07) — função update_wellness_peso(): o peso pode ser atualizado
--                        várias vezes no mesmo dia (os outros campos ficam fixos).
--   1.16 (2026-08-07) — policy wellness_team_member_update: o treinador pode corrigir
--                        um dia já registado (pages/wellness-jogador.html).
--   1.17 (2026-08-07) — policy wellness_team_member_insert: o treinador também pode
--                        criar uma resposta em nome de um jogador.
--   1.18 (2026-08-27) — match_players ganha "numero" (opcional): sobrepõe-se ao número
--                        de base em players.numero só nesse jogo, para equipas em que o
--                        número de um jogador muda de jogo para jogo.
--   1.19 (2026-08-31) — tabela wellness_rpe (perceção de esforço, 1-10, preenchida só
--                        pelo treinador) — tabela própria, sem nenhuma policy para o
--                        jogador, para o valor nunca lhe ser visível.
--   1.20 (2026-08-31) — tabela goals (um registo por golo, não só um contador) e
--                        events ganha "goal_id" opcional — liga um ou mais eventos do
--                        Registo de Jogo (ex: cruzamento + remate) ao golo que geraram.
--   1.21 (2026-08-31) — events_normalizado ganha "goal_id", para o Registo de Jogo
--                        normalizado (Relatórios, pós-jogo) também poder destacar os
--                        pontos ligados a um golo, tal como o ecrã ao vivo.
--   1.22 (2026-08-31) — goals ganha "tipo" ('marcado' ou 'sofrido') — golo sofrido usa
--                        a mesma tabela e a mesma ligação a eventos, sem player_id (a
--                        app não tem lista de jogadores do adversário).
--   1.23 (2026-09-01) — tabela training_days: flag "dia de treino" + duração (minutos),
--                        por equipa por dia, editável no topo da tab Wellness.
--   1.24 (2026-09-14) — tabela report_insights: cache da análise em prosa (gerada pela
--                        API da Claude, via Edge Function gerar-insights) dos relatórios
--                        Geral e Transições de um jogo — um registo por jogo+tipo.
--   1.25 (2026-09-15) — matches ganha "pre_epoca" (boolean): jogo continua acessível e
--                        intacto, mas fica fora do agregado da tab Relatórios do dashboard.
--   1.26 (2026-09-15) — competition_matches/competition_access: calendário do campeonato
--                        (Zona Norte 2026-2027) numa página própria sem login, protegida
--                        por um código de acesso em vez de conta — ver secção
--                        "Calendário do campeonato" mais abaixo.
--   1.27 (2026-09-15) — corrige competition_list_matches()/competition_set_links():
--                        "set search_path = public" impedia crypt()/gen_salt() de serem
--                        encontradas em projetos Supabase que instalam o pgcrypto no
--                        schema "extensions" (não em "public") — passa a
--                        "set search_path = public, extensions".
--   1.28 (2026-09-15) — competition_matches ganha "unique (jornada, equipa_casa,
--                        equipa_fora)"; o insert dos 182 jogos passa a "on conflict
--                        ... do nothing" — corre-se este ficheiro várias vezes sem
--                        duplicar jogos.
--   1.29 (2026-09-15) — nova tabela competition_match_videos: um jogo pode ter
--                        vários links de vídeo (antes só um, em
--                        competition_matches.video_url, agora obsoleto). Funções
--                        novas: competition_list_videos/competition_add_video_link/
--                        competition_delete_video_link. competition_set_links()
--                        (video+zerozero juntos) é substituída por
--                        competition_set_zerozero_link() (só o link do ZeroZero).

create extension if not exists "pgcrypto";

-- Equipas (partilháveis entre contas)
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  join_code text not null unique,
  logo_url text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Pertença a uma equipa (define quem tem acesso a quê)
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'membro' check (role in ('owner', 'membro')),
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- Plantel reutilizável (lista mestra de jogadores de uma equipa)
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  numero text,
  nome text not null,
  -- Login próprio do jogador (opcional, criado pelo treinador na tab
  -- Plantel) — permite-lhe entrar na app e preencher o próprio wellness,
  -- sem ter acesso a mais nada da equipa (ver policies mais abaixo).
  auth_user_id uuid unique references auth.users(id) on delete set null,
  data_nascimento date,
  login_email text,
  created_at timestamptz not null default now()
);

-- Jogos de uma equipa
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  adversario text not null,
  data date not null,
  parte1_inicio timestamptz,
  parte1_fim timestamptz,
  parte2_inicio timestamptz,
  parte2_fim timestamptz,
  orientacao_parte1 text check (orientacao_parte1 in ('E-D', 'D-E')),
  -- Jogo de pré-época: continua acessível normalmente (dados, relatório do
  -- próprio jogo, etc.) mas fica fora do agregado do Relatório de Equipa.
  pre_epoca boolean not null default false,
  created_at timestamptz not null default now()
);

-- Convocatória + estatísticas de um jogador num jogo específico
create table if not exists match_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  -- Número específico deste jogo, se diferente do número "de base" em
  -- players.numero (ex: jogador cedido, camisola diferente) — null usa
  -- sempre o número do Plantel.
  numero text,
  estado text not null default 'Suplente' check (estado in ('Titular', 'Suplente')),
  amarelo int not null default 0,
  amarelo2 int not null default 0,
  vermelho int not null default 0,
  assistencias int not null default 0,
  golo int not null default 0,
  substituicao text check (substituicao in ('Saiu', 'Entrou')),
  unique (match_id, player_id)
);

-- Um golo é o seu próprio registo (não só um número em match_players.golo),
-- para poder ligar-se a um ou mais eventos do Registo de Jogo que lhe deram
-- origem (ex: um cruzamento e o remate que resultou em golo). Precisa de
-- existir antes de "events" (que a referencia via "goal_id").
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  -- "sofrido" fica sempre sem player_id — a app não tem lista de jogadores
  -- do adversário, por isso um golo sofrido não tem "marcador".
  tipo text not null default 'marcado' check (tipo in ('marcado', 'sofrido')),
  player_id uuid references players(id) on delete set null,
  parte int check (parte in (1, 2)),
  minuto int,
  created_at timestamptz not null default now()
);

-- Cliques nos campos (Faltas, Cantos, Perdas de Bola, Remates)
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  tracker_id text not null check (tracker_id in ('faltas', 'cantos', 'cruzamentos', 'perdas', 'remates')),
  parte int not null default 1 check (parte in (1, 2)),
  minuto int,
  tipo text not null check (tipo in ('X', 'Y')),
  x_pct numeric not null,
  y_pct numeric not null,
  player_id uuid references players(id) on delete set null,
  -- Um evento só pode ter contribuído para, no máximo, um golo — por isso é
  -- uma FK direta aqui, não uma tabela de junção. "set null": apagar o golo
  -- desliga o evento sem o apagar.
  goal_id uuid references goals(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Histórico de cada ação clicada na convocatória (cartões, assistências,
-- golos, estado, substituição), com data/hora, além dos totais em match_players
create table if not exists player_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  tipo text not null check (tipo in ('amarelo', 'amarelo2', 'vermelho', 'assistencias', 'golo', 'estado', 'substituicao')),
  valor text,
  created_at timestamptz not null default now()
);

-- Questionário de wellness diário, preenchido pelo próprio jogador (login
-- próprio, ver "auth_user_id" em "players") — no máximo um por dia.
create table if not exists wellness_responses (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  data date not null default current_date,
  dores_musculares int not null check (dores_musculares between 0 and 10),
  stress int not null check (stress between 0 and 10),
  fadiga int not null check (fadiga between 0 and 10),
  sono int not null check (sono between 0 and 10),
  peso numeric,
  created_at timestamptz not null default now(),
  unique (player_id, data)
);

-- RPE (perceção de esforço, 1-10) de um treino/dia, preenchido só pelo
-- treinador — tabela própria (não uma coluna em wellness_responses, que o
-- jogador já pode ler na íntegra) para o valor nunca ficar visível para o
-- jogador, nem sequer por engano num "select *" de outra página.
create table if not exists wellness_rpe (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  data date not null default current_date,
  rpe int not null check (rpe between 1 and 10),
  created_at timestamptz not null default now(),
  unique (player_id, data)
);

-- Flag diária, por equipa (não por jogador): hoje é dia de treino? Com a
-- duração em minutos quando é. Propriedade do dia em si, por isso vive
-- numa tabela própria, uma linha por equipa por dia.
create table if not exists training_days (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  data date not null default current_date,
  treino boolean not null default false,
  duracao_minutos int check (duracao_minutos > 0),
  created_at timestamptz not null default now(),
  unique (team_id, data)
);

-- Cache da análise em prosa (insights) dos relatórios Geral e Transições de
-- um jogo, gerada pela API da Claude através da Edge Function
-- gerar-insights (ver supabase/functions/gerar-insights). Guardada aqui
-- para não voltar a chamar a API sempre que o relatório é reaberto — o
-- botão "Regenerar análise" em cada página faz upsert(match_id, tipo).
create table if not exists report_insights (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  tipo text not null check (tipo in ('geral', 'transicoes')),
  conteudo jsonb not null,
  gerado_em timestamptz not null default now(),
  unique (match_id, tipo)
);

-- Índices para as queries mais comuns
create index if not exists idx_players_team on players(team_id);
create index if not exists idx_matches_team on matches(team_id);
create index if not exists idx_match_players_match on match_players(match_id);
create index if not exists idx_match_players_player on match_players(player_id);
create index if not exists idx_match_players_team on match_players(team_id);
create index if not exists idx_events_match_tracker on events(match_id, tracker_id);
create index if not exists idx_events_team on events(team_id);
create index if not exists idx_events_player on events(player_id);
create index if not exists idx_events_goal on events(goal_id);
create index if not exists idx_goals_match on goals(match_id);
create index if not exists idx_player_events_match on player_events(match_id);
create index if not exists idx_player_events_player on player_events(player_id);
create index if not exists idx_wellness_team_data on wellness_responses(team_id, data);
create index if not exists idx_wellness_player on wellness_responses(player_id);
create index if not exists idx_wellness_rpe_team_data on wellness_rpe(team_id, data);
create index if not exists idx_player_events_team on player_events(team_id);
create index if not exists idx_training_days_team_data on training_days(team_id, data);
create index if not exists idx_report_insights_match on report_insights(match_id);

-- Row Level Security
alter table teams enable row level security;
alter table team_members enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table goals enable row level security;
alter table events enable row level security;
alter table player_events enable row level security;
alter table wellness_responses enable row level security;
alter table wellness_rpe enable row level security;
alter table training_days enable row level security;
alter table report_insights enable row level security;

-- Só é possível ver uma equipa (ou dados dela) se se for membro dessa equipa
create policy "teams_member_select" on teams
  for select using (
    exists (select 1 from team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid())
  );

create policy "team_members_self_select" on team_members
  for select using (user_id = auth.uid());

-- Permite a um membro da equipa atualizar os dados da equipa (ex: o emblema)
create policy "teams_member_update" on teams
  for update
  using (exists (select 1 from team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid()));

create policy "players_team_member" on players
  for all
  using (exists (select 1 from team_members tm where tm.team_id = players.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = players.team_id and tm.user_id = auth.uid()));

-- Um jogador com login próprio (auth_user_id) vê/edita só a sua própria
-- linha em "players" (ex: para completar a data de nascimento no primeiro
-- login) — junta-se por OR à policy acima, que continua a dar acesso
-- total ao treinador (team_members) a todos os jogadores da equipa.
create policy "players_self_select" on players
  for select using (auth_user_id = auth.uid());

create policy "players_self_update" on players
  for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy "matches_team_member" on matches
  for all
  using (exists (select 1 from team_members tm where tm.team_id = matches.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = matches.team_id and tm.user_id = auth.uid()));

create policy "match_players_team_member" on match_players
  for all
  using (exists (select 1 from team_members tm where tm.team_id = match_players.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = match_players.team_id and tm.user_id = auth.uid()));

create policy "goals_team_member" on goals
  for all
  using (exists (select 1 from team_members tm where tm.team_id = goals.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = goals.team_id and tm.user_id = auth.uid()));

create policy "events_team_member" on events
  for all
  using (exists (select 1 from team_members tm where tm.team_id = events.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = events.team_id and tm.user_id = auth.uid()));

create policy "player_events_team_member" on player_events
  for all
  using (exists (select 1 from team_members tm where tm.team_id = player_events.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = player_events.team_id and tm.user_id = auth.uid()));

-- O jogador vê as próprias respostas de wellness...
create policy "wellness_player_select" on wellness_responses
  for select using (
    exists (select 1 from players p where p.id = wellness_responses.player_id and p.auth_user_id = auth.uid())
  );

-- ...e o treinador vê as respostas de todos os jogadores da sua equipa.
-- Não há policy de insert direta: a escrita inicial só acontece via a
-- função submit_wellness (mais abaixo), que identifica o jogador pelo
-- próprio login.
create policy "wellness_team_member_select" on wellness_responses
  for select using (
    exists (select 1 from team_members tm where tm.team_id = wellness_responses.team_id and tm.user_id = auth.uid())
  );

-- O treinador pode corrigir um dia já registado (ex: o jogador enganou-se
-- a preencher) — usada em pages/wellness-jogador.html.
create policy "wellness_team_member_update" on wellness_responses
  for update
  using (exists (select 1 from team_members tm where tm.team_id = wellness_responses.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = wellness_responses.team_id and tm.user_id = auth.uid()));

-- O treinador também pode criar uma resposta em nome de um jogador (ex:
-- registar um dia esquecido, ou dados de teste/demo) — a mesma confiança
-- que já tem para "update", estendida à criação.
create policy "wellness_team_member_insert" on wellness_responses
  for insert
  with check (exists (select 1 from team_members tm where tm.team_id = wellness_responses.team_id and tm.user_id = auth.uid()));

-- RPE: só o treinador (team_member) — de propósito, sem nenhuma policy
-- para o jogador (nem sequer de select), ao contrário de wellness_responses.
create policy "wellness_rpe_team_member" on wellness_rpe
  for all
  using (exists (select 1 from team_members tm where tm.team_id = wellness_rpe.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = wellness_rpe.team_id and tm.user_id = auth.uid()));

create policy "training_days_team_member" on training_days
  for all
  using (exists (select 1 from team_members tm where tm.team_id = training_days.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = training_days.team_id and tm.user_id = auth.uid()));

create policy "report_insights_team_member" on report_insights
  for all
  using (exists (select 1 from team_members tm where tm.team_id = report_insights.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = report_insights.team_id and tm.user_id = auth.uid()));

-- View: Registo de Jogo normalizado (1ª + 2ª parte juntas, rodadas 180º
-- conforme a orientação de ataque escolhida nas setas para cada parte).
-- zona_col/zona_row: grelha 6×4 para o mapa de calor por zonas (tem de
-- ficar igual a HEATMAP_COLS/HEATMAP_ROWS em js/match.js).
create or replace view events_normalizado as
select
  e.id,
  e.team_id,
  e.match_id,
  e.tracker_id,
  e.parte,
  e.tipo,
  e.created_at,
  e.x_pct,
  e.y_pct,
  case
    when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
      or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
    then round(100 - e.x_pct, 2)
    else e.x_pct
  end as x_pct_normalizado,
  case
    when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
      or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
    then round(100 - e.y_pct, 2)
    else e.y_pct
  end as y_pct_normalizado,
  e.minuto,
  e.player_id,
  least(5, greatest(0, floor(
    (case
      when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
        or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
      then 100 - e.x_pct
      else e.x_pct
    end) / 100.0 * 6
  )::int)) as zona_col,
  least(3, greatest(0, floor(
    (case
      when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
        or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
      then 100 - e.y_pct
      else e.y_pct
    end) / 100.0 * 4
  )::int)) as zona_row,
  e.goal_id
from events e
join matches m on m.id = e.match_id;

-- A view corre com as permissões de quem a consulta, não do dono,
-- para respeitar a RLS já definida em "events" e "matches".
alter view events_normalizado set (security_invoker = true);

grant select on events_normalizado to authenticated;

-- Criar uma equipa: cria a equipa e torna o criador "owner", numa operação atómica
create or replace function create_team(p_nome text)
returns teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams;
  v_code text;
begin
  v_code := upper(substr(md5(random()::text), 1, 6));
  insert into teams (nome, join_code, created_by) values (p_nome, v_code, auth.uid())
  returning * into v_team;
  insert into team_members (team_id, user_id, role) values (v_team.id, auth.uid(), 'owner');
  return v_team;
end;
$$;

-- Entrar numa equipa através do código de convite
create or replace function join_team_by_code(p_code text)
returns teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  select * into v_team from teams where join_code = upper(p_code);
  if not found then
    raise exception 'Código de equipa inválido';
  end if;
  insert into team_members (team_id, user_id, role)
    values (v_team.id, auth.uid(), 'membro')
    on conflict (team_id, user_id) do nothing;
  return v_team;
end;
$$;

grant execute on function create_team(text) to authenticated;
grant execute on function join_team_by_code(text) to authenticated;

-- Submissão do questionário de wellness: identifica o jogador pelo
-- próprio auth.uid() (nunca recebe o player_id do cliente), e usa a
-- unique (player_id, data) para impedir mais de uma resposta por dia,
-- com mensagem amigável em vez do erro de constraint em bruto.
create or replace function submit_wellness(
  p_dores_musculares int, p_stress int, p_fadiga int, p_sono int, p_peso numeric default null
)
returns wellness_responses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players;
  v_row wellness_responses;
begin
  select * into v_player from players where auth_user_id = auth.uid();
  if not found then
    raise exception 'Conta não associada a nenhum jogador.';
  end if;

  insert into wellness_responses (team_id, player_id, dores_musculares, stress, fadiga, sono, peso)
  values (v_player.team_id, v_player.id, p_dores_musculares, p_stress, p_fadiga, p_sono, p_peso)
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'Já respondeste ao questionário hoje.';
end;
$$;

grant execute on function submit_wellness(int, int, int, int, numeric) to authenticated;

-- Só o peso pode ser atualizado depois de enviado o questionário do dia
-- (ex: pesagem antes/depois do treino) — os restantes campos ficam fixos.
create or replace function update_wellness_peso(p_peso numeric)
returns wellness_responses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players;
  v_row wellness_responses;
begin
  select * into v_player from players where auth_user_id = auth.uid();
  if not found then
    raise exception 'Conta não associada a nenhum jogador.';
  end if;

  update wellness_responses
    set peso = p_peso
    where player_id = v_player.id and data = current_date
    returning * into v_row;

  if not found then
    raise exception 'Ainda não respondeste ao questionário de hoje.';
  end if;

  return v_row;
end;
$$;

grant execute on function update_wellness_peso(numeric) to authenticated;

-- ---------- Emblema da equipa (Supabase Storage) ----------

insert into storage.buckets (id, name, public)
values ('team-logos', 'team-logos', true)
on conflict (id) do nothing;

-- Qualquer pessoa pode ver os emblemas (bucket público)
create policy "team_logos_public_read" on storage.objects
  for select using (bucket_id = 'team-logos');

-- Só um membro da equipa pode enviar/substituir o emblema dessa equipa
-- (o ficheiro deve ser guardado no caminho "<team_id>/nome-ficheiro")
create policy "team_logos_member_write" on storage.objects
  for insert
  with check (
    bucket_id = 'team-logos'
    and exists (
      select 1 from team_members tm
      where tm.team_id = (storage.foldername(name))[1]::uuid
      and tm.user_id = auth.uid()
    )
  );

create policy "team_logos_member_update" on storage.objects
  for update
  using (
    bucket_id = 'team-logos'
    and exists (
      select 1 from team_members tm
      where tm.team_id = (storage.foldername(name))[1]::uuid
      and tm.user_id = auth.uid()
    )
  );

-- ---------- Calendário do campeonato (Zona Norte, sem login) ----------
-- Página própria (pages/calendario-jogos.html): não tem team_id nem
-- user_id, não aparece no dashboard, e é acedida sem conta — só com um
-- código de acesso partilhado. Por isso as duas tabelas abaixo têm RLS
-- ativa e SEM NENHUMA policy; todo o acesso passa pelas funções
-- competition_list_matches()/competition_set_zerozero_link()/etc (SECURITY
-- DEFINER), que validam o código (hash bcrypt via pgcrypto) antes de tocar
-- nos dados.

create table if not exists competition_matches (
  id uuid primary key default gen_random_uuid(),
  zona text not null default 'Norte',
  jornada int not null,
  data date not null,
  hora time,
  equipa_casa text not null,
  equipa_fora text not null,
  -- obsoleta: um jogo pode ter vários vídeos, ver competition_match_videos.
  -- Fica na tabela sem ser lida/escrita, para não perder nada já gravado.
  video_url text,
  zerozero_url text,
  created_at timestamptz not null default now(),
  unique (jornada, equipa_casa, equipa_fora)
);

create index if not exists idx_competition_matches_jornada on competition_matches(zona, jornada);

alter table competition_matches enable row level security;

-- Uma única linha (id sempre 1): guarda o hash do código de acesso.
create table if not exists competition_access (
  id int primary key default 1,
  code_hash text not null,
  constraint competition_access_single_row check (id = 1)
);

alter table competition_access enable row level security;

-- Vários links de vídeo por jogo (ex: câmaras diferentes) — um registo por link.
create table if not exists competition_match_videos (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references competition_matches(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_competition_match_videos_match on competition_match_videos(match_id);

alter table competition_match_videos enable row level security;

insert into competition_access (id, code_hash)
values (1, crypt('MUDA-ISTO', gen_salt('bf')))
on conflict (id) do nothing;

create or replace function competition_list_matches(p_code text)
returns setof competition_matches
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from competition_access where id = 1 and code_hash = crypt(p_code, code_hash)
  ) then
    raise exception 'Código inválido';
  end if;
  return query select * from competition_matches order by jornada, data, hora;
end;
$$;

create or replace function competition_list_videos(p_code text)
returns setof competition_match_videos
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from competition_access where id = 1 and code_hash = crypt(p_code, code_hash)
  ) then
    raise exception 'Código inválido';
  end if;
  return query select * from competition_match_videos order by created_at;
end;
$$;

create or replace function competition_add_video_link(p_code text, p_match_id uuid, p_url text)
returns competition_match_videos
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row competition_match_videos;
begin
  if not exists (
    select 1 from competition_access where id = 1 and code_hash = crypt(p_code, code_hash)
  ) then
    raise exception 'Código inválido';
  end if;
  if trim(coalesce(p_url, '')) = '' then
    raise exception 'Link vazio';
  end if;
  insert into competition_match_videos (match_id, url)
    values (p_match_id, trim(p_url))
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function competition_delete_video_link(p_code text, p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from competition_access where id = 1 and code_hash = crypt(p_code, code_hash)
  ) then
    raise exception 'Código inválido';
  end if;
  delete from competition_match_videos where id = p_link_id;
end;
$$;

create or replace function competition_set_zerozero_link(p_code text, p_id uuid, p_url text)
returns competition_matches
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row competition_matches;
begin
  if not exists (
    select 1 from competition_access where id = 1 and code_hash = crypt(p_code, code_hash)
  ) then
    raise exception 'Código inválido';
  end if;
  update competition_matches
    set zerozero_url = nullif(trim(coalesce(p_url, '')), '')
    where id = p_id
    returning * into v_row;
  return v_row;
end;
$$;

grant execute on function competition_list_matches(text) to anon, authenticated;
grant execute on function competition_list_videos(text) to anon, authenticated;
grant execute on function competition_add_video_link(text, uuid, text) to anon, authenticated;
grant execute on function competition_delete_video_link(text, uuid) to anon, authenticated;
grant execute on function competition_set_zerozero_link(text, uuid, text) to anon, authenticated;

-- Jogos da Zona Norte, jornadas 1 a 26 (jornada 14 = 1ª jornada da 2ª volta),
-- extraídos do Comunicado Oficial N.037 da AF Aveiro (época 2026/2027).
insert into competition_matches (jornada, data, hora, equipa_casa, equipa_fora) values
  (1, '2026-10-11', '15:30', 'UD Mansores', 'Romariz FC'),
  (1, '2026-10-10', '15:30', 'Real Cl. Nogueirense', 'Canedo FC'),
  (1, '2026-10-11', '15:30', 'ACRD Mosteirô', 'ADC Sanguedo'),
  (1, '2026-10-10', '15:30', 'A. D. Nogueira Da Regedoura', 'FC Macieirense'),
  (1, '2026-10-11', '15:30', 'GD Ronda', 'Ad Sanjoanense - Futebol Sad "B"'),
  (1, '2026-10-11', '15:30', 'A.C. Cucujães', 'SC Paivense'),
  (1, '2026-10-11', '15:30', 'CD Arrifanense', 'SC Esmoriz - Futebol SDQ'),
  (2, '2026-10-18', '15:30', 'Romariz FC', 'CD Arrifanense'),
  (2, '2026-10-18', '15:30', 'Canedo FC', 'UD Mansores'),
  (2, '2026-10-18', '15:30', 'ADC Sanguedo', 'Real Cl. Nogueirense'),
  (2, '2026-10-18', '15:30', 'FC Macieirense', 'ACRD Mosteirô'),
  (2, '2026-10-18', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'A. D. Nogueira Da Regedoura'),
  (2, '2026-10-18', '15:30', 'SC Paivense', 'GD Ronda'),
  (2, '2026-10-18', '15:30', 'SC Esmoriz - Futebol SDQ', 'A.C. Cucujães'),
  (3, '2026-10-25', '15:30', 'Romariz FC', 'Canedo FC'),
  (3, '2026-10-25', '15:30', 'UD Mansores', 'ADC Sanguedo'),
  (3, '2026-10-24', '15:30', 'Real Cl. Nogueirense', 'FC Macieirense'),
  (3, '2026-10-25', '15:30', 'ACRD Mosteirô', 'Ad Sanjoanense - Futebol Sad "B"'),
  (3, '2026-10-24', '15:30', 'A. D. Nogueira Da Regedoura', 'SC Paivense'),
  (3, '2026-10-25', '15:30', 'GD Ronda', 'SC Esmoriz - Futebol SDQ'),
  (3, '2026-10-25', '15:30', 'CD Arrifanense', 'A.C. Cucujães'),
  (4, '2026-11-01', '15:30', 'Canedo FC', 'CD Arrifanense'),
  (4, '2026-11-01', '15:30', 'ADC Sanguedo', 'Romariz FC'),
  (4, '2026-11-01', '15:30', 'FC Macieirense', 'UD Mansores'),
  (4, '2026-11-01', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'Real Cl. Nogueirense'),
  (4, '2026-11-01', '15:30', 'SC Paivense', 'ACRD Mosteirô'),
  (4, '2026-11-01', '15:30', 'SC Esmoriz - Futebol SDQ', 'A. D. Nogueira Da Regedoura'),
  (4, '2026-11-01', '15:30', 'A.C. Cucujães', 'GD Ronda'),
  (5, '2026-11-08', '15:30', 'Canedo FC', 'ADC Sanguedo'),
  (5, '2026-11-08', '15:30', 'Romariz FC', 'FC Macieirense'),
  (5, '2026-11-08', '15:30', 'UD Mansores', 'Ad Sanjoanense - Futebol Sad "B"'),
  (5, '2026-11-07', '15:30', 'Real Cl. Nogueirense', 'SC Paivense'),
  (5, '2026-11-08', '15:30', 'ACRD Mosteirô', 'SC Esmoriz - Futebol SDQ'),
  (5, '2026-11-07', '15:30', 'A. D. Nogueira Da Regedoura', 'A.C. Cucujães'),
  (5, '2026-11-08', '15:30', 'CD Arrifanense', 'GD Ronda'),
  (6, '2026-11-15', '15:30', 'ADC Sanguedo', 'CD Arrifanense'),
  (6, '2026-11-15', '15:30', 'FC Macieirense', 'Canedo FC'),
  (6, '2026-11-15', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'Romariz FC'),
  (6, '2026-11-15', '15:30', 'SC Paivense', 'UD Mansores'),
  (6, '2026-11-15', '15:30', 'SC Esmoriz - Futebol SDQ', 'Real Cl. Nogueirense'),
  (6, '2026-11-15', '15:30', 'A.C. Cucujães', 'ACRD Mosteirô'),
  (6, '2026-11-15', '15:30', 'GD Ronda', 'A. D. Nogueira Da Regedoura'),
  (7, '2026-11-22', '15:30', 'ADC Sanguedo', 'FC Macieirense'),
  (7, '2026-11-22', '15:30', 'Canedo FC', 'Ad Sanjoanense - Futebol Sad "B"'),
  (7, '2026-11-22', '15:30', 'Romariz FC', 'SC Paivense'),
  (7, '2026-11-22', '15:30', 'UD Mansores', 'SC Esmoriz - Futebol SDQ'),
  (7, '2026-11-21', '15:30', 'Real Cl. Nogueirense', 'A.C. Cucujães'),
  (7, '2026-11-22', '15:30', 'ACRD Mosteirô', 'GD Ronda'),
  (7, '2026-11-22', '15:30', 'CD Arrifanense', 'A. D. Nogueira Da Regedoura'),
  (8, '2026-12-06', '15:30', 'FC Macieirense', 'CD Arrifanense'),
  (8, '2026-12-06', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'ADC Sanguedo'),
  (8, '2026-12-06', '15:30', 'SC Paivense', 'Canedo FC'),
  (8, '2026-12-06', '15:30', 'SC Esmoriz - Futebol SDQ', 'Romariz FC'),
  (8, '2026-12-06', '15:30', 'A.C. Cucujães', 'UD Mansores'),
  (8, '2026-12-06', '15:30', 'GD Ronda', 'Real Cl. Nogueirense'),
  (8, '2026-12-05', '15:30', 'A. D. Nogueira Da Regedoura', 'ACRD Mosteirô'),
  (9, '2026-12-13', '15:30', 'FC Macieirense', 'Ad Sanjoanense - Futebol Sad "B"'),
  (9, '2026-12-13', '15:30', 'ADC Sanguedo', 'SC Paivense'),
  (9, '2026-12-13', '15:30', 'Canedo FC', 'SC Esmoriz - Futebol SDQ'),
  (9, '2026-12-13', '15:30', 'Romariz FC', 'A.C. Cucujães'),
  (9, '2026-12-13', '15:30', 'UD Mansores', 'GD Ronda'),
  (9, '2026-12-12', '15:30', 'Real Cl. Nogueirense', 'A. D. Nogueira Da Regedoura'),
  (9, '2026-12-13', '15:30', 'CD Arrifanense', 'ACRD Mosteirô'),
  (10, '2027-01-03', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'CD Arrifanense'),
  (10, '2027-01-03', '15:30', 'SC Paivense', 'FC Macieirense'),
  (10, '2027-01-03', '15:30', 'SC Esmoriz - Futebol SDQ', 'ADC Sanguedo'),
  (10, '2027-01-03', '15:30', 'A.C. Cucujães', 'Canedo FC'),
  (10, '2027-01-03', '15:30', 'GD Ronda', 'Romariz FC'),
  (10, '2027-01-02', '15:30', 'A. D. Nogueira Da Regedoura', 'UD Mansores'),
  (10, '2027-01-03', '15:30', 'ACRD Mosteirô', 'Real Cl. Nogueirense'),
  (11, '2027-01-10', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'SC Paivense'),
  (11, '2027-01-10', '15:30', 'FC Macieirense', 'SC Esmoriz - Futebol SDQ'),
  (11, '2027-01-10', '15:30', 'ADC Sanguedo', 'A.C. Cucujães'),
  (11, '2027-01-10', '15:30', 'Canedo FC', 'GD Ronda'),
  (11, '2027-01-10', '15:30', 'Romariz FC', 'A. D. Nogueira Da Regedoura'),
  (11, '2027-01-10', '15:30', 'UD Mansores', 'ACRD Mosteirô'),
  (11, '2027-01-10', '15:30', 'CD Arrifanense', 'Real Cl. Nogueirense'),
  (12, '2027-01-17', '15:30', 'CD Arrifanense', 'SC Paivense'),
  (12, '2027-01-17', '15:30', 'SC Esmoriz - Futebol SDQ', 'Ad Sanjoanense - Futebol Sad "B"'),
  (12, '2027-01-17', '15:30', 'A.C. Cucujães', 'FC Macieirense'),
  (12, '2027-01-17', '15:30', 'GD Ronda', 'ADC Sanguedo'),
  (12, '2027-01-16', '15:30', 'A. D. Nogueira Da Regedoura', 'Canedo FC'),
  (12, '2027-01-17', '15:30', 'ACRD Mosteirô', 'Romariz FC'),
  (12, '2027-01-16', '15:30', 'Real Cl. Nogueirense', 'UD Mansores'),
  (13, '2027-01-24', '15:30', 'SC Paivense', 'SC Esmoriz - Futebol SDQ'),
  (13, '2027-01-24', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'A.C. Cucujães'),
  (13, '2027-01-24', '15:30', 'FC Macieirense', 'GD Ronda'),
  (13, '2027-01-24', '15:30', 'ADC Sanguedo', 'A. D. Nogueira Da Regedoura'),
  (13, '2027-01-24', '15:30', 'Canedo FC', 'ACRD Mosteirô'),
  (13, '2027-01-24', '15:30', 'Romariz FC', 'Real Cl. Nogueirense'),
  (13, '2027-01-24', '15:30', 'UD Mansores', 'CD Arrifanense'),
  (14, '2027-01-31', '15:30', 'Romariz FC', 'UD Mansores'),
  (14, '2027-01-31', '15:30', 'Canedo FC', 'Real Cl. Nogueirense'),
  (14, '2027-01-31', '15:30', 'ADC Sanguedo', 'ACRD Mosteirô'),
  (14, '2027-01-31', '15:30', 'FC Macieirense', 'A. D. Nogueira Da Regedoura'),
  (14, '2027-01-31', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'GD Ronda'),
  (14, '2027-01-31', '15:30', 'SC Paivense', 'A.C. Cucujães'),
  (14, '2027-01-31', '15:30', 'SC Esmoriz - Futebol SDQ', 'CD Arrifanense'),
  (15, '2027-02-14', '15:30', 'CD Arrifanense', 'Romariz FC'),
  (15, '2027-02-14', '15:30', 'UD Mansores', 'Canedo FC'),
  (15, '2027-02-13', '15:30', 'Real Cl. Nogueirense', 'ADC Sanguedo'),
  (15, '2027-02-14', '15:30', 'ACRD Mosteirô', 'FC Macieirense'),
  (15, '2027-02-13', '15:30', 'A. D. Nogueira Da Regedoura', 'Ad Sanjoanense - Futebol Sad "B"'),
  (15, '2027-02-14', '15:30', 'GD Ronda', 'SC Paivense'),
  (15, '2027-02-14', '15:30', 'A.C. Cucujães', 'SC Esmoriz - Futebol SDQ'),
  (16, '2027-02-21', '15:30', 'Canedo FC', 'Romariz FC'),
  (16, '2027-02-21', '15:30', 'ADC Sanguedo', 'UD Mansores'),
  (16, '2027-02-21', '15:30', 'FC Macieirense', 'Real Cl. Nogueirense'),
  (16, '2027-02-21', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'ACRD Mosteirô'),
  (16, '2027-02-21', '15:30', 'SC Paivense', 'A. D. Nogueira Da Regedoura'),
  (16, '2027-02-21', '15:30', 'SC Esmoriz - Futebol SDQ', 'GD Ronda'),
  (16, '2027-02-21', '15:30', 'A.C. Cucujães', 'CD Arrifanense'),
  (17, '2027-02-28', '15:30', 'CD Arrifanense', 'Canedo FC'),
  (17, '2027-02-28', '15:30', 'Romariz FC', 'ADC Sanguedo'),
  (17, '2027-02-28', '15:30', 'UD Mansores', 'FC Macieirense'),
  (17, '2027-02-27', '15:30', 'Real Cl. Nogueirense', 'Ad Sanjoanense - Futebol Sad "B"'),
  (17, '2027-02-28', '15:30', 'ACRD Mosteirô', 'SC Paivense'),
  (17, '2027-02-27', '15:30', 'A. D. Nogueira Da Regedoura', 'SC Esmoriz - Futebol SDQ'),
  (17, '2027-02-28', '15:30', 'GD Ronda', 'A.C. Cucujães'),
  (18, '2027-03-07', '15:30', 'ADC Sanguedo', 'Canedo FC'),
  (18, '2027-03-07', '15:30', 'FC Macieirense', 'Romariz FC'),
  (18, '2027-03-07', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'UD Mansores'),
  (18, '2027-03-07', '15:30', 'SC Paivense', 'Real Cl. Nogueirense'),
  (18, '2027-03-07', '15:30', 'SC Esmoriz - Futebol SDQ', 'ACRD Mosteirô'),
  (18, '2027-03-07', '15:30', 'A.C. Cucujães', 'A. D. Nogueira Da Regedoura'),
  (18, '2027-03-07', '15:30', 'GD Ronda', 'CD Arrifanense'),
  (19, '2027-03-14', '15:30', 'CD Arrifanense', 'ADC Sanguedo'),
  (19, '2027-03-14', '15:30', 'Canedo FC', 'FC Macieirense'),
  (19, '2027-03-14', '15:30', 'Romariz FC', 'Ad Sanjoanense - Futebol Sad "B"'),
  (19, '2027-03-14', '15:30', 'UD Mansores', 'SC Paivense'),
  (19, '2027-03-13', '15:30', 'Real Cl. Nogueirense', 'SC Esmoriz - Futebol SDQ'),
  (19, '2027-03-14', '15:30', 'ACRD Mosteirô', 'A.C. Cucujães'),
  (19, '2027-03-13', '15:30', 'A. D. Nogueira Da Regedoura', 'GD Ronda'),
  (20, '2027-03-21', '15:30', 'FC Macieirense', 'ADC Sanguedo'),
  (20, '2027-03-21', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'Canedo FC'),
  (20, '2027-03-21', '15:30', 'SC Paivense', 'Romariz FC'),
  (20, '2027-03-21', '15:30', 'SC Esmoriz - Futebol SDQ', 'UD Mansores'),
  (20, '2027-03-21', '15:30', 'A.C. Cucujães', 'Real Cl. Nogueirense'),
  (20, '2027-03-21', '15:30', 'GD Ronda', 'ACRD Mosteirô'),
  (20, '2027-03-20', '15:30', 'A. D. Nogueira Da Regedoura', 'CD Arrifanense'),
  (21, '2027-04-04', '16:00', 'CD Arrifanense', 'FC Macieirense'),
  (21, '2027-04-04', '16:00', 'ADC Sanguedo', 'Ad Sanjoanense - Futebol Sad "B"'),
  (21, '2027-04-04', '16:00', 'Canedo FC', 'SC Paivense'),
  (21, '2027-04-04', '16:00', 'Romariz FC', 'SC Esmoriz - Futebol SDQ'),
  (21, '2027-04-04', '16:00', 'UD Mansores', 'A.C. Cucujães'),
  (21, '2027-04-03', '16:00', 'Real Cl. Nogueirense', 'GD Ronda'),
  (21, '2027-04-04', '16:00', 'ACRD Mosteirô', 'A. D. Nogueira Da Regedoura'),
  (22, '2027-04-11', '16:00', 'Ad Sanjoanense - Futebol Sad "B"', 'FC Macieirense'),
  (22, '2027-04-11', '16:00', 'SC Paivense', 'ADC Sanguedo'),
  (22, '2027-04-11', '16:00', 'SC Esmoriz - Futebol SDQ', 'Canedo FC'),
  (22, '2027-04-11', '16:00', 'A.C. Cucujães', 'Romariz FC'),
  (22, '2027-04-11', '16:00', 'GD Ronda', 'UD Mansores'),
  (22, '2027-04-10', '16:00', 'A. D. Nogueira Da Regedoura', 'Real Cl. Nogueirense'),
  (22, '2027-04-11', '16:00', 'ACRD Mosteirô', 'CD Arrifanense'),
  (23, '2027-04-18', '16:00', 'CD Arrifanense', 'Ad Sanjoanense - Futebol Sad "B"'),
  (23, '2027-04-18', '16:00', 'FC Macieirense', 'SC Paivense'),
  (23, '2027-04-18', '16:00', 'ADC Sanguedo', 'SC Esmoriz - Futebol SDQ'),
  (23, '2027-04-18', '16:00', 'Canedo FC', 'A.C. Cucujães'),
  (23, '2027-04-18', '16:00', 'Romariz FC', 'GD Ronda'),
  (23, '2027-04-18', '16:00', 'UD Mansores', 'A. D. Nogueira Da Regedoura'),
  (23, '2027-04-17', '16:00', 'Real Cl. Nogueirense', 'ACRD Mosteirô'),
  (24, '2027-04-25', '16:00', 'SC Paivense', 'Ad Sanjoanense - Futebol Sad "B"'),
  (24, '2027-04-25', '16:00', 'SC Esmoriz - Futebol SDQ', 'FC Macieirense'),
  (24, '2027-04-25', '16:00', 'A.C. Cucujães', 'ADC Sanguedo'),
  (24, '2027-04-25', '16:00', 'GD Ronda', 'Canedo FC'),
  (24, '2027-04-24', '16:00', 'A. D. Nogueira Da Regedoura', 'Romariz FC'),
  (24, '2027-04-25', '16:00', 'ACRD Mosteirô', 'UD Mansores'),
  (24, '2027-04-24', '16:00', 'Real Cl. Nogueirense', 'CD Arrifanense'),
  (25, '2027-05-02', '16:00', 'SC Paivense', 'CD Arrifanense'),
  (25, '2027-05-02', '16:00', 'Ad Sanjoanense - Futebol Sad "B"', 'SC Esmoriz - Futebol SDQ'),
  (25, '2027-05-02', '16:00', 'FC Macieirense', 'A.C. Cucujães'),
  (25, '2027-05-02', '16:00', 'ADC Sanguedo', 'GD Ronda'),
  (25, '2027-05-02', '16:00', 'Canedo FC', 'A. D. Nogueira Da Regedoura'),
  (25, '2027-05-02', '16:00', 'Romariz FC', 'ACRD Mosteirô'),
  (25, '2027-05-02', '16:00', 'UD Mansores', 'Real Cl. Nogueirense'),
  (26, '2027-05-09', '17:00', 'SC Esmoriz - Futebol SDQ', 'SC Paivense'),
  (26, '2027-05-09', '17:00', 'A.C. Cucujães', 'Ad Sanjoanense - Futebol Sad "B"'),
  (26, '2027-05-09', '17:00', 'GD Ronda', 'FC Macieirense'),
  (26, '2027-05-09', '17:00', 'A. D. Nogueira Da Regedoura', 'ADC Sanguedo'),
  (26, '2027-05-09', '17:00', 'ACRD Mosteirô', 'Canedo FC'),
  (26, '2027-05-09', '17:00', 'Real Cl. Nogueirense', 'Romariz FC'),
  (26, '2027-05-09', '17:00', 'CD Arrifanense', 'UD Mansores')
on conflict (jornada, equipa_casa, equipa_fora) do nothing;

notify pgrst, 'reload schema';
