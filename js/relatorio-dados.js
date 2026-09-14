/**
 * Análise de Jogo — relatorio-dados.js
 * Funções puras de agregação partilhadas pelas páginas de relatório
 * (relatorio.html e transicoes.html) — buscar os dados de um jogo e
 * calcular tudo o que os dois relatórios precisam (domínio por métrica,
 * evolução por parte/momento, zona do campo, por jogador, transições,
 * remates de cruzamento, faltas provocadas).
 *
 * Exceção deliberada à convenção do projeto (normalmente cada página
 * duplica os seus próprios helpers pequenos, sem js/utils.js): esta
 * lógica é grande (~300 linhas) e é exatamente igual nas duas páginas —
 * duplicá-la é o tipo de coisa que fica dessincronizada com o tempo.
 *
 * Porta para JS os cálculos já validados em Python (parse.py/transitions.py)
 * numa conversa anterior, contra vários jogos reais — com duas melhorias
 * possíveis só porque aqui há acesso direto à base de dados:
 *   - Zona/orientação: usa events_normalizado (x/y_pct_normalizado), que já
 *     faz a rotação de 180º a partir de matches.orientacao_parte1 — não é
 *     preciso detetar a orientação empiricamente como nos CSVs.
 *   - Por jogador: agrega por player_id (sempre único), não por nome —
 *     elimina a necessidade de desambiguar jogadores com o mesmo nome.
 *   - Janelas temporais (transições/remates de cruzamento): usa
 *     events.created_at (timestamp real), não texto "Hora" parseado.
 *
 * Golos por jogador vêm sempre de `goals.player_id` (nunca de
 * match_players.golo, que é só um contador denormalizado e já vimos
 * ficar dessincronizado por um clique errado na convocatória — ver o
 * jogo Desportivo de Ronfe vs Ruivanense).
 *
 * Versão: 1.0 (2026-09-14)
 */

import { supabase } from './supabase-client.js';

export const TRACKERS = [
  { id: 'faltas', title: 'Faltas', xLabel: 'Realizadas', yLabel: 'Sofridas' },
  { id: 'perdas', title: 'Perdas de Bola', xLabel: 'Ganhos', yLabel: 'Perdas' },
  { id: 'remates', title: 'Remates', xLabel: 'A Favor', yLabel: 'Contra' },
  { id: 'cruzamentos', title: 'Cruzamentos', xLabel: 'A Favor', yLabel: 'Contra' },
  { id: 'cantos', title: 'Cantos', xLabel: 'A Favor', yLabel: 'Contra' },
];

export const TRANSITION_WINDOW_S = 40; // ver metodologia nos dashboards de transições já publicados
export const CROSS_WINDOW_S = 20;      // janela independente, remate-de-cruzamento

// ---------- Ir buscar tudo sobre um jogo ----------

export async function fetchMatchData(matchId, teamId) {
  const [matchRes, matchPlayersRes, goalsRes, eventsRes, playerEventsRes] = await Promise.all([
    supabase.from('matches').select('*').eq('id', matchId).eq('team_id', teamId).single(),
    supabase.from('match_players').select('*, players(numero, nome)').eq('match_id', matchId),
    supabase.from('goals').select('*').eq('match_id', matchId).order('minuto', { ascending: true }),
    supabase.from('events_normalizado').select('*').eq('match_id', matchId).order('created_at', { ascending: true }),
    supabase.from('player_events').select('*, players(numero, nome)').eq('match_id', matchId).order('created_at', { ascending: true }),
  ]);
  if (matchRes.error) throw matchRes.error;
  return {
    match: matchRes.data,
    matchPlayers: matchPlayersRes.data || [],
    goals: goalsRes.data || [],
    events: eventsRes.data || [],
    playerEvents: playerEventsRes.data || [],
  };
}

export function nomeJogador(matchPlayers, playerId) {
  if (!playerId) return null;
  const mp = matchPlayers.find(m => m.player_id === playerId);
  return mp ? (mp.players?.nome || null) : null;
}

