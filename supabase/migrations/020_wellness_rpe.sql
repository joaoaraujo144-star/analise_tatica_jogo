-- Análise de Jogo — migração incremental: RPE (perceção de esforço), só treinador
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 019_match_players_numero.sql).
--
-- Versão: 1.0 (2026-08-31)
--
-- RPE (Rate of Perceived Exertion, 1-10) preenchido apenas pelo treinador —
-- ao contrário dos outros campos de wellness, nunca deve ser visível para o
-- jogador. Por isso vive numa tabela própria (não numa coluna em
-- wellness_responses, que o jogador já pode ler na íntegra), sem nenhuma
-- policy de RLS para o jogador — só quem for team_member consegue ver ou
-- escrever.

create table if not exists wellness_rpe (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  data date not null default current_date,
  rpe int not null check (rpe between 1 and 10),
  created_at timestamptz not null default now(),
  unique (player_id, data)
);

create index if not exists idx_wellness_rpe_team_data on wellness_rpe(team_id, data);

alter table wellness_rpe enable row level security;

-- Só o treinador (team_member) consegue ver ou escrever — sem exceção
-- nenhuma para o jogador, ao contrário de wellness_responses.
create policy "wellness_rpe_team_member" on wellness_rpe
  for all
  using (exists (select 1 from team_members tm where tm.team_id = wellness_rpe.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = wellness_rpe.team_id and tm.user_id = auth.uid()));
