-- Migração incremental: guarda o minuto do jogo (relativo ao início da
-- parte em curso) em cada ponto marcado no Registo de Jogo.
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de supabase_schema_events_normalizado.sql).

alter table events
  add column if not exists minuto int;

-- Preenche o minuto dos pontos já existentes, com base na hora do clique
-- e no início da parte respetiva (só quando essa informação existe).
update events e
set minuto = floor(extract(epoch from (
  e.created_at - case when e.parte = 2 then m.parte2_inicio else m.parte1_inicio end
)) / 60)::int
from matches m
where m.id = e.match_id
  and e.minuto is null
  and (case when e.parte = 2 then m.parte2_inicio else m.parte1_inicio end) is not null;

-- Atualiza a view do registo normalizado para incluir também o minuto
-- (tem de ficar no fim da lista: "create or replace view" não permite
-- mudar a posição/nome das colunas já existentes, só acrescentar novas)
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
  e.minuto
from events e
join matches m on m.id = e.match_id;

alter view events_normalizado set (security_invoker = true);

grant select on events_normalizado to authenticated;

notify pgrst, 'reload schema';