export function numeroJogador(mp) {
  return mp.numero || mp.players?.numero || '';
}

function toSec(dateStr) { return new Date(dateStr).getTime() / 1000; }

// ---------- Domínio por métrica ----------

export function dominioPorMetrica(events) {
  const out = {};
  TRACKERS.forEach(t => {
    out[t.id] = {
      favor: events.filter(e => e.tracker_id === t.id && e.tipo === 'X').length,
      contra: events.filter(e => e.tracker_id === t.id && e.tipo === 'Y').length,
      favorLabel: t.xLabel,
      contraLabel: t.yLabel,
    };
  });
  return out;
}

// ---------- Evolução por parte (Cruzamentos, Remates) ----------

export function evolucaoPorParte(events) {
  const out = {};
  ['cruzamentos', 'remates'].forEach(id => {
    out[id] = {};
    [1, 2].forEach(parte => {
      out[id][parte] = {
        favor: events.filter(e => e.tracker_id === id && e.parte === parte && e.tipo === 'X').length,
        contra: events.filter(e => e.tracker_id === id && e.parte === parte && e.tipo === 'Y').length,
      };
    });
  });
  return out;
}

// ---------- Blocos de 15 min (dinâmicos, cobrem descontos além dos 45') ----------

function edgesFor(nBlocks) {
  const edges = [0, 16];
  while (edges.length <= nBlocks) edges.push(edges[edges.length - 1] + 15);
  return edges.slice(0, nBlocks + 1);
}

function nBlocksNeeded(maxMinuto) {
  let n = 3; // sempre pelo menos 0-15/16-30/31-45
  let edges = edgesFor(n);
  while (maxMinuto >= edges[edges.length - 1]) {
    n += 1;
    edges = edgesFor(n);
  }
  return n;
}

export function construirBlocos(events) {
  const blocks = [];
  [1, 2].forEach(parte => {
    const maxMinuto = events
      .filter(e => e.parte === parte && e.minuto != null)
      .reduce((m, e) => Math.max(m, e.minuto), 0);
    const n = nBlocksNeeded(maxMinuto);
    const edges = edgesFor(n);
    for (let i = 0; i < n; i++) {
      const lo = edges[i], hi = edges[i + 1];
      blocks.push({ parte, lo, hi, label: `${parte}ªP ${lo}-${hi - 1}` });
    }
  });
  return blocks;
}

export function blocoIndexFor(blocks, parte, minuto) {
  const idx = blocks.findIndex(b => b.parte === parte && b.lo <= minuto && minuto < b.hi);
  if (idx >= 0) return idx;
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].parte === parte) return i;
  return blocks.length - 1;
}

export function calcularTimeline(events, blocks) {
  const timeline = {};
  TRACKERS.forEach(t => {
    const favor = new Array(blocks.length).fill(0);
    const contra = new Array(blocks.length).fill(0);
    events.filter(e => e.tracker_id === t.id && e.minuto != null).forEach(e => {
      const idx = blocoIndexFor(blocks, e.parte, e.minuto);
      if (e.tipo === 'X') favor[idx] += 1; else contra[idx] += 1;
    });
    timeline[t.id] = { favor, contra };
  });
  const total = new Array(blocks.length).fill(0);
  TRACKERS.forEach(t => {
    for (let i = 0; i < blocks.length; i++) total[i] += timeline[t.id].favor[i] + timeline[t.id].contra[i];
  });
  return { timeline, total };
}

const LABEL_POS = { faltas_Y: 'falta(s) sofrida(s)', perdas_X: 'bola(s) ganha(s)', remates_X: 'remates a favor', cruzamentos_X: 'cruzamentos a favor', cantos_X: 'cantos a favor' };
const LABEL_NEG = { faltas_X: 'falta(s) cometida(s)', perdas_Y: 'perda(s) de bola', remates_Y: 'remates contra', cruzamentos_Y: 'cruzamentos contra', cantos_Y: 'cantos contra' };

