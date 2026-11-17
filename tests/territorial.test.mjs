// Testes da Análise Territorial (js/direcao/territorial.js, fase 4).
// Correr: node --test 'tests/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrarEventos, densidade, distribuicaoZonas, compararZonas, verificarOrientacao,
} from '../js/direcao/territorial.js';

const ev = (extra = {}) => ({
  match_id: 'a', tracker_id: 'remates', tipo: 'X', parte: 1, minuto: 10, player_id: null,
  x_pct_normalizado: 80, y_pct_normalizado: 50, terco: 'ofensivo', corredor: 'central', ...extra,
});

test('filtrarEventos: tipo, jogo, jogador e momento', () => {
  const eventos = [
    ev(), ev({ tipo: 'Y' }), ev({ match_id: 'b' }), ev({ player_id: 'p1' }),
    ev({ parte: 2, minuto: 20 }), ev({ minuto: null }),
  ];
  assert.equal(filtrarEventos(eventos, { tracker: 'remates', tipo: 'X' }).length, 5);
  assert.equal(filtrarEventos(eventos, { matchIds: new Set(['b']) }).length, 1);
  assert.equal(filtrarEventos(eventos, { playerId: 'p1' }).length, 1);
  assert.equal(filtrarEventos(eventos, { momento: 'p2' }).length, 1);
  assert.equal(filtrarEventos(eventos, { momento: 'b4' }).length, 1);   // 2ª parte, 15–30
  assert.equal(filtrarEventos(eventos, { momento: 'b0' }).length, 4);   // o sem minuto fica de fora
});

test('densidade: células e limites', () => {
  const g = densidade([
    ev({ x_pct_normalizado: 0, y_pct_normalizado: 0 }),
    ev({ x_pct_normalizado: 100, y_pct_normalizado: 100 }),
    ev({ x_pct_normalizado: 99, y_pct_normalizado: 99 }),
  ], 4, 2);
  assert.equal(g[0][0], 1);
  assert.equal(g[1][3], 2);
});

test('distribuicaoZonas e compararZonas: quotas e pontos percentuais', () => {
  const atual = distribuicaoZonas([ev(), ev(), ev({ terco: 'defensivo', corredor: 'esquerdo' }), ev({ terco: 'intermedio' })]);
  assert.equal(atual.total, 4);
  assert.equal(atual.tercoPct.ofensivo, 50);
  assert.equal(atual.corredorPct.central, 75);
  const anterior = distribuicaoZonas([ev(), ev({ terco: 'defensivo' })]);
  const c = compararZonas(atual, 2, anterior, 1);
  const of = c.terco.find(l => l.zona === 'ofensivo');
  assert.equal(of.atualPorJogo, 1);
  assert.equal(of.anteriorPorJogo, 1);
  assert.equal(of.difPp, 0);
  const def = c.terco.find(l => l.zona === 'defensivo');
  assert.equal(def.difPp, -25);
});

test('distribuicaoZonas: sem eventos → quotas n/d', () => {
  const d = distribuicaoZonas([]);
  assert.equal(d.total, 0);
  assert.equal(d.tercoPct.ofensivo, null);
});

test('verificarOrientacao: deteta uma parte ao contrário', () => {
  const eventos = [
    // jogo a, 1ª parte: remates a favor perto da baliza adversária, contra perto da nossa → ok
    ...[85, 90, 75].map(x => ev({ x_pct_normalizado: x })),
    ev({ tipo: 'Y', x_pct_normalizado: 15 }),
    // jogo a, 2ª parte: tudo ao contrário → suspeito
    ...[10, 20, 15].map(x => ev({ parte: 2, x_pct_normalizado: x })),
    ev({ parte: 2, tracker_id: 'cruzamentos', tipo: 'Y', x_pct_normalizado: 88 }),
    // jogo b: poucos eventos → insuficiente; perdas não contam
    ev({ match_id: 'b', x_pct_normalizado: 10 }),
    ev({ match_id: 'b', tracker_id: 'perdas', x_pct_normalizado: 10 }),
  ];
  const r = verificarOrientacao(eventos);
  assert.deepEqual(r.map(g => [g.match_id, g.parte, g.estado]), [['a', 1, 'ok'], ['a', 2, 'suspeito'], ['b', 1, 'insuficiente']]);
  assert.equal(r[2].eventos, 1);
});
