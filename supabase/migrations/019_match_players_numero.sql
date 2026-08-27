-- Análise de Jogo — migração incremental: número do jogador específico do jogo
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 018_wellness_coach_insert.sql).
--
-- Versão: 1.0 (2026-08-27)
--
-- O número de um jogador pode mudar de jogo para jogo (ex: cedido a outra
-- equipa, camisola diferente por indisponibilidade da habitual) — este
-- número, quando definido, sobrepõe-se ao número "de base" em
-- players.numero só nesse jogo. Fica a null por omissão (usa sempre o
-- número do Plantel, como até agora).

alter table match_players add column if not exists numero text;
