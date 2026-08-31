-- Análise de Jogo — migração incremental: golos sofridos
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 022_events_normalizado_goal.sql).
--
-- Versão: 1.0 (2026-08-31)
--
-- Golo sofrido usa a mesma tabela "goals" e a mesma lógica de ligação a
-- eventos (events.goal_id) dos golos marcados — só não tem "marcador"
-- (player_id fica a null), porque a app não tem lista de jogadores do
-- adversário. "tipo" distingue os dois.

alter table goals add column if not exists tipo text not null default 'marcado' check (tipo in ('marcado', 'sofrido'));
