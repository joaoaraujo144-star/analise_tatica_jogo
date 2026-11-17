// Testes dos filtros globais (js/direcao/filtros.js).
// Correr na raiz do projeto: node --test 'tests/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarFiltros, filtrosIniciais, opcoesFiltros } from '../js/direcao/filtros.js';

const jogos = [
  { id: 1, data: '2026-05-10', competicao: 'Distrital', local: 'casa', adversario: 'A' },
  { id: 2, data: '2026-09-07', competicao: 'Distrital', local: 'fora', adversario: 'B' },
  { id: 3, data: '2026-09-14', competicao: 'Taça', local: 'casa', adversario: 'C' },
  { id: 4, data: '2026-09-21', competicao: 'Distrital', local: 'casa', adversario: 'A' },
  { id: 5, data: '2026-09-28', competicao: 'Distrital', local: 'fora', adversario: 'D' },
];
const ids = (xs) => xs.map(j => j.id);

test('últimos N com período anterior', () => {
  const r = aplicarFiltros(jogos, { ...filtrosIniciais(), janela: '2' });
  assert.deepEqual(ids(r.atual), [4, 5]);
  assert.deepEqual(ids(r.anterior), [2, 3]);
});

test('filtros de contexto aplicam-se antes da janela', () => {
  const r = aplicarFiltros(jogos, { ...filtrosIniciais(), janela: '3', local: 'casa' });
  assert.deepEqual(ids(r.atual), [1, 3, 4]);
  assert.deepEqual(ids(r.anterior), []);
});

test('época completa e intervalo personalizado (sem período anterior)', () => {
  assert.deepEqual(ids(aplicarFiltros(jogos, { ...filtrosIniciais(), janela: 'epoca', epoca: '2026/27' }).atual), [2, 3, 4, 5]);
  const r = aplicarFiltros(jogos, { ...filtrosIniciais(), janela: 'intervalo', desde: '2026-09-10', ate: '2026-09-25' });
  assert.deepEqual(ids(r.atual), [3, 4]);
  assert.deepEqual(r.anterior, []);
});

test('opções derivadas dos jogos, época mais recente primeiro', () => {
  const o = opcoesFiltros(jogos);
  assert.deepEqual(o.epocas, ['2026/27', '2025/26']);
  assert.deepEqual(o.competicoes, ['Distrital', 'Taça']);
  assert.deepEqual(o.adversarios, ['A', 'B', 'C', 'D']);
});
