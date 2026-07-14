-- Análise de Jogo — esquema Supabase completo
-- Corre este script uma vez no SQL Editor de um projeto Supabase novo.
-- (Se já tinhas um projeto com o esquema antigo, usa antes, por ordem,
-- todos os ficheiros em supabase/migrations/, do 001 ao 011.)

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
  created_at timestamptz not null default now()
);

-- Convocatória + estatísticas de um jogador num jogo específico
create table if not exists match_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  estado text not null default 'Suplente' check (estado in ('Titular', 'Suplente')),
  amarelo int not null default 0,
  amarelo2 int not null default 0,
  vermelho int not null default 0,
  assistencias int not null default 0,
  golo int not null default 0,
  substituicao text check (substituicao in ('Saiu', 'Entrou')),
  unique (match_id, player_id)
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

-- Índices para as queries mais comuns
create index if not exists idx_players_team on players(team_id);
create index if not exists idx_matches_team on matches(team_id);
create index if not exists idx_match_players_match on match_players(match_id);
create index if not exists idx_match_players_player on match_players(player_id);
create index if not exists idx_match_players_team on match_players(team_id);
create index if not exists idx_events_match_tracker on events(match_id, tracker_id);
create index if not exists idx_events_team on events(team_id);
create index if not exists idx_player_events_match on player_events(match_id);
create index if not exists idx_player_events_player on player_events(player_id);
create index if not exists idx_player_events_team on player_events(team_id);

-- Row Level Security
alter table teams enable row level security;
alter table team_members enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table events enable row level security;
alter table player_events enable row level security;

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

create policy "matches_team_member" on matches
  for all
  using (exists (select 1 from team_members tm where tm.team_id = matches.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = matches.team_id and tm.user_id = auth.uid()));

create policy "match_players_team_member" on match_players
  for all
  using (exists (select 1 from team_members tm where tm.team_id = match_players.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = match_players.team_id and tm.user_id = auth.uid()));

create policy "events_team_member" on events
  for all
  using (exists (select 1 from team_members tm where tm.team_id = events.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = events.team_id and tm.user_id = auth.uid()));

create policy "player_events_team_member" on player_events
  for all
  using (exists (select 1 from team_members tm where tm.team_id = player_events.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = player_events.team_id and tm.user_id = auth.uid()));

-- View: Registo de Jogo normalizado (1ª + 2ª parte juntas, rodadas 180º
-- conforme a orientação de ataque escolhida nas setas para cada parte)
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
  e.minuto
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
