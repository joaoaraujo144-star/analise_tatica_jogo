-- Análise de Jogo — scripts/fix-marcador-golo.sql
-- Corrige o marcador (jogador) de um golo já registado, quando ficou
-- atribuído ao jogador errado.
--
-- Um golo tem o seu próprio registo em `goals` (não é só um número em
-- `match_players.golo`) — ver supabase/migrations/021_goals.sql. Corrigir
-- só `goals.player_id` não chega: o contador `match_players.golo` (usado
-- na convocatória, na tabela de plantel e nos exports CSV) foi incrementado
-- para o jogador errado quando o golo foi registado, por isso também tem
-- de ser ajustado — um a menos no jogador errado, um a mais no certo.
--
-- Corre isto no SQL Editor do Supabase.
--
-- Versão: 1.0 (2026-09-14)

-- PASSO 1 — encontrar o golo errado. Ajusta o filtro do adversário/data
-- para encontrares o jogo, depois vê a lista de golos desse jogo com o
-- marcador atual.
select m.id as match_id, m.adversario, m.data
from matches m
where m.adversario ilike '%COLA-AQUI-PARTE-DO-NOME-DO-ADVERSARIO%'
order by m.data desc;

select g.id as goal_id, g.parte, g.minuto, g.tipo, p.nome as marcador_atual
from goals g
left join players p on p.id = g.player_id
where g.match_id = 'COLA-AQUI-O-ID-DO-JOGO'
  and g.tipo = 'marcado'
order by g.parte, g.minuto;

-- PASSO 2 — encontrar o id do jogador certo (dentro da mesma equipa do
-- jogo, para não trocares por engano um jogador de outra equipa tua).
select id, numero, nome
from players
where team_id = (select team_id from matches where id = 'COLA-AQUI-O-ID-DO-JOGO')
  and nome ilike '%COLA-AQUI-PARTE-DO-NOME-DO-JOGADOR-CERTO%';

-- PASSO 3 — corrigir o registo do golo. Cola o goal_id (do passo 1) e o
-- id do jogador certo (do passo 2).
update goals
set player_id = 'COLA-AQUI-O-ID-DO-JOGADOR-CERTO'
where id = 'COLA-AQUI-O-GOAL-ID';

-- PASSO 4 — ajustar os contadores em match_players: -1 no jogador
-- errado, +1 no jogador certo (ambos no mesmo jogo). Cola o id do
-- jogador ERRADO (o que aparecia em "marcador_atual" no passo 1) e o id
-- do jogador CERTO (do passo 2) nas duas linhas abaixo.
update match_players
set golo = greatest(0, golo - 1)
where match_id = 'COLA-AQUI-O-ID-DO-JOGO'
  and player_id = 'COLA-AQUI-O-ID-DO-JOGADOR-ERRADO';

update match_players
set golo = golo + 1
where match_id = 'COLA-AQUI-O-ID-DO-JOGO'
  and player_id = 'COLA-AQUI-O-ID-DO-JOGADOR-CERTO';

-- PASSO 5 — confirmar o resultado.
select g.id as goal_id, g.parte, g.minuto, p.nome as marcador
from goals g
left join players p on p.id = g.player_id
where g.match_id = 'COLA-AQUI-O-ID-DO-JOGO'
  and g.tipo = 'marcado'
order by g.parte, g.minuto;

select p.nome, mp.golo
from match_players mp
join players p on p.id = mp.player_id
where mp.match_id = 'COLA-AQUI-O-ID-DO-JOGO'
  and mp.golo > 0
order by mp.golo desc;

-- Nota: isto não corrige o histórico de ações (tabela `player_events`,
-- tab "Histórico" / secção "HISTÓRICO DE AÇÕES" dos exports CSV) — essa
-- tabela é só um registo cronológico para consulta, não afeta nenhum
-- cálculo da app, por isso não é crítico deixá-la com o nome antigo. Se
-- quiseres mesmo corrigi-la também, é preciso mover manualmente a linha
-- (tipo='golo') do jogador errado para o certo, o que é mais delicado
-- se algum dos dois jogadores tiver mais do que um golo neste jogo
-- (o campo "valor" guarda o nº de golos acumulado nesse momento) — pede
-- ajuda se for esse o caso.
