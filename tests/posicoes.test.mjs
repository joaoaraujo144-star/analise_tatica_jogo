// Testes da ordem por posição (js/posicoes.js).
// Correr: node --test 'tests/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';
import { compararJogadores, porPosicao, ordemPosicao } from '../js/posicoes.js';

test('compararJogadores: GR, defesas, médios, avançados; sem posição no fim', () => {
  const js = [
    { nome: 'Sem posição', numero: '1', posicao: null },
    { nome: 'Ponta', numero: '9', posicao: 'PL' },
    { nome: 'Médio', numero: '8', posicao: 'MC' },
    { nome: 'Central B', numero: '5', posicao: 'DC' },
    { nome: 'Central A', numero: '4', posicao: 'DC' },
    { nome: 'Lateral', numero: '2', posicao: 'DD' },
    { nome: 'Guarda-redes', numero: '12', posicao: 'GR' },
  ];
  assert.deepEqual(js.sort(compararJogadores).map(j => j.nome),
    ['Guarda-redes', 'Lateral', 'Central A', 'Central B', 'Médio', 'Ponta', 'Sem posição']);
});

test('compararJogadores: número como número ("10" depois de "9") e sem número no fim', () => {
  const js = [{ nome: 'a', numero: '10', posicao: 'MC' }, { nome: 'b', numero: null, posicao: 'MC' }, { nome: 'c', numero: '9', posicao: 'MC' }];
  assert.deepEqual(js.sort(compararJogadores).map(j => j.nome), ['c', 'a', 'b']);
});

test('porPosicao como 1.º critério, mantendo o critério seguinte', () => {
  const linhas = [{ posicao: 'MC', minutos: 90 }, { posicao: 'GR', minutos: 10 }, { posicao: 'MC', minutos: 300 }];
  linhas.sort((a, b) => porPosicao(a, b) || b.minutos - a.minutos);
  assert.deepEqual(linhas.map(l => l.minutos), [10, 300, 90]);
  assert.equal(ordemPosicao('XX'), ordemPosicao(null));
});
