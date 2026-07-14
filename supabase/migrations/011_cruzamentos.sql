-- Migração incremental: adiciona a secção "Cruzamentos" ao Registo de Jogo
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de 010_events_minuto.sql).
--
-- Versão: 1.0 (2026-07-14)

alter table events
  drop constraint if exists events_tracker_id_check;

alter table events
  add constraint events_tracker_id_check
  check (tracker_id in ('faltas', 'cantos', 'cruzamentos', 'perdas', 'remates'));
