-- Análise de Jogo — migração incremental: substituição como badge (Saiu/Entrou)
-- Corre este script uma vez no SQL Editor do teu projeto Supabase.
--
-- Versão: 1.0 (2026-07-10)
--
-- Substitui o antigo campo numérico "minuto_substituicao" por um estado
-- simples de 3 valores (vazio / Saiu / Entrou), clicável tal como o Estado
-- (Titular/Suplente). A coluna antiga fica na tabela, sem uso, para não
-- perder dados já introduzidos — podes removê-la mais tarde manualmente
-- com "alter table match_players drop column minuto_substituicao;" se
-- não precisares dela.

alter table match_players
  add column if not exists substituicao text check (substituicao in ('Saiu', 'Entrou'));