export function resumoPorBloco(blocks, timeline, total) {
  return blocks.map((b, i) => {
    const pos = [], neg = [];
    TRACKERS.forEach(t => {
      const fv = timeline[t.id].favor[i], cv = timeline[t.id].contra[i];
      if (LABEL_POS[`${t.id}_X`] && fv) pos.push(`${fv} ${LABEL_POS[`${t.id}_X`]}`);
      if (LABEL_NEG[`${t.id}_X`] && fv) neg.push(`${fv} ${LABEL_NEG[`${t.id}_X`]}`);
      if (LABEL_POS[`${t.id}_Y`] && cv) pos.push(`${cv} ${LABEL_POS[`${t.id}_Y`]}`);
      if (LABEL_NEG[`${t.id}_Y`] && cv) neg.push(`${cv} ${LABEL_NEG[`${t.id}_Y`]}`);
    });
    return { label: b.label, pos, neg, total: total[i] };
  });
}

// ---------- Zona do campo (grelha 4×3) ----------
// Grelha própria dos relatórios (4 colunas × 3 linhas), diferente da
// zona_col/zona_row (6×4) já calculada em events_normalizado para o mapa
// de calor da tab Relatórios — mantém-se igual à já usada nos dashboards
// publicados, por isso recalcula-se aqui a partir de x/y_pct_normalizado
// em vez de reaproveitar a coluna da view.

export const ZONA_COL_LABELS = ['Recuado', 'Médio Defensivo', 'Médio Ofensivo', 'Frente'];
export const ZONA_ROW_LABELS = ['Esquerda', 'Central', 'Direita'];

function colOf(x) { return Math.min(Math.floor(x / 25), 3); }
function rowOf(y) { return Math.min(Math.floor(y / (100 / 3)), 2); }

export function calcularZonaCampo(events, blocks) {
  const zoneData = {};
  function addZone(mkey, momentoKey, x, y) {
    if (!zoneData[mkey]) zoneData[mkey] = {};
    if (!zoneData[mkey][momentoKey]) zoneData[mkey][momentoKey] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    zoneData[mkey][momentoKey][rowOf(y)][colOf(x)] += 1;
  }
  events.forEach(e => {
    if (e.x_pct_normalizado == null || e.y_pct_normalizado == null || e.minuto == null) return;
    const mkey = `${e.tracker_id}_${e.tipo}`;
    const bidx = blocoIndexFor(blocks, e.parte, e.minuto);
    addZone(mkey, 'total', e.x_pct_normalizado, e.y_pct_normalizado);
    addZone(mkey, String(bidx), e.x_pct_normalizado, e.y_pct_normalizado);
    addZone('total', 'total', e.x_pct_normalizado, e.y_pct_normalizado);
    addZone('total', String(bidx), e.x_pct_normalizado, e.y_pct_normalizado);
  });
  return zoneData;
}

// ---------- Por jogador + completude ----------

export function calcularPorJogador(events, matchPlayers) {
  const completude = {};
  const agg = new Map(); // player_id -> { faltas_X: n, ... }
  TRACKERS.forEach(t => {
    ['X', 'Y'].forEach(tipo => {
      const sub = events.filter(e => e.tracker_id === t.id && e.tipo === tipo);
      if (!sub.length) return;
      const label = `${t.title} ${tipo === 'X' ? t.xLabel : t.yLabel}`;
      const semJogador = sub.filter(e => !e.player_id).length;
      completude[label] = { total: sub.length, semJogador, pctSem: Math.round((semJogador / sub.length) * 1000) / 10 };
      sub.forEach(e => {
        if (!e.player_id) return;
        if (!agg.has(e.player_id)) agg.set(e.player_id, {});
        const row = agg.get(e.player_id);
        const key = `${t.id}_${tipo}`;
        row[key] = (row[key] || 0) + 1;
      });
    });
  });
  const table = [...agg.entries()].map(([playerId, counts]) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { playerId, nome: nomeJogador(matchPlayers, playerId) || '?', total, ...counts };
  }).sort((a, b) => b.total - a.total);
  return { table, completude };
}

