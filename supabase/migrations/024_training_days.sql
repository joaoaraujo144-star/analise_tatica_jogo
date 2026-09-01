-- Análise de Jogo — migração incremental: flag "dia de treino" + duração.
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 023_goals_sofridos.sql).
--
-- Versão: 1.0 (2026-09-01)
--
-- Flag diária, por equipa (não por jogador), que assinala se é dia de
-- treino, com a duração em minutos quando é. Não está ligada a nenhum
-- questionário de wellness — é uma propriedade do dia em si — por isso
-- vive numa tabela própria, uma linha por equipa por dia.

create table if not exists training_days (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  data date not null default current_date,
  treino boolean not null default false,
  duracao_minutos int check (duracao_minutos > 0),
  created_at timestamptz not null default now(),
  unique (team_id, data)
);

create index if not exists idx_training_days_team_data on training_days(team_id, data);

alter table training_days enable row level security;

create policy "training_days_team_member" on training_days
  for all
  using (exists (select 1 from team_members tm where tm.team_id = training_days.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = training_days.team_id and tm.user_id = auth.uid()));

notify pgrst, 'reload schema';
