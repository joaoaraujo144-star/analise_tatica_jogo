-- Análise de Jogo — scripts/fix-orientacao.sql
-- Corrige o sentido de ataque de UMA SÓ parte de um jogo já jogado, para
-- jogos em que as duas equipas NÃO trocaram de lado ao intervalo (ou seja,
-- as duas partes atacam no mesmo sentido real, mas ficaram registadas com
-- sentidos diferentes).
--
-- Na app, o botão de orientação (js/match.js, wireOrientacao) fica
-- bloqueado assim que o jogo arranca (parte1_inicio definido) — não há
-- forma de o corrigir depois pela interface.
--
-- Porque não é só trocar orientacao_parte1: esse campo (em `matches`)
-- assume sempre que a 2ª parte ataca no sentido OPOSTO da 1ª (troca de
-- lado normal ao intervalo) — a view `events_normalizado` deriva o
-- sentido da 2ª parte a partir do da 1ª, nunca guarda os dois em
-- separado. Se as duas partes deste jogo foram jogadas no MESMO sentido
-- (não houve troca de lado) e só a 1ª ficou mal registada, trocar
-- orientacao_parte1 corrigia a 1ª parte mas estragava a 2ª (que já
-- estava certa). A correção certa é reescrever as coordenadas em bruto
-- (x_pct/y_pct) só dos eventos da parte errada — rodados 180º — e deixar
-- orientacao_parte1 e a outra parte tal como estão.
--
-- Versão: 1.0 (2026-09-14)

-- PASSO 1 — encontrar o id do jogo (se ainda não o tiveres).
-- Ajusta o filtro do adversário/data e corre só este select.
select id, adversario, data, orientacao_parte1
from matches
where adversario ilike '%COLA-AQUI-PARTE-DO-NOME-DO-ADVERSARIO%'
order by data desc;

-- PASSO 2 — corrigir. Cola o id do jogo (da coluna "id" acima) na linha
-- "where match_id = " abaixo, e confirma que "parte = 1" corresponde
-- mesmo à parte errada (troca para "parte = 2" se for a 2ª que está mal).
update events
set x_pct = round(100 - x_pct, 2),
    y_pct = round(100 - y_pct, 2)
where match_id = 'COLA-AQUI-O-ID-DO-JOGO'
  and parte = 1;

-- PASSO 3 — confirmar quantas linhas foram alteradas (deve corresponder
-- ao nº de cliques feitos nessa parte, nos 5 campos: faltas, cantos,
-- cruzamentos, perdas de bola, remates).
select tracker_id, tipo, count(*)
from events
where match_id = 'COLA-AQUI-O-ID-DO-JOGO'
  and parte = 1
group by tracker_id, tipo
order by tracker_id, tipo;
