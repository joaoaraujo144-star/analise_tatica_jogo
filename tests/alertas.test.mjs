// Testes dos alertas e da configuração dos indicadores
// (js/direcao/alertas.js, fase 7). Correr: node --test 'tests/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configuracao, indicadoresConfigurados, alertasColetivos, alertasProducaoIndividual, alertasDependencia, ordenarAlertas,
} from '../js/direcao/alertas.js';
import { compararIndicadores, INDICADORES } from '../js/direcao/metricas.js';

const periodo = (rematesF, rematesC, perdasDef) => ({
  rematesF: { por90: rematesF }, rematesC: { por90: rematesC }, perdasTercoDef: { por90: perdasDef }, difGolos: 0,
});
const inds = (ids) => INDICADORES.filter(i => ids.includes(i.id));

test('configuracao: omissões e linhas configuradas', () => {
  const cfg = configuracao([{ indicador: 'faltas_cometidas_90', direcao: 'descer', limite_pct: 25, gravidade: 'baixa', ativo: true }]);
  assert.equal(cfg.get('remates_f_90').ativo, true);
  assert.equal(cfg.get('remates_f_90').origem, 'omissao');
  assert.equal(cfg.get('cantos_f_90').ativo, false);
  assert.equal(cfg.get('faltas_sofridas_90').direcao, null);
  assert.equal(cfg.get('faltas_cometidas_90').direcao, 'descer');
  assert.equal(cfg.get('faltas_cometidas_90').limite, 25);
  assert.equal(cfg.get('dif_golos').ativo, false);        // só em absoluto
  assert.equal(cfg.get('dependencia').limite, 80);
});

test('direção configurada muda a tendência', () => {
  const cfg = configuracao([{ indicador: 'remates_f_90', direcao: 'descer', limite_pct: 15, gravidade: 'media', ativo: true }]);
  const lista = indicadoresConfigurados(cfg, inds(['remates_f_90']));
  const [l] = compararIndicadores(periodo(12, 0, 0), periodo(10, 0, 0), lista);
  assert.equal(l.tendencia, 'agravamento');
});

test('alertasColetivos: só desfavoráveis acima do limite, com amostra', () => {
  const cfg = configuracao();
  const lista = indicadoresConfigurados(cfg, inds(['remates_f_90', 'remates_c_90', 'perdas_terco_def_90']));
  const linhas = compararIndicadores(periodo(8, 11, 4.4), periodo(10, 10, 4), lista);
  // remates feitos −20% (alerta), sofridos +10% (abaixo de 15%), perdas t. def. +10%
  const r = alertasColetivos(linhas, cfg, 6, 6);
  assert.equal(r.suficiente, true);
  assert.deepEqual(r.alertas.map(a => a.id), ['remates_f_90']);
  assert.equal(r.alertas[0].limite, 15);
  assert.equal(alertasColetivos(linhas, cfg, 6, 2).suficiente, false);
});

test('alertasProducaoIndividual e dependência', () => {
  const cfg = configuracao();
  const st = (g, r, c, base) => ({ por90: { ganhos: g, remates: r, cruzamentos: c }, total: { ganhos: g * 3, remates: r * 3, cruzamentos: c * 3 }, minutosBase90: base });
  const j = (id) => ({ id, nome: id });
  const atual = [{ jogador: j('a'), stats: st(2, 1, 0, 270) }, { jogador: j('b'), stats: st(4, 1, 1, 270) }, { jogador: j('c'), stats: st(1, 0, 0, 60) }];
  const anterior = new Map([['a', st(4, 1, 1, 270)], ['b', st(4, 1, 1, 270)], ['c', st(4, 1, 1, 270)]]);
  const al = alertasProducaoIndividual(atual, anterior, cfg);
  assert.deepEqual(al.map(a => a.jogador.id), ['a']);     // 6 → 3 = −50%; b estável; c com poucos minutos
  assert.equal(al[0].variacao, -50);
  const dep = alertasDependencia([{ jogador: j('g'), posicao: 'GR', quota: 100, alternativas: 0 }], cfg);
  assert.equal(dep[0].gravidade, 'media');
  assert.deepEqual(ordenarAlertas([{ gravidade: 'baixa', variacao: -90 }, { gravidade: 'alta', variacao: -10 }]).map(a => a.gravidade), ['alta', 'baixa']);
});

test('qualidadeEventos: tipos, coordenadas, minutos, duplicados e jogador', async () => {
  const { qualidadeEventos } = await import('../js/direcao/alertas.js');
  const e = (extra = {}) => ({ match_id: 'a', tracker_id: 'remates', tipo: 'X', parte: 1, minuto: 3, x_pct: 70, y_pct: 40, player_id: 'p', ...extra });
  const q = qualidadeEventos([
    e(), e(),                                   // duplicado
    e({ x_pct: 120, y_pct: 1 }),                // coordenada inválida
    e({ tracker_id: 'passes', x_pct: 1 }),      // tipo desconhecido
    e({ minuto: null, x_pct: 2, player_id: null }),
    e({ tipo: 'Y', x_pct: 3, player_id: null }), // remate contra — não precisa de jogador
    e({ match_id: 'z' }),                        // fora dos jogos
  ], [{ id: 'a' }]);
  assert.equal(q.total, 6);
  assert.equal(q.duplicados, 1);
  assert.equal(q.coordenadasInvalidas, 1);
  assert.equal(q.tiposDesconhecidos, 1);
  assert.equal(q.semMinuto, 1);
  assert.equal(q.atribuiveis, 4);
  assert.equal(q.semJogador, 1);
});
