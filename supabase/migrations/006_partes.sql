-- Análise de Jogo — migração incremental: início/fim da 1ª e 2ª parte
-- Corre este script uma vez no SQL Editor do teu projeto Supabase.
--
-- Versão: 1.0 (2026-07-10)

alter table matches
  add column if not exists parte1_inicio timestamptz,
  add column if not exists parte1_fim timestamptz,
  add column if not exists parte2_inicio timestamptz,
  add column if not exists parte2_fim timestamptz;
