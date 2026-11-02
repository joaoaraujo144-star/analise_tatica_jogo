-- Análise de Jogo — supabase/migrations/034_match_players_minutos.sql
-- Minuto da substituição de cada jogador (relativo ao início da própria
-- parte, igual a events.minuto/goals.minuto) — permite calcular quantos
-- minutos cada jogador jogou, e separar "convocado" de "jogou de facto"
-- no Relatório de Equipa e no relatório de um jogo.
--
-- Corre isto uma vez no SQL Editor de um projeto já existente (depois de
-- 033_trial_one_team_per_code.sql).
--
-- Versão: 1.0 (2026-11-02)

alter table match_players
  add column if not exists parte_substituicao int check (parte_substituicao in (1, 2)),
  add column if not exists minuto_substituicao int;

-- Backfill dos jogos já terminados: não há minuto nenhum guardado para
-- substituições antigas, só a hora exata do clique em player_events
-- (tipo='substituicao'). Reconstrói o minuto comparando essa hora com
-- parte1_inicio/parte2_inicio do jogo — mesmo padrão já usado em
-- 010_events_minuto.sql para o minuto dos pontos do Registo de Jogo.
-- valor='' é um "desfazer" (ver setSubstituicao() em match.js), por isso
-- fica de fora — só interessam os valores 'Saiu'/'Entrou' a sério.
update match_players mp
set
  parte_substituicao = sub.parte,
  minuto_substituicao = sub.minuto
from (
  select distinct on (pe.match_id, pe.player_id)
    pe.match_id,
    pe.player_id,
    case when m.parte2_inicio is not null and pe.created_at >= m.parte2_inicio then 2 else 1 end as parte,
    floor(extract(epoch from (
      pe.created_at - case when m.parte2_inicio is not null and pe.created_at >= m.parte2_inicio then m.parte2_inicio else m.parte1_inicio end
    )) / 60)::int as minuto
  from player_events pe
  join matches m on m.id = pe.match_id
  where pe.tipo = 'substituicao'
    and pe.valor in ('Saiu', 'Entrou')
    and m.parte1_inicio is not null
  order by pe.match_id, pe.player_id, pe.created_at desc
) sub
where mp.match_id = sub.match_id
  and mp.player_id = sub.player_id
  and mp.substituicao in ('Saiu', 'Entrou')
  and mp.minuto_substituicao is null;

notify pgrst, 'reload schema';
