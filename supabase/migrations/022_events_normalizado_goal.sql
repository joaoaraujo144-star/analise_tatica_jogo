-- Análise de Jogo — migração incremental: goal_id na view events_normalizado
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 021_goals.sql).
--
-- Versão: 1.0 (2026-08-31)
--
-- A view não tinha "goal_id" — o Registo de Jogo normalizado (Relatórios,
-- pós-jogo) não conseguia saber quais pontos estavam ligados a um golo, ao
-- contrário do ecrã ao vivo (que lê "events" diretamente). "create or
-- replace view" só acrescenta a coluna no fim, sem alterar as existentes.

create or replace view events_normalizado as
select
  e.id,
  e.team_id,
  e.match_id,
  e.tracker_id,
  e.parte,
  e.tipo,
  e.created_at,
  e.x_pct,
  e.y_pct,
  case
    when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
      or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
    then round(100 - e.x_pct, 2)
    else e.x_pct
  end as x_pct_normalizado,
  case
    when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
      or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
    then round(100 - e.y_pct, 2)
    else e.y_pct
  end as y_pct_normalizado,
  e.minuto,
  e.player_id,
  least(5, greatest(0, floor(
    (case
      when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
        or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
      then 100 - e.x_pct
      else e.x_pct
    end) / 100.0 * 6
  )::int)) as zona_col,
  least(3, greatest(0, floor(
    (case
      when (e.parte = 1 and coalesce(m.orientacao_parte1, 'E-D') = 'D-E')
        or (e.parte = 2 and coalesce(m.orientacao_parte1, 'E-D') = 'E-D')
      then 100 - e.y_pct
      else e.y_pct
    end) / 100.0 * 4
  )::int)) as zona_row,
  e.goal_id
from events e
join matches m on m.id = e.match_id;

alter view events_normalizado set (security_invoker = true);

grant select on events_normalizado to authenticated;
