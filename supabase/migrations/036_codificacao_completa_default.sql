-- Análise de Jogo — supabase/migrations/036_codificacao_completa_default.sql
-- matches.codificacao passa a 'completa' por omissão (jogos novos) e os
-- jogos existentes ainda sem indicação ficam também 'completa' — a regra
-- da casa é codificar os jogos inteiros; quando um não o for, muda-se à
-- mão para 'parcial' na tab Jogos. Não toca em jogos já marcados
-- 'parcial'.
--
-- Corre isto uma vez no SQL Editor (depois de 035_direcao_desportiva.sql).
--
-- Versão: 1.0 (2026-11-17)

alter table matches alter column codificacao set default 'completa';

update matches set codificacao = 'completa' where codificacao is null;

notify pgrst, 'reload schema';
