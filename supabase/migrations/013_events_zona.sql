-- Migração incremental: adiciona a zona (grelha 6×4) de cada ponto do
-- Registo de Jogo à view normalizada, para o mapa de calor por zonas
-- poder ser calculado tanto no browser como diretamente em SQL/noutras
-- ferramentas — a definição de "zona" fica só num sítio (aqui), em vez
-- de duplicada entre o JS e a base de dados.
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de 012_events_player.sql).
--
-- Versão: 1.0 (2026-07-15)
--
-- Grelha: 6 colunas × 4 linhas (tem de ficar igual a HEATMAP_COLS/
-- HEATMAP_ROWS em js/match.js — se um mudar, muda o outro).

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
  )::int)) as zona_row
from events e
join matches m on m.id = e.match_id;

alter view events_normalizado set (security_invoker = true);

grant select on events_normalizado to authenticated;

notify pgrst, 'reload schema';
