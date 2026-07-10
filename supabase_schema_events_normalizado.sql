-- Migração incremental: view com o Registo de Jogo normalizado
-- (1ª + 2ª parte juntas, rodadas 180º para ficarem no mesmo sentido de
-- ataque, com base na orientação escolhida nas setas para cada parte).
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de supabase_schema_events_parte.sql e supabase_schema_orientacao.sql).

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
  end as y_pct_normalizado
from events e
join matches m on m.id = e.match_id;

-- A view corre com as permissões de quem a consulta, não do dono,
-- para respeitar a RLS já definida em "events" e "matches".
alter view events_normalizado set (security_invoker = true);

grant select on events_normalizado to authenticated;

-- Views novas só ficam visíveis pela API depois de recarregar a cache do PostgREST
notify pgrst, 'reload schema';