// ---------- Golos e assistências (goals.player_id é sempre a fonte fiável) ----------

export function golosPorJogador(goals) {
  const contagem = new Map();
  goals.filter(g => g.tipo === 'marcado' && g.player_id).forEach(g => {
    contagem.set(g.player_id, (contagem.get(g.player_id) || 0) + 1);
  });
  return contagem;
}

// Assistência = registo mais próximo no tempo em player_events (tipo
// 'assistencias'), antes ou depois do golo (a ordem varia consoante o
// jogo — ver dashboards de transições já publicados), até 60s de distância.
export function marcadoresComAssistencia(goals, playerEvents) {
  const assistEvents = playerEvents.filter(pe => pe.tipo === 'assistencias');
  return goals.filter(g => g.tipo === 'marcado').map(g => {
    const tGolo = toSec(g.created_at);
    let melhor = null;
    assistEvents.forEach(pe => {
      const dt = Math.abs(toSec(pe.created_at) - tGolo);
      if (dt <= 60 && (!melhor || dt < melhor.dt)) melhor = { playerId: pe.player_id, dt };
    });
    return {
      playerId: g.player_id,
      parte: g.parte,
      minuto: g.minuto,
      assistPlayerId: melhor ? melhor.playerId : null,
    };
  }).sort((a, b) => (a.parte * 100 + a.minuto) - (b.parte * 100 + b.minuto));
}

// ---------- Contexto dos golos sofridos (últimos eventos antes de cada um) ----------

export function contextoGolosSofridos(events, goals, janelaS = 90, nMax = 3) {
  return goals.filter(g => g.tipo === 'sofrido').map(g => {
    const linked = events.filter(e => e.goal_id === g.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const refTime = linked.length ? linked[0].created_at : g.created_at;
    const tGolo = toSec(refTime);
    const antes = events
      .filter(e => e.parte === g.parte)
      .map(e => ({ e, delta: tGolo - toSec(e.created_at) }))
      .filter(x => x.delta > 0 && x.delta <= janelaS)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, nMax);
    return {
      parte: g.parte,
      minuto: g.minuto,
      eventosAntes: antes.map(({ e, delta }) => ({
        deltaS: Math.round(delta), trackerId: e.tracker_id, tipo: e.tipo, minuto: e.minuto, jogadorId: e.player_id,
      })),
    };
  }).sort((a, b) => (a.parte * 100 + a.minuto) - (b.parte * 100 + b.minuto));
}

// ---------- Transições (defensiva: Perda-Y -> Cruz/Remate-Y ; ofensiva: Ganho-X -> Cruz/Remate-X) ----------

export function calcularTransicoes(events, tipo, windowS = TRANSITION_WINDOW_S) {
  const triggers = events.filter(e => e.tracker_id === 'perdas' && e.tipo === tipo);
  const consequencias = events.filter(e => (e.tracker_id === 'cruzamentos' || e.tracker_id === 'remates') && e.tipo === tipo);
  const out = [];
  let minDeltaGeral = null;
  triggers.forEach(trig => {
    const tSec = toSec(trig.created_at);
    const candidatos = consequencias
      .filter(r => r.parte === trig.parte && toSec(r.created_at) > tSec)
      .map(r => ({ r, delta: toSec(r.created_at) - tSec }))
      .sort((a, b) => a.delta - b.delta);
    if (!candidatos.length) return;
    const { r, delta } = candidatos[0];
    if (minDeltaGeral === null || delta < minDeltaGeral) minDeltaGeral = delta;
    if (delta <= windowS) {
      out.push({
        parte: trig.parte, minutoTrigger: trig.minuto, jogadorTriggerId: trig.player_id,
        trackerConsequencia: r.tracker_id, minutoConsequencia: r.minuto, jogadorConsequenciaId: r.player_id,
        golo: !!r.goal_id, deltaS: Math.round(delta),
      });
    }
  });
  return {
    windowS, nTrigger: triggers.length, nTransicoes: out.length,
    tempoMedioS: out.length ? Math.round((out.reduce((a, t) => a + t.deltaS, 0) / out.length) * 10) / 10 : null,
    nGolos: out.filter(t => t.golo).length,
    minDeltaGeralS: minDeltaGeral !== null ? Math.round(minDeltaGeral) : null,
    transicoes: out.sort((a, b) => (a.parte * 100 + a.minutoTrigger) - (b.parte * 100 + b.minutoTrigger)),
  };
}

