/**
 * Análise de Jogo — js/direcao/territorial.js
 * Fórmulas da Análise Territorial (pages/direcao.html, fase 4). Só
 * funções puras, testadas em tests/territorial.test.mjs.
 *
 * Coordenadas: x_pct_normalizado / y_pct_normalizado de
 * events_normalizado (0–100, a equipa ataca sempre para a direita; y
 * pequeno = topo do ecrã = corredor esquerdo da equipa). Os mapas
 * representam a densidade dos eventos registados — não a ocupação real
 * do terreno.
 *
 * Verificação da orientação: a normalização depende de
 * matches.orientacao_parte1, que é escolhida à mão no jogo. Se estiver
 * errada, uma parte inteira fica ao contrário. verificarOrientacao()
 * confirma-o pelos dados: as ações ofensivas a favor (remates,
 * cruzamentos e cantos X) têm de cair sobretudo na metade de ataque
 * (x > 50) e as mesmas ações contra (Y) na nossa metade (x < 50).
 *
 * Versão: 1.0 (2026-11-17)
 */

import { blocoDe15, TERCOS, CORREDORES } from './metricas.js';

// ---------- Filtro ----------

// Momentos do jogo: jogo todo, cada parte, ou um bloco de 15 min.
export const MOMENTOS = [
  ['todo', 'Jogo todo'], ['p1', '1ª parte'], ['p2', '2ª parte'],
  ['b0', '1ª parte 0–15'], ['b1', '1ª parte 15–30'], ['b2', '1ª parte 30–45+'],
  ['b3', '2ª parte 0–15 (45–60)'], ['b4', '2ª parte 15–30 (60–75)'], ['b5', '2ª parte 30–45+ (75–90+)'],
];

function noMomento(e, momento) {
  if (!momento || momento === 'todo') return true;
  if (momento === 'p1') return e.parte === 1;
  if (momento === 'p2') return e.parte === 2;
  const b = blocoDe15(e.parte, e.minuto);
  return b != null && `b${b}` === momento;
}

// f: { tracker, tipo, matchIds (Set|null = todos), playerId (null = todos), momento }
export function filtrarEventos(eventos, f) {
  return eventos.filter(e =>
    (!f.tracker || e.tracker_id === f.tracker)
    && (!f.tipo || e.tipo === f.tipo)
    && (!f.matchIds || f.matchIds.has(e.match_id))
    && (!f.playerId || e.player_id === f.playerId)
    && noMomento(e, f.momento));
}

// ---------- Densidade ----------

// Grelha cols × rows (linhas de cima para baixo) com a contagem de
// eventos em cada célula. x = 100 / y = 100 vão para a última célula.
export function densidade(eventos, cols = 12, rows = 8) {
  const g = Array.from({ length: rows }, () => Array(cols).fill(0));
  eventos.forEach(e => {
    const x = e.x_pct_normalizado, y = e.y_pct_normalizado;
    if (x == null || y == null) return;
    const c = Math.min(cols - 1, Math.max(0, Math.floor((x / 100) * cols)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((y / 100) * rows)));
    g[r][c]++;
  });
  return g;
}

// ---------- Terços e corredores ----------

const contar = (lista, chave, eventos) => Object.fromEntries(lista.map(v => [v, eventos.filter(e => e[chave] === v).length]));

export function distribuicaoZonas(eventos) {
  const terco = contar(TERCOS, 'terco', eventos);
  const corredor = contar(CORREDORES, 'corredor', eventos);
  const total = TERCOS.reduce((n, t) => n + terco[t], 0);
  const pct = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, total ? (v / total) * 100 : null]));
  return { total, terco, corredor, tercoPct: pct(terco), corredorPct: pct(corredor) };
}

// Comparação territorial entre dois períodos: por zona, a média por jogo
// em cada período e a variação da quota (pontos percentuais) — a quota
// compara onde acontecem as ações, independentemente do volume.
export function compararZonas(dAtual, nAtual, dAnterior, nAnterior) {
  const linhas = (lista, chave) => lista.map(z => {
    const a = dAtual[chave][z], b = dAnterior[chave][z];
    const pa = dAtual[`${chave}Pct`][z], pb = dAnterior[`${chave}Pct`][z];
    return {
      zona: z,
      atualPorJogo: nAtual ? a / nAtual : null,
      anteriorPorJogo: nAnterior ? b / nAnterior : null,
      quotaAtual: pa,
      quotaAnterior: pb,
      difPp: pa == null || pb == null ? null : pa - pb,
    };
  });
  return { terco: linhas(TERCOS, 'terco'), corredor: linhas(CORREDORES, 'corredor') };
}

// ---------- Verificação da orientação ----------

const OFENSIVOS = new Set(['remates', 'cruzamentos', 'cantos']);

// Por jogo e parte: posição média (x normalizado) das ações ofensivas a
// favor e "espelhada" (100 − x) das contra — as duas devem ser > 50.
// Com menos de minEventos não há evidência suficiente para dizer nada.
// estado: 'ok' | 'suspeito' | 'insuficiente'.
export function verificarOrientacao(eventos, { minEventos = 4 } = {}) {
  const grupos = new Map();
  eventos.forEach(e => {
    if (!OFENSIVOS.has(e.tracker_id) || e.x_pct_normalizado == null) return;
    const k = `${e.match_id}|${e.parte}`;
    if (!grupos.has(k)) grupos.set(k, { match_id: e.match_id, parte: e.parte, n: 0, soma: 0 });
    const g = grupos.get(k);
    g.n++;
    g.soma += e.tipo === 'X' ? e.x_pct_normalizado : 100 - e.x_pct_normalizado;
  });
  return [...grupos.values()].map(g => {
    const indice = g.soma / g.n; // 0–100: > 50 = de acordo com a orientação registada
    const estado = g.n < minEventos ? 'insuficiente' : (indice < 50 ? 'suspeito' : 'ok');
    return { match_id: g.match_id, parte: g.parte, eventos: g.n, indice, estado };
  }).sort((a, b) => (a.match_id < b.match_id ? -1 : a.match_id > b.match_id ? 1 : a.parte - b.parte));
}
