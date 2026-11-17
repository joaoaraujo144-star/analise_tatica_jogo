// Testes das fórmulas do Dashboard Executivo (js/direcao/metricas.js).
// Correr na raiz do projeto: node --test 'tests/*.test.mjs'
// Sem dependências — só o runner de testes nativo do Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  epocaDe, por90, racio, variacaoPct, tendencia,
  resultadoJogo, registoResultados, contagemValida, agregarEventos,
  blocoDe15, minutosJogados, dividirPeriodos,
} from '../js/direcao/metricas.js';

test('epocaDe: julho a junho', () => {
  assert.equal(epocaDe('2026-11-17'), '2026/27');
  assert.equal(epocaDe('2027-06-30'), '2026/27');
  assert.equal(epocaDe('2027-07-01'), '2027/28');
  assert.equal(epocaDe('2099-08-01'), '2099/00');
});

test('por90: normaliza e trata minutos em falta', () => {
  assert.equal(por90(10, 90), 10);
  assert.equal(por90(10, 180), 5);
  assert.equal(por90(10, 0), null);
  assert.equal(por90(10, null), null);
  assert.equal(por90(null, 90), null);
});

test('racio: divisão por zero → n/d', () => {
  assert.equal(racio(30, 20), 1.5);
  assert.equal(racio(0, 20), 0);
  assert.equal(racio(30, 0), null);
  assert.equal(racio(null, 5), null);
});

test('variacaoPct: anterior zero ou em falta → n/d', () => {
  assert.equal(variacaoPct(12, 10), 20);
  assert.equal(variacaoPct(8, 10), -20);
  assert.equal(variacaoPct(5, 0), null);
  assert.equal(variacaoPct(null, 10), null);
});

test('tendencia: direção favorável configurável', () => {
  assert.equal(tendencia(12, 10, 'subir'), 'melhoria');
  assert.equal(tendencia(12, 10, 'descer'), 'agravamento');
  assert.equal(tendencia(8, 10, 'descer'), 'melhoria');
  assert.equal(tendencia(10.2, 10, 'subir'), 'estavel'); // 2% < margem de 5%
  assert.equal(tendencia(10, 10, 'subir'), 'estavel');
  assert.equal(tendencia(3, 0, 'descer'), 'agravamento'); // sem % mas com direção clara
  assert.equal(tendencia(null, 10, 'subir'), null);
});

test('resultadoJogo: golos inconsistentes → sem resultado', () => {
  assert.equal(resultadoJogo({ golos_marcados: 2, golos_sofridos: 1, golos_consistentes: true }), 'V');
  assert.equal(resultadoJogo({ golos_marcados: 1, golos_sofridos: 1, golos_consistentes: true }), 'E');
  assert.equal(resultadoJogo({ golos_marcados: 0, golos_sofridos: 3, golos_consistentes: true }), 'D');
  assert.equal(resultadoJogo({ golos_marcados: 0, golos_sofridos: 0, golos_consistentes: false }), null);
});

test('registoResultados: pontos e PPG só com jogos fiáveis', () => {
  const r = registoResultados([
    { golos_marcados: 2, golos_sofridos: 0, golos_consistentes: true },
    { golos_marcados: 1, golos_sofridos: 1, golos_consistentes: true },
    { golos_marcados: 0, golos_sofridos: 1, golos_consistentes: true },
    { golos_marcados: 0, golos_sofridos: 0, golos_consistentes: false },
  ]);
  assert.deepEqual({ V: r.V, E: r.E, D: r.D, sem: r.semResultado, jogos: r.jogos, pontos: r.pontos }, { V: 1, E: 1, D: 1, sem: 1, jogos: 3, pontos: 4 });
  assert.ok(Math.abs(r.ppg - 4 / 3) < 1e-9);
  assert.equal(registoResultados([]).ppg, null);
});

test('contagemValida: zero só conta com codificação completa', () => {
  assert.equal(contagemValida(5, null), 5);
  assert.equal(contagemValida(0, 'completa'), 0);
  assert.equal(contagemValida(0, 'parcial'), null);
  assert.equal(contagemValida(0, null), null);
});

test('agregarEventos: ignora jogos sem contagem válida também nos minutos', () => {
  const jogos = [
    { id: 'a', codificacao: 'completa', minutos_jogo: 90 },
    { id: 'b', codificacao: null, minutos_jogo: 90 },      // 0 eventos, não codificado → fora
    { id: 'c', codificacao: null, minutos_jogo: 90 },
  ];
  const n = { a: 0, b: 0, c: 6 };
  const r = agregarEventos(jogos, j => n[j.id]);
  assert.equal(r.total, 6);
  assert.equal(r.jogosConsiderados, 2);
  assert.equal(r.porJogo, 3);
  assert.equal(r.por90, 3); // 6 × 90 / 180
});

test('agregarEventos: jogo sem minutos fica fora do por90; sem nenhum → n/d', () => {
  const r = agregarEventos([{ id: 'a', codificacao: null, minutos_jogo: null }], () => 4);
  assert.equal(r.total, 4);
  assert.equal(r.por90, null);
  assert.equal(r.jogosSemMinutos, 1);
  const r2 = agregarEventos([
    { id: 'a', codificacao: 'completa', minutos_jogo: 90 },
    { id: 'b', codificacao: 'completa', minutos_jogo: null },
  ], j => (j.id === 'a' ? 6 : 10));
  assert.equal(r2.total, 16);
  assert.equal(r2.porJogo, 8);
  assert.equal(r2.por90, 6);              // só o jogo a (com minutos)
  assert.equal(r2.jogosSemMinutos, 1);
  const vazio = agregarEventos([{ id: 'a', codificacao: null, minutos_jogo: 90 }], () => 0);
  assert.equal(vazio.total, null);
  assert.equal(vazio.porJogo, null);
});

test('blocoDe15: minuto relativo à parte', () => {
  assert.equal(blocoDe15(1, 0), 0);
  assert.equal(blocoDe15(1, 16), 1);
  assert.equal(blocoDe15(1, 47), 2);   // descontos ficam no último bloco da parte
  assert.equal(blocoDe15(2, 5), 3);
  assert.equal(blocoDe15(2, 50), 5);
  assert.equal(blocoDe15(2, null), null);
});

test('minutosJogados: titular, saiu, entrou, não entrou', () => {
  const match = {
    parte1_inicio: '2026-11-01T15:00:00Z', parte1_fim: '2026-11-01T15:46:00Z', // 46
    parte2_inicio: '2026-11-01T16:00:00Z', parte2_fim: '2026-11-01T16:48:00Z', // 48
  };
  assert.equal(minutosJogados({ estado: 'Titular' }, match), 94);
  assert.equal(minutosJogados({ estado: 'Titular', substituicao: 'Saiu', parte_substituicao: 2, minuto_substituicao: 20 }, match), 66);
  assert.equal(minutosJogados({ estado: 'Suplente', substituicao: 'Entrou', parte_substituicao: 2, minuto_substituicao: 20 }, match), 28);
  assert.equal(minutosJogados({ estado: 'Suplente' }, match), 0);
});

test('dividirPeriodos: últimos n vs n anteriores', () => {
  const j = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(dividirPeriodos(j, 3), { atual: [6, 7, 8], anterior: [3, 4, 5] });
  assert.deepEqual(dividirPeriodos(j, 6), { atual: [3, 4, 5, 6, 7, 8], anterior: [1, 2] });
  assert.deepEqual(dividirPeriodos([1, 2], 6), { atual: [1, 2], anterior: [] });
});
