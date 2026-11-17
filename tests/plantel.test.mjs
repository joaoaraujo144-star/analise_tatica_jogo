// Testes da Gestão do Plantel (js/direcao/plantel.js, fase 6).
// Correr: node --test 'tests/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lerPosicoes, idade, distribuicaoPosicoes, utilizacao, participacaoPorPosicao, evolucaoJogadores, planeamento,
} from '../js/direcao/plantel.js';

const t = (h, m) => `2026-10-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
const tempos = (id) => ({ id, parte1_inicio: t(15, 0), parte1_fim: t(15, 45), parte2_inicio: t(16, 0), parte2_fim: t(16, 45) });
const jogo = (id, extra = {}) => ({ id, codificacao: 'completa', minutos_jogo: 90, ...extra });
const mp = (match_id, player_id, extra = {}) => ({ match_id, player_id, estado: 'Titular', substituicao: null, ...extra });
const jog = (id, posicao, sec = []) => ({ id, nome: id, posicao, posicoes_secundarias: sec });

test('lerPosicoes e idade', () => {
  assert.deepEqual(lerPosicoes('mc, MO; dc xx MC', 'DC'), { validas: ['MC', 'MO'], invalidas: ['XX'] });
  assert.equal(idade('2000-11-18', new Date('2026-11-17T12:00:00')), 25);
  assert.equal(idade('2000-11-17', new Date('2026-11-17T12:00:00')), 26);
  assert.equal(idade(null), null);
});

test('distribuicaoPosicoes: défice só com mínimo definido, secundárias à parte', () => {
  const plantel = [jog('a', 'DC'), jog('b', 'DC'), jog('c', 'MC', ['DC']), jog('d', null)];
  const d = distribuicaoPosicoes(plantel, [{ posicao: 'DC', minimo: 4 }]);
  const dc = d.linhas.find(l => l.posicao === 'DC');
  assert.equal(dc.principais.length, 2);
  assert.equal(dc.secundarios.length, 1);
  assert.equal(dc.defice, 2);
  assert.equal(d.linhas.find(l => l.posicao === 'MC').defice, null);
  assert.equal(d.semPosicao.length, 1);
});

test('utilização: % de minutos disponíveis e participação por posição', () => {
  const plantel = [jog('a', 'GR'), jog('b', 'PL'), jog('c', 'PL')];
  const jogos = [jogo('m1'), jogo('m2', { minutos_jogo: null })];
  const detalhe = {
    tempos: [tempos('m1'), { id: 'm2' }],
    eventos: [],
    convocados: [mp('m1', 'a'), mp('m1', 'b', { substituicao: 'Saiu', parte_substituicao: 2, minuto_substituicao: 0 }), mp('m2', 'a')],
  };
  const us = utilizacao(plantel, jogos, detalhe);
  const [a, b, c] = us;
  assert.equal(a.pctMinutos, 100);    // m2 sem tempos → fora da base
  assert.equal(b.pctMinutos, 50);
  assert.equal(c.pctMinutos, 0);
  assert.equal(a.stats.jogos, 2);
  const part = participacaoPorPosicao(us);
  assert.equal(part.total, 135);
  assert.equal(Math.round(part.grupos.find(g => g.posicao === 'GR').pct), 67);
});

test('evolucaoJogadores: só com amostra suficiente nos dois períodos', () => {
  const s = (ganhos, perdas, minutosBase90) => ({ total: { ganhos, perdas }, racio: perdas ? ganhos / perdas : null, minutosBase90 });
  const atual = [{ jogador: jog('a'), stats: s(12, 6, 180) }, { jogador: jog('b'), stats: s(4, 4, 180) }, { jogador: jog('c'), stats: s(10, 10, 60) }];
  const anterior = new Map([['a', s(8, 8, 180)], ['b', s(8, 4, 180)], ['c', s(5, 10, 180)]]);
  const [a, b, c] = evolucaoJogadores(atual, anterior);
  assert.equal(a.leitura, 'positiva');   // 1 → 2
  assert.equal(b.leitura, 'negativa');   // 2 → 1, amostra suficiente (8 ações)
  assert.equal(c.leitura, null);         // atual com 60 minutos → insuficiente
});

test('planeamento: necessidade, dependência e pouco utilizado', () => {
  const plantel = [jog('g1', 'GR'), jog('d1', 'DC'), jog('d2', 'DC'), jog('p1', 'PL'), jog('p2', 'PL')];
  const distribuicao = distribuicaoPosicoes(plantel, [{ posicao: 'DC', minimo: 4 }, { posicao: 'GR', minimo: 2 }]);
  const u = (id, minutos, convocatorias, pctMinutos) => ({ jogador: plantel.find(j => j.id === id), stats: { minutos, convocatorias }, pctMinutos, incompleto: false });
  const utilizacoes = [u('g1', 900, 10, 100), u('d1', 800, 10, 90), u('d2', 700, 10, 80), u('p1', 850, 10, 95), u('p2', 60, 8, 7)];
  const r = planeamento({ distribuicao, utilizacoes });
  assert.deepEqual(r.necessidades.map(n => [n.posicao, n.defice]), [['GR', 1], ['DC', 2]]);
  assert.deepEqual(r.dependencias.map(d => [d.posicao, d.jogador.id]), [['GR', 'g1']]);   // PL tem p2 como alternativa
  assert.equal(r.prioridades[0].posicao, 'DC');   // maior défice sem alternativas
  assert.deepEqual(r.decisoes.map(d => [d.tipo, d.posicao]), [['reforcar', 'GR'], ['reforcar', 'DC']]);
  assert.deepEqual(r.acompanhamento.map(a => [a.tipo, a.jogador.id]), [['pouco_utilizado', 'p2']]);
});
