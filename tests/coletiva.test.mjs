// Testes das fórmulas da Performance Coletiva (js/direcao/metricas.js,
// fase 3). Correr: node --test 'tests/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contadorEventos, contadorPor, calcularPeriodo, valoresPorJogo,
  distribuicaoBlocos, matrizZonas, compararIndicadores, INDICADORES, INDICADORES_OVERVIEW,
} from '../js/direcao/metricas.js';

const jogo = (id, extra = {}) => ({
  id, golos_marcados: 1, golos_sofridos: 0, golos_consistentes: true,
  codificacao: 'completa', minutos_jogo: 90, ...extra,
});
const ev = (match_id, tracker_id, tipo, extra = {}) => ({ match_id, tracker_id, tipo, parte: 1, minuto: 5, terco: 'intermedio', corredor: 'central', ...extra });

test('perdas no terço defensivo e recuperações no terço ofensivo, por 90', () => {
  const jogos = [jogo('a'), jogo('b')];
  const eventos = [
    ev('a', 'perdas', 'Y', { terco: 'defensivo' }), ev('a', 'perdas', 'Y', { terco: 'defensivo' }),
    ev('a', 'perdas', 'Y', { terco: 'ofensivo' }),
    ev('b', 'perdas', 'X', { terco: 'ofensivo' }),
  ];
  const p = calcularPeriodo(jogos, contadorEventos(eventos), contadorPor(eventos, e => e.terco));
  assert.equal(p.perdasTercoDef.total, 2);
  assert.equal(p.perdasTercoDef.por90, 1);     // 2 × 90 / 180 — o jogo b (completa, 0) conta como zero
  assert.equal(p.ganhosTercoOf.total, 1);
});

test('sem contador por terço → indicadores por terço n/d', () => {
  const p = calcularPeriodo([jogo('a')], contadorEventos([]));
  assert.equal(p.perdasTercoDef.por90, null);
  assert.equal(p.ganhosTercoOf.total, null);
});

test('saldo por jogo usa as médias de cada lado', () => {
  const jogos = [jogo('a'), jogo('b', { codificacao: 'parcial' })];
  const eventos = [
    ...Array.from({ length: 6 }, () => ev('a', 'remates', 'X')),
    ev('a', 'remates', 'Y'), ev('a', 'remates', 'Y'),
    ev('b', 'remates', 'X'), ev('b', 'remates', 'X'),     // b: sem remates contra registados (parcial → n/d)
  ];
  const p = calcularPeriodo(jogos, contadorEventos(eventos));
  assert.equal(p.rematesF.porJogo, 4);   // (6 + 2) / 2
  assert.equal(p.rematesC.porJogo, 2);   // só o jogo a
  assert.equal(p.saldoRematesJogo, 2);
});

test('valoresPorJogo: null onde a contagem não é válida', () => {
  const jogos = [jogo('a'), jogo('b', { codificacao: 'parcial' }), jogo('c', { codificacao: 'parcial' })];
  const eventos = [ev('c', 'cantos', 'X')];
  assert.deepEqual(valoresPorJogo(jogos, contadorEventos(eventos), 'cantos', 'X'), [0, null, 1]);
});

test('distribuicaoBlocos: média por jogo válido e eventos sem minuto à parte', () => {
  const jogos = [jogo('a'), jogo('b'), jogo('c', { codificacao: 'parcial' })];
  const eventos = [
    ev('a', 'remates', 'X', { parte: 1, minuto: 3 }),
    ev('a', 'remates', 'X', { parte: 1, minuto: 44 }),
    ev('a', 'remates', 'X', { parte: 2, minuto: 50 }),   // 2ª parte, 75–90+
    ev('b', 'remates', 'X', { parte: 2, minuto: null }),
  ];
  const d = distribuicaoBlocos(jogos, eventos, 'remates', 'X');
  assert.equal(d.jogosConsiderados, 2);       // c é parcial e sem remates → fora
  assert.deepEqual(d.total, [1, 0, 1, 0, 0, 1]);
  assert.deepEqual(d.mediaPorJogo, [0.5, 0, 0.5, 0, 0, 0.5]);
  assert.equal(d.semMinuto, 1);
});

test('matrizZonas: corredor × terço, só dos jogos pedidos', () => {
  const eventos = [
    ev('a', 'remates', 'X', { terco: 'ofensivo', corredor: 'esquerdo' }),
    ev('a', 'remates', 'X', { terco: 'ofensivo', corredor: 'central' }),
    ev('a', 'remates', 'X', { terco: 'ofensivo', corredor: 'central' }),
    ev('z', 'remates', 'X', { terco: 'ofensivo', corredor: 'central' }),  // outro jogo
  ];
  const { matriz, total } = matrizZonas([jogo('a')], eventos, 'remates', 'X');
  assert.equal(total, 3);
  assert.deepEqual(matriz, [[0, 0, 1], [0, 0, 2], [0, 0, 0]]);
});

test('saldos só em absoluto e catálogo do Overview sem os indicadores da fase 3', () => {
  const ind = INDICADORES.filter(i => i.id === 'saldo_remates_jogo');
  const [l] = compararIndicadores({ saldoRematesJogo: -1 }, { saldoRematesJogo: 2 }, ind);
  assert.equal(l.variacao, null);
  assert.equal(l.tendencia, 'agravamento');
  assert.equal(INDICADORES_OVERVIEW.length, 15);
});
