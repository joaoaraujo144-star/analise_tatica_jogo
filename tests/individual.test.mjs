// Testes da Performance Individual (js/direcao/individual.js, fase 5).
// Correr: node --test 'tests/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';
import { minutosNoJogo, estatisticasJogador, cobertura, jogadoresDoPeriodo } from '../js/direcao/individual.js';

const t = (h, m) => `2026-10-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
const tempos = (id) => ({ id, parte1_inicio: t(15, 0), parte1_fim: t(15, 45), parte2_inicio: t(16, 0), parte2_fim: t(16, 45) });
const jogo = (id, extra = {}) => ({ id, codificacao: 'completa', minutos_jogo: 90, ...extra });
const mp = (match_id, extra = {}) => ({ match_id, player_id: 'p1', estado: 'Titular', substituicao: null, ...extra });
const ev = (match_id, tracker_id, tipo, extra = {}) => ({ match_id, tracker_id, tipo, player_id: 'p1', terco: 'intermedio', ...extra });

test('minutosNoJogo: desconhecido em vez de 0 ou de jogo inteiro', () => {
  assert.equal(minutosNoJogo(mp('a'), tempos('a')), 90);
  assert.equal(minutosNoJogo(mp('a'), { ...tempos('a'), parte2_fim: null }), null);
  assert.equal(minutosNoJogo(mp('a', { estado: 'Suplente', substituicao: 'Entrou' }), tempos('a')), null);  // sem minuto
  assert.equal(minutosNoJogo(mp('a', { substituicao: 'Saiu', parte_substituicao: 2, minuto_substituicao: 15 }), tempos('a')), 60);
  assert.equal(minutosNoJogo(mp('a', { estado: 'Suplente' }), tempos('a')), 0);   // não entrou
});

test('estatisticasJogador: totais, jogos, por 90 só com codificação completa', () => {
  const jogos = [jogo('a'), jogo('b'), jogo('c', { codificacao: 'parcial' })];
  const detalhe = {
    tempos: ['a', 'b', 'c'].map(tempos),
    convocados: [mp('a'), mp('b', { substituicao: 'Saiu', parte_substituicao: 2, minuto_substituicao: 0 }), mp('c')],
    eventos: [
      ev('a', 'perdas', 'X'), ev('a', 'perdas', 'X'), ev('a', 'perdas', 'Y'),
      ev('b', 'remates', 'X', { terco: 'ofensivo' }),
      ev('c', 'perdas', 'X'), ev('c', 'perdas', 'X'),
      ev('a', 'remates', 'Y'),                       // ação do adversário — não conta
      ev('a', 'perdas', 'X', { player_id: 'p2' }),   // outro jogador
    ],
  };
  const s = estatisticasJogador('p1', jogos, detalhe);
  assert.equal(s.jogos, 3);
  assert.equal(s.titularidades, 3);
  assert.equal(s.minutos, 225);           // 90 + 45 + 90
  assert.equal(s.total.ganhos, 4);
  assert.equal(s.total.perdas, 1);
  assert.equal(s.racio, 4);
  assert.equal(s.jogosComEventos, 3);
  assert.equal(s.minutosBase90, 135);     // c é parcial → fora do por 90
  assert.equal(s.por90.ganhos.toFixed(2), '1.33');   // 2 × 90 / 135
  assert.equal(s.zonas.ofensivo, 1);
});

test('estatisticasJogador: poucos minutos → por 90 n/d', () => {
  const detalhe = {
    tempos: [tempos('a')],
    convocados: [mp('a', { estado: 'Suplente', substituicao: 'Entrou', parte_substituicao: 2, minuto_substituicao: 30 })],
    eventos: [ev('a', 'remates', 'X')],
  };
  const s = estatisticasJogador('p1', [jogo('a')], detalhe);
  assert.equal(s.minutos, 15);
  assert.equal(s.por90.remates, null);
  assert.equal(s.total.remates, 1);
});

test('cobertura e jogadores do período', () => {
  const eventos = [ev('a', 'perdas', 'Y'), ev('a', 'perdas', 'Y', { player_id: null }), ev('z', 'perdas', 'Y')];
  const c = cobertura(eventos, [jogo('a')]);
  assert.equal(c.perdas.total, 2);
  assert.equal(c.perdas.pct, 50);
  assert.equal(c.remates.pct, null);
  const js = jogadoresDoPeriodo([
    { match_id: 'a', players: { id: 'p2', numero: '10' } },
    { match_id: 'a', players: { id: 'p1', numero: '2' } },
    { match_id: 'z', players: { id: 'p3', numero: '1' } },
  ], [jogo('a')]);
  assert.deepEqual(js.map(p => p.id), ['p1', 'p2']);
});
