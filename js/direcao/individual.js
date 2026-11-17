/**
 * Análise de Jogo — js/direcao/individual.js
 * Fórmulas da Performance Individual (pages/direcao.html, fase 5). Só
 * funções puras, testadas em tests/individual.test.mjs.
 *
 * Ações de um jogador = eventos com player_id. A atribuição de jogador é
 * opcional no registo, por isso os totais individuais são um mínimo
 * (cobertura() diz que parte dos eventos tem jogador).
 *
 * Minutos: minutosJogados() (mesma regra da migração 034), mas null —
 * desconhecido, nunca 0 — quando faltam tempos do jogo ou o minuto de
 * uma substituição (senão um suplente que entrou contava 0 minutos e um
 * titular substituído contava o jogo todo).
 *
 * Por 90: só com jogos de codificação completa e minutos conhecidos
 * (numerador e denominador dos mesmos jogos) e pelo menos minMinutos no
 * total — abaixo disso o valor é demasiado instável e fica n/d.
 *
 * Versão: 1.0 (2026-11-17)
 */

import { minutosJogados, por90, racio, TERCOS } from './metricas.js';

// Ações atribuíveis a um jogador da equipa (as "contra" de remates,
// cruzamentos e cantos são do adversário e não entram).
export const ACOES = [
  { id: 'ganhos', label: 'Ganhos de bola', curto: 'Ganhos', tracker: 'perdas', tipo: 'X' },
  { id: 'perdas', label: 'Perdas de bola', curto: 'Perdas', tracker: 'perdas', tipo: 'Y' },
  { id: 'remates', label: 'Remates', curto: 'Remates', tracker: 'remates', tipo: 'X' },
  { id: 'cruzamentos', label: 'Cruzamentos', curto: 'Cruz.', tracker: 'cruzamentos', tipo: 'X' },
  { id: 'faltasC', label: 'Faltas cometidas', curto: 'Faltas c.', tracker: 'faltas', tipo: 'X' },
  { id: 'faltasS', label: 'Faltas sofridas', curto: 'Faltas s.', tracker: 'faltas', tipo: 'Y' },
];
const acaoDe = (e) => ACOES.find(a => a.tracker === e.tracker_id && a.tipo === e.tipo);

export const MIN_MINUTOS_90 = 90;

// Minutos de um jogador num jogo, ou null se não for possível sabê-los.
// mp: linha de match_players; tempos: { parte1_inicio, parte1_fim, parte2_inicio, parte2_fim }.
export function minutosNoJogo(mp, tempos) {
  if (!mp) return null;
  if (!tempos || !tempos.parte1_inicio || !tempos.parte1_fim || !tempos.parte2_inicio || !tempos.parte2_fim) return null;
  const semMinuto = !(mp.parte_substituicao && mp.minuto_substituicao != null);
  if (mp.substituicao && semMinuto) return null;
  return minutosJogados(mp, tempos);
}

// jogos: v_jogo_resumo do período (ordem cronológica); detalhe: { eventos, convocados, tempos }.
export function estatisticasJogador(playerId, jogos, detalhe, { minMinutos = MIN_MINUTOS_90 } = {}) {
  const tempos = new Map(detalhe.tempos.map(t => [t.id, t]));
  const ids = new Set(jogos.map(j => j.id));
  const evs = detalhe.eventos.filter(e => e.player_id === playerId && ids.has(e.match_id));
  const zero = () => Object.fromEntries(ACOES.map(a => [a.id, 0]));

  const porJogo = jogos.map(j => {
    const mp = detalhe.convocados.find(c => c.match_id === j.id && c.player_id === playerId);
    const acoes = zero();
    evs.filter(e => e.match_id === j.id).forEach(e => { const a = acaoDe(e); if (a) acoes[a.id]++; });
    const minutos = mp ? minutosNoJogo(mp, tempos.get(j.id)) : null;
    const jogou = !!mp && (mp.estado === 'Titular' || mp.substituicao === 'Entrou');
    return { jogo: j, convocado: !!mp, titular: mp?.estado === 'Titular', jogou, minutos, acoes, comEventos: Object.values(acoes).some(n => n > 0) };
  });

  const total = zero();
  porJogo.forEach(p => ACOES.forEach(a => { total[a.id] += p.acoes[a.id]; }));

  // Base do "por 90": jogos com codificação completa, minutos conhecidos e > 0.
  const base = porJogo.filter(p => p.jogo.codificacao === 'completa' && p.minutos > 0);
  const minutosBase = base.reduce((n, p) => n + p.minutos, 0);
  const p90 = Object.fromEntries(ACOES.map(a => [a.id, minutosBase >= minMinutos
    ? por90(base.reduce((n, p) => n + p.acoes[a.id], 0), minutosBase)
    : null]));

  const jogados = porJogo.filter(p => p.jogou);
  const minutosEmFalta = jogados.some(p => p.minutos == null);
  const zonas = Object.fromEntries(TERCOS.map(t => [t, evs.filter(e => acaoDe(e) && e.terco === t).length]));

  return {
    porJogo,
    convocatorias: porJogo.filter(p => p.convocado).length,
    jogos: jogados.length,
    titularidades: porJogo.filter(p => p.titular).length,
    minutos: jogados.length ? jogados.reduce((n, p) => n + (p.minutos || 0), 0) : 0,
    minutosEmFalta,
    jogosComEventos: porJogo.filter(p => p.comEventos).length,
    total,
    racio: racio(total.ganhos, total.perdas),
    por90: p90,
    minutosBase90: minutosBase,
    zonas,
    eventos: evs,
  };
}

// Que parte dos eventos de cada ação tem jogador atribuído (nos jogos dados).
export function cobertura(eventos, jogos) {
  const ids = new Set(jogos.map(j => j.id));
  return Object.fromEntries(ACOES.map(a => {
    const doTipo = eventos.filter(e => ids.has(e.match_id) && e.tracker_id === a.tracker && e.tipo === a.tipo);
    const com = doTipo.filter(e => e.player_id).length;
    return [a.id, { total: doTipo.length, comJogador: com, pct: doTipo.length ? (com / doTipo.length) * 100 : null }];
  }));
}

// Jogadores convocados em pelo menos um dos jogos, por número.
export function jogadoresDoPeriodo(convocados, jogos) {
  const ids = new Set(jogos.map(j => j.id));
  const m = new Map();
  convocados.forEach(c => { if (ids.has(c.match_id) && c.players) m.set(c.players.id, c.players); });
  return [...m.values()].sort((a, b) => (Number(a.numero) || 999) - (Number(b.numero) || 999));
}
