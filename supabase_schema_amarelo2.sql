-- Análise de Jogo — migração incremental: segundo cartão amarelo
-- Corre este script uma vez no SQL Editor do teu projeto Supabase.

alter table match_players
  add column if not exists amarelo2 int not null default 0;
