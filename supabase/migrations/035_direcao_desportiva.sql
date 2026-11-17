-- Análise de Jogo — supabase/migrations/035_direcao_desportiva.sql
-- Base de dados do Dashboard Executivo (Direção Desportiva,
-- pages/direcao.html). Só acrescenta — nenhuma coluna existente muda,
-- nenhuma linha é apagada. Todas as colunas novas aceitam null
-- ("desconhecido"), por isso jogos/jogadores antigos continuam válidos.
--
-- Corre isto uma vez no SQL Editor de um projeto já existente (depois de
-- 034_match_players_minutos.sql).
--
-- Versão: 1.0 (2026-11-17)

-- ---------- matches: contexto competitivo + estado da codificação ----------
-- A época NÃO tem coluna: deriva-se de "data" (julho→junho, ver
-- epocaDe() em js/direcao/metricas.js) — guardá-la seria duplicar.
alter table matches
  add column if not exists local text check (local in ('casa', 'fora')),
  add column if not exists competicao text,
  -- 'completa' / 'parcial' / null (não indicado). Só um jogo marcado
  -- 'completa' permite tratar "nenhum evento" como zero — num jogo
  -- parcial ou sem indicação, ausência de eventos não é zero.
  add column if not exists codificacao text check (codificacao in ('completa', 'parcial'));

-- ---------- players: posições ----------
alter table players
  add column if not exists posicao text,
  add column if not exists posicoes_secundarias text[] not null default '{}';

-- ---------- Mínimo desejado de jogadores por posição ----------
create table if not exists posicao_minimos (
  team_id uuid not null references teams(id) on delete cascade,
  posicao text not null,
  minimo int not null check (minimo >= 0),
  primary key (team_id, posicao)
);
alter table posicao_minimos enable row level security;
create policy "posicao_minimos_team_member" on posicao_minimos
  for all
  using (exists (select 1 from team_members tm where tm.team_id = posicao_minimos.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = posicao_minimos.team_id and tm.user_id = auth.uid()));

-- ---------- Alertas: limites e direção favorável por indicador ----------
-- "direcao": qual o sentido bom do indicador ('subir' = mais é melhor,
-- 'descer' = menos é melhor) — nunca assumido, sempre configurado.
-- "limite_pct": variação percentual (em valor absoluto) a partir da qual
-- uma evolução no sentido mau gera alerta.
create table if not exists kpi_targets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  indicador text not null,
  direcao text not null check (direcao in ('subir', 'descer')),
  limite_pct numeric not null check (limite_pct >= 0),
  gravidade text not null default 'media' check (gravidade in ('baixa', 'media', 'alta')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (team_id, indicador)
);
alter table kpi_targets enable row level security;
create policy "kpi_targets_team_member" on kpi_targets
  for all
  using (exists (select 1 from team_members tm where tm.team_id = kpi_targets.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = kpi_targets.team_id and tm.user_id = auth.uid()));

-- ---------- Registo de decisões ----------
create table if not exists decisoes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  data date not null default current_date,
  diagnostico text not null,
  recomendacao text,
  responsavel text,
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  estado text not null default 'aberta' check (estado in ('aberta', 'em_curso', 'concluida', 'cancelada')),
  resultado text,
  created_at timestamptz not null default now()
);
create index if not exists idx_decisoes_team_data on decisoes(team_id, data desc);
alter table decisoes enable row level security;
create policy "decisoes_team_member" on decisoes
  for all
  using (exists (select 1 from team_members tm where tm.team_id = decisoes.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = decisoes.team_id and tm.user_id = auth.uid()));

-- ---------- events_normalizado: + terço e corredor ----------
-- Calculados aqui (não no browser), como zona_col/zona_row — mesma
-- razão: uma só definição, consultável por SQL. Depois da normalização
-- a equipa ataca sempre da esquerda para a direita, por isso:
--   terço   — x < 33.33 defensivo, < 66.67 intermédio, resto ofensivo;
--   corredor — y < 33.33 esquerdo, < 66.67 central, resto direito
--              (a atacar para a direita, a esquerda da equipa é o topo
--              do campo no ecrã, y pequeno).
-- Colunas novas só no fim da lista: "create or replace view" não deixa
-- mudar a posição das que já existem.
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
  e.goal_id,
  case
    when (case
            when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
              or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
            then 100 - e.x_pct else e.x_pct end) < 100.0 / 3 then 'defensivo'
    when (case
            when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
              or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
            then 100 - e.x_pct else e.x_pct end) < 200.0 / 3 then 'intermedio'
    else 'ofensivo'
  end as terco,
  case
    when (case
            when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
              or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
            then 100 - e.y_pct else e.y_pct end) < 100.0 / 3 then 'esquerdo'
    when (case
            when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
              or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
            then 100 - e.y_pct else e.y_pct end) < 200.0 / 3 then 'central'
    else 'direito'
  end as corredor
from events e
join matches m on m.id = e.match_id;

alter view events_normalizado set (security_invoker = true);
grant select on events_normalizado to authenticated;

-- ---------- v_jogo_resumo: uma linha por jogo ----------
-- Golos vêm de "goals" (fonte fiável, um registo por golo). Como a
-- tabela só existe desde 021 (sofridos desde 023), um jogo antigo pode
-- não ter as linhas — "golos_consistentes" compara com o contador
-- match_players.golo: se divergirem, o resultado não é fiável e o
-- dashboard mostra-o como indisponível em vez de inventar um 0-0.
-- minutos_jogo é null se faltar o início/fim de alguma parte.
create or replace view v_jogo_resumo as
select
  m.id,
  m.team_id,
  m.data,
  m.adversario,
  m.local,
  m.competicao,
  m.pre_epoca,
  m.codificacao,
  (m.parte2_fim is not null) as terminado,
  case
    when m.parte1_inicio is null or m.parte1_fim is null
      or m.parte2_inicio is null or m.parte2_fim is null then null
    else round(extract(epoch from (m.parte1_fim - m.parte1_inicio)) / 60
             + extract(epoch from (m.parte2_fim - m.parte2_inicio)) / 60)::int
  end as minutos_jogo,
  coalesce(g.marcados, 0) as golos_marcados,
  coalesce(g.sofridos, 0) as golos_sofridos,
  (coalesce(g.marcados, 0) = coalesce(mp.golos_contador, 0)) as golos_consistentes
from matches m
left join (
  select match_id,
         count(*) filter (where tipo = 'marcado') as marcados,
         count(*) filter (where tipo = 'sofrido') as sofridos
  from goals group by match_id
) g on g.match_id = m.id
left join (
  select match_id, sum(golo) as golos_contador
  from match_players group by match_id
) mp on mp.match_id = m.id;

alter view v_jogo_resumo set (security_invoker = true);
grant select on v_jogo_resumo to authenticated;

notify pgrst, 'reload schema';
