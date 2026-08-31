-- Análise de Jogo — migração incremental: golos ligados a eventos do Registo de Jogo
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 020_wellness_rpe.sql).
--
-- Versão: 1.0 (2026-08-31)
--
-- Cada golo passa a ser um registo próprio (não só o número em
-- match_players.golo), para poder ligar-se a um ou mais eventos do Registo
-- de Jogo que lhe deram origem (ex: um cruzamento e o remate que resultou
-- em golo). O contador em match_players.golo mantém-se como está — é
-- atualizado em paralelo, pela app, sempre que um golo é criado ou
-- removido (não há trigger; ver js/match.js).

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  parte int check (parte in (1, 2)),
  minuto int,
  created_at timestamptz not null default now()
);

-- Um evento (cruzamento, remate, ...) só pode ter contribuído para, no
-- máximo, um golo — por isso é uma FK direta em "events", e não uma tabela
-- de junção. "on delete set null": apagar o golo desliga os eventos que
-- lhe estavam associados, sem os apagar.
alter table events add column if not exists goal_id uuid references goals(id) on delete set null;

create index if not exists idx_goals_match on goals(match_id);
create index if not exists idx_events_goal on events(goal_id);

alter table goals enable row level security;

create policy "goals_team_member" on goals
  for all
  using (exists (select 1 from team_members tm where tm.team_id = goals.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = goals.team_id and tm.user_id = auth.uid()));
