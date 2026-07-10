-- Migração incremental: orientação do campo (direção de ataque na 1ª parte)
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de supabase_schema_partes.sql).

alter table matches
  add column if not exists orientacao_parte1 text check (orientacao_parte1 in ('E-D', 'D-E'));
