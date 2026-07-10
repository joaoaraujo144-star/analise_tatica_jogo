-- Análise de Jogo — migração incremental: histórico de ações por jogador
-- Corre este script uma vez no SQL Editor do teu projeto Supabase.
--
-- Cada clique na convocatória (cartões, assistências, golos, estado,
-- substituição) passa a ficar registado aqui com data/hora, além de
-- atualizar os totais em match_players como já acontecia.

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

create index if not exists idx_player_events_match on player_events(match_id);
create index if not exists idx_player_events_player on player_events(player_id);
create index if not exists idx_player_events_team on player_events(team_id);

alter table player_events enable row level security;

drop policy if exists "player_events_team_member" on player_events;
create policy "player_events_team_member" on player_events
  for all
  using (exists (select 1 from team_members tm where tm.team_id = player_events.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = player_events.team_id and tm.user_id = auth.uid()));
