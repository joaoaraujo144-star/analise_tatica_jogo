// Testes do cálculo por período, comparação e conclusões executivas
// (js/direcao/metricas.js). Correr: node --test 'tests/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contadorEventos, calcularPeriodo, compararIndicadores, conclusoesExecutivas, INDICADORES,
} from '../js/direcao/metricas.js';

const jogo = (id, m, s, extra = {}) => ({
  id, golos_marcados: m, golos_sofridos: s, golos_consistentes: true,
  codificacao: 'completa', minutos_jogo: 90, ...extra,
});
const eventos = (matchId, tracker, tipo, n) => Array.from({ length: n }, () => ({ match_id: matchId, tracker_id: tracker, tipo }));

test('calcularPeriodo: resultados, golos e eventos por 90', () => {
  const jogos = [jogo('a', 2, 1), jogo('b', 0, 0), jogo('c', 1, 3, { golos_consistentes: false })];
  const ev = [
    ...eventos('a', 'remates', 'X', 10), ...eventos('b', 'remates', 'X', 8), ...eventos('c', 'remates', 'X', 6),
    ...eventos('a', 'perdas', 'X', 30), ...eventos('a', 'perdas', 'Y', 20),
  ];
  const p = calcularPeriodo(jogos, contadorEventos(ev));
  assert.equal(p.jogos, 3);
  assert.equal(p.V, 1); assert.equal(p.E, 1); assert.equal(p.semResultado, 1);
  assert.equal(p.golosMarcados, 2);          // só jogos fiáveis
  assert.equal(p.golosSofridos, 1);
  assert.equal(p.difGolos, 1);
  assert.equal(p.golosMarcadosJogo, 1);
  assert.equal(p.rematesF.total, 24);
  assert.equal(p.rematesF.por90, 8);          // 24 × 90 / 270
  assert.equal(p.racioGanhosPerdas, 1.5);
});

test('calcularPeriodo: sem jogos fiáveis → golos n/d', () => {
  const p = calcularPeriodo([jogo('a', 0, 0, { golos_consistentes: false })], contadorEventos([]));
  assert.equal(p.golosMarcados, null);
  assert.equal(p.difGolos, null);
  assert.equal(p.ppg, null);
});

test('compararIndicadores: direção favorável e indicadores sem juízo', () => {
  const p = (remF, remC, faltas) => ({
    rematesF: { por90: remF }, rematesC: { por90: remC }, faltasCometidas: { por90: faltas },
  });
  const inds = INDICADORES.filter(i => ['remates_f_90', 'remates_c_90', 'faltas_cometidas_90'].includes(i.id));
  const [remF, remC, faltas] = compararIndicadores(p(12, 8, 15), p(10, 10, 12), inds);
  assert.equal(remF.tendencia, 'melhoria');
  assert.equal(remF.variacao, 20);
  assert.equal(remC.tendencia, 'melhoria');     // menos remates sofridos é bom
  assert.equal(faltas.tendencia, 'neutro');     // sem direção definida
});

test('compararIndicadores: diferença de golos só em absoluto', () => {
  const ind = INDICADORES.filter(i => i.id === 'dif_golos');
  const [l] = compararIndicadores({ difGolos: 2 }, { difGolos: -1 }, ind);
  assert.equal(l.variacao, null);
  assert.equal(l.diferenca, 3);
  assert.equal(l.tendencia, 'melhoria');
});

test('conclusoesExecutivas: amostra insuficiente', () => {
  const r = conclusoesExecutivas([], 6, 2);
  assert.equal(r.suficiente, false);
});

test('conclusoesExecutivas: escolhe maior melhoria e maior agravamento acima do limiar', () => {
  const linha = (id, variacao, tendencia) => ({ ind: INDICADORES.find(i => i.id === id), variacao, tendencia });
  const r = conclusoesExecutivas([
    linha('remates_f_90', 25, 'melhoria'),
    linha('ganhos_90', 12, 'melhoria'),
    linha('perdas_90', 30, 'agravamento'),
    linha('remates_c_90', 6, 'agravamento'),      // abaixo do limiar de 10%
    linha('faltas_cometidas_90', 50, 'neutro'),   // sem direção, nunca entra
  ], 6, 6);
  assert.equal(r.suficiente, true);
  assert.equal(r.positiva.ind.id, 'remates_f_90');
  assert.equal(r.risco.ind.id, 'perdas_90');
  assert.match(r.recomendacao, /construção sob pressão/);
});

test('conclusoesExecutivas: sem variações relevantes → nada a concluir', () => {
  const r = conclusoesExecutivas([{ ind: INDICADORES[0], variacao: 3, tendencia: 'estavel' }], 6, 6);
  assert.equal(r.positiva, null);
  assert.equal(r.risco, null);
  assert.equal(r.recomendacao, null);
});
