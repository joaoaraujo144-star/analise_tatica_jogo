-- Análise de Jogo — migração incremental: flag "pré-época" em matches.
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 025_report_insights.sql).
--
-- Versão: 1.0 (2026-09-15)
--
-- Jogos de pré-época continuam a existir normalmente (dados, eventos,
-- relatório individual do jogo, etc.) mas ficam de fora do agregado do
-- Relatório de Equipa (js/dashboard.js, loadReports()), que soma estatísticas
-- de todos os jogos da equipa e não deve misturar pré-época com a época.

alter table matches add column if not exists pre_epoca boolean not null default false;

notify pgrst, 'reload schema';