// ---------- Remates provenientes de cruzamento (janela de 20s, independente) ----------

export function calcularRematesDeCruzamento(events, tipo, windowS = CROSS_WINDOW_S) {
  const remates = events.filter(e => e.tracker_id === 'remates' && e.tipo === tipo);
  const cruzamentos = events.filter(e => e.tracker_id === 'cruzamentos' && e.tipo === tipo);
  const casos = [];
  remates.forEach(r => {
    const rSec = toSec(r.created_at);
    const candidatos = cruzamentos
      .filter(c => c.parte === r.parte && (rSec - toSec(c.created_at)) >= 0 && (rSec - toSec(c.created_at)) <= windowS)
      .map(c => ({ c, delta: rSec - toSec(c.created_at) }))
      .sort((a, b) => a.delta - b.delta);
    if (!candidatos.length) return;
    const { c, delta } = candidatos[0];
    casos.push({
      parte: r.parte, minutoCruzamento: c.minuto, jogadorCruzamentoId: c.player_id,
      minutoRemate: r.minuto, jogadorRemateId: r.player_id, deltaS: Math.round(delta), golo: !!r.goal_id,
    });
  });
  return {
    totalRemates: remates.length, totalCruzamentos: cruzamentos.length,
    casos: casos.sort((a, b) => (a.parte * 100 + a.minutoRemate) - (b.parte * 100 + b.minutoRemate)),
  };
}

// ---------- Faltas provocadas por perda/ganho de bola (com zona) ----------

export function calcularFaltasAposTransicao(events, triggerTipo, faltaTipo, windowS = TRANSITION_WINDOW_S) {
  const triggers = events.filter(e => e.tracker_id === 'perdas' && e.tipo === triggerTipo);
  const faltas = events.filter(e => e.tracker_id === 'faltas' && e.tipo === faltaTipo);
  const out = [];
  let minDeltaGeral = null;
  triggers.forEach(trig => {
    const tSec = toSec(trig.created_at);
    const candidatos = faltas
      .filter(f => f.parte === trig.parte && toSec(f.created_at) > tSec)
      .map(f => ({ f, delta: toSec(f.created_at) - tSec }))
      .sort((a, b) => a.delta - b.delta);
    if (!candidatos.length) return;
    const { f, delta } = candidatos[0];
    if (minDeltaGeral === null || delta < minDeltaGeral) minDeltaGeral = delta;
    if (delta <= windowS && f.x_pct_normalizado != null && f.y_pct_normalizado != null) {
      out.push({
        parte: trig.parte, minutoTrigger: trig.minuto, jogadorTriggerId: trig.player_id,
        minutoFalta: f.minuto, jogadorFaltaId: f.player_id, deltaS: Math.round(delta),
        zonaCol: colOf(f.x_pct_normalizado), zonaRow: rowOf(f.y_pct_normalizado),
      });
    }
  });
  return {
    windowS, nTrigger: triggers.length, nFaltas: out.length,
    tempoMedioS: out.length ? Math.round((out.reduce((a, t) => a + t.deltaS, 0) / out.length) * 10) / 10 : null,
    minDeltaGeralS: minDeltaGeral !== null ? Math.round(minDeltaGeral) : null,
    casos: out.sort((a, b) => (a.parte * 100 + a.minutoTrigger) - (b.parte * 100 + b.minutoTrigger)),
  };
}

export function zonaGridDeCasos(casos) {
  const grid = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  casos.forEach(c => { grid[c.zonaRow][c.zonaCol] += 1; });
  return grid;
}
