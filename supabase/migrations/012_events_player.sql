-- Migração incremental: liga (opcionalmente) cada ponto do Registo de Jogo
-- a um jogador convocado, para se saber quem fez a falta/canto/cruzamento/
-- perda/remate. Fica opcional em cada clique (pode ficar por atribuir e
-- corrigir-se depois, no intervalo ou no fim do jogo).
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de 011_cruzamentos.sql).
--
-- Versão: 1.0 (2026-07-15)

alter table events
  add column if not exists player_id uuid references players(id) on delete set null;

create index if not exists idx_events_player on events(player_id);

-- Atualiza a view do registo normalizado para incluir também o jogador
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
  e.minuto,
  e.player_id
from events e
join matches m on m.id = e.match_id;

alter view events_normalizado set (security_invoker = true);

grant select on events_normalizado to authenticated;

notify pgrst, 'reload schema';
