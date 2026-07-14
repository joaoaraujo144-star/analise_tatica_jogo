-- Migração incremental: registo de jogo (campos clicáveis) passa a ser por parte
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de 007_orientacao.sql).
--
-- Versão: 1.0 (2026-07-10)
--
-- Cliques já existentes ficam todos marcados como 1ª parte.

alter table events
  add column if not exists parte int not null default 1 check (parte in (1, 2));
