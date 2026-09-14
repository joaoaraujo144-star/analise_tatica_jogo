-- Migração incremental: cache da análise em prosa (insights) dos
-- relatórios Geral e Transições de um jogo.
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de 024_training_days.sql).
--
-- Versão: 1.0 (2026-09-14)
--
-- Gerada pela API da Claude através da Edge Function gerar-insights (ver
-- supabase/functions/gerar-insights) — guardada aqui para não voltar a
-- chamar a API sempre que o relatório é reaberto. O botão "Regenerar
-- análise" em cada página faz upsert(match_id, tipo).

create table if not exists report_insights (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  tipo text not null check (tipo in ('geral', 'transicoes')),
  conteudo jsonb not null,
  gerado_em timestamptz not null default now(),
  unique (match_id, tipo)
);

create index if not exists idx_report_insights_match on report_insights(match_id);

alter table report_insights enable row level security;

create policy "report_insights_team_member" on report_insights
  for all
  using (exists (select 1 from team_members tm where tm.team_id = report_insights.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = report_insights.team_id and tm.user_id = auth.uid()));

notify pgrst, 'reload schema';
