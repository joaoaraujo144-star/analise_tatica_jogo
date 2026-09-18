/**
 * Análise de Jogo — transicoes.js
 * Dashboard de transições rápidas (perda/ganho de bola → perigo), remates
 * provenientes de cruzamento, e faltas provocadas por perda/ganho de bola
 * (com zona do campo) — mesma metodologia dos dashboards feitos à mão
 * numa conversa anterior. Agregação em js/relatorio-dados.js (partilhado
 * com relatorio.js); este ficheiro só desenha.
 *
 * Versão: 1.4 (2026-09-17)
 * Histórico:
 *   1.0 (2026-09-14) — criação, com o tema escuro partilhado (css/styles.css).
 *   1.1 (2026-09-14) — cor do destaque "GOLO"/zona da grelha passa a var(--bad)/
 *                       var(--accent), a acompanhar o visual próprio novo de
 *                       pages/transicoes.html.
 *   1.2 (2026-09-17) — botão "Gerar análise" fica escondido numa equipa de
 *                       teste (trial_teams) — a Edge Function gerar-insights
 *                       também recusa o pedido, isto só evita mostrar um botão
 *                       que ia falhar.
 *   1.3 (2026-09-17) — "Sair" numa equipa de teste leva a trial.html em vez de
 *                       login.html (reaproveita a mesma verificação de
 *                       trial_teams feita para o botão "Gerar análise").
 *   1.4 (2026-09-17) — corrige "Sair" numa equipa de teste: deixa de chamar
 *                       supabase.auth.signOut() (destruía a sessão anónima que
 *                       liga a equipa de teste, impedindo start_trial() de a
 *                       reconhecer da próxima vez).
 */

import { supabase } from './supabase-client.js';
import {
  TRACKERS, fetchMatchData, nomeJogador,
  TRANSITION_WINDOW_S, calcularTransicoes, contextoGolosSofridos,
  calcularRematesDeCruzamento, calcularFaltasAposTransicao, zonaGridDeCasos,
  ZONA_COL_LABELS, ZONA_ROW_LABELS,
} from './relatorio-dados.js';

const el = (id) => document.getElementById(id);
const TLABEL = Object.fromEntries(TRACKERS.map(t => [t.id, t.title]));
const TRACKER_LC = { faltas: 'faltas', perdas: 'perda de bola', remates: 'remate', cruzamentos: 'cruzamento', cantos: 'canto' };

const currentTeamId = localStorage.getItem('current_team_id') || null;
const currentMatchId = localStorage.getItem('current_match_id') || null;

let isTrialTeam = false;
let D = null;
let defensivas, ofensivas, crossFavor, crossContra, faltasPerda, faltasGanho, contextoGolos;

function nome(id) { return nomeJogador(D.matchPlayers, id) || '?'; }

// ---------- Funis (defensiva + ofensiva) ----------

function renderFunnelBlock(dir, data, labelTrigger, labelConsequencia) {
  const pct = data.nTrigger ? Math.round(100 * data.nTransicoes / data.nTrigger) : 0;
  const isZero = data.nTransicoes === 0;
  const pctClass = isZero ? 'zero' : (dir === 'defensiva' ? 'bad' : 'good');
  const div = document.createElement('div');
  div.className = `funil-card ${dir}`;
  let html = `<div class="funil-title">${dir === 'defensiva' ? '⬇ Defensiva (perda → perigo sofrido)' : '⬆ Ofensiva (ganho → perigo criado)'}</div>`;
  html += `<div class="funil-row">
    <div class="funil-step"><div class="funil-num">${data.nTrigger}</div><div class="funil-label">${labelTrigger}</div></div>
    <div class="funil-arrow">→</div>
    <div class="funil-step"><div class="funil-num ${isZero ? 'zero' : ''}">${data.nTransicoes}</div><div class="funil-label">${labelConsequencia}</div><div class="funil-pct ${pctClass}">${pct}%</div></div>
  </div>`;
  if (data.transicoes.length) {
    html += '<div class="funil-cases">';
    data.transicoes.forEach(t => {
      html += `<div class="funil-case-row"><span class="funil-case-min">${t.minutoTrigger}'</span><span>${nome(t.jogadorTriggerId)} → ${TRACKER_LC[t.trackerConsequencia]} min ${t.minutoConsequencia}' (+${t.deltaS}s)${t.golo ? ' <b style="color:var(--bad)">GOLO</b>' : ''}</span></div>`;
    });
    html += '</div>';
  } else {
    html += `<div class="empty">Nenhum caso dentro de ${data.windowS}s — o mais próximo ficou a ${data.minDeltaGeralS ?? '—'}s.</div>`;
  }
  div.innerHTML = html;
  return div;
}

function renderFunnels() {
  el('method-window').textContent = TRANSITION_WINDOW_S;
  const holder = el('funnels');
  holder.innerHTML = '';
  holder.appendChild(renderFunnelBlock('defensiva', defensivas, 'Perdas de bola', 'Viraram transição perigosa'));
  holder.appendChild(renderFunnelBlock('ofensiva', ofensivas, 'Ganhos de bola', 'Viraram contra-ataque'));
}

// ---------- Golos sofridos (ou nota de baliza a zero) ----------

function renderGolosContexto() {
  const holder = el('golos-context-holder');
  holder.innerHTML = '';
  if (!contextoGolos.length) {
    el('golos-context-title').textContent = 'Golos sofridos: 0';
    el('golos-context-sub').textContent = '';
    const div = document.createElement('div');
    div.className = 'insight-card good';
    div.innerHTML = `<p><b>Baliza a zero.</b> A equipa não sofreu nenhum golo neste jogo — não há eventos a analisar aqui. Ver o funil "Defensiva" acima: também não houve nenhuma transição perigosa dentro da janela de ${TRANSITION_WINDOW_S}s.</p>`;
    holder.appendChild(div);
    return;
  }
  el('golos-context-title').textContent = `Como sofremos os ${contextoGolos.length} golo(s)`;
  contextoGolos.forEach(g => {
    const card = document.createElement('div');
    card.className = 'funil-card defensiva';
    let html = `<div class="funil-title">⚽ Golo sofrido — ${g.minuto}' (${g.parte}ª parte)</div>`;
    if (!g.eventosAntes.length) {
      html += '<div class="empty">Sem eventos registados nos 90s anteriores (início do jogo).</div>';
    } else {
      html += '<div class="funil-cases">';
      g.eventosAntes.forEach(e => {
        const desc = `${TRACKER_LC[e.trackerId] || e.trackerId} (${e.tipo === 'Y' ? 'contra' : 'a favor'})${e.jogadorId ? ' — ' + nome(e.jogadorId) : ''}`;
        html += `<div class="funil-case-row"><span class="funil-case-min">-${e.deltaS}s</span><span>${desc}</span></div>`;
      });
      html += `<div class="funil-case-row"><span class="funil-case-min">0s</span><span style="color:var(--bad);font-weight:bold">Golo sofrido</span></div></div>`;
    }
    card.innerHTML = html;
    holder.appendChild(card);
  });
}

// ---------- Remates de cruzamento ----------

function renderCrossSection(title, data, isFavor) {
  const div = document.createElement('div');
  div.className = 'tracker';
  const pct = data.totalRemates ? Math.round(100 * data.casos.length / data.totalRemates) : 0;
  let html = `<h3 class="tracker-title">${title}</h3>
    <p class="hint">${data.totalRemates} remates ${isFavor ? 'a favor' : 'contra'} · ${data.casos.length} de cruzamento (${pct}%)</p>`;
  if (data.casos.length) {
    html += '<div class="funil-cases">';
    data.casos.forEach(c => {
      html += `<div class="funil-case-row${c.golo ? ' golo-case' : ''}">
        <span>P${c.parte} cruz. ${c.minutoCruzamento}'${c.jogadorCruzamentoId ? ' (' + nome(c.jogadorCruzamentoId) + ')' : ''}</span>
        <span>→</span>
        <span>remate ${c.minutoRemate}'${c.jogadorRemateId ? ' (' + nome(c.jogadorRemateId) + ')' : ''} (+${c.deltaS}s)</span>
        ${c.golo ? '<b style="color:var(--bad)">GOLO</b>' : ''}
      </div>`;
    });
    html += '</div>';
  } else {
    html += '<div class="empty">Nenhum remate teve um cruzamento nos 20s anteriores.</div>';
  }
  div.innerHTML = html;
  return div;
}

function renderCrossSections() {
  const holder = el('cross-sections');
  holder.innerHTML = '';
  holder.appendChild(renderCrossSection('A favor', crossFavor, true));
  holder.appendChild(renderCrossSection('Contra', crossContra, false));
}

// ---------- Faltas provocadas por perda/ganho de bola ----------

function renderZoneMini(grid) {
  const maxVal = Math.max(1, ...grid.flat());
  const gridEl = document.createElement('div');
  gridEl.className = 'zona-grid';
  gridEl.style.gridTemplateColumns = '64px repeat(4, 1fr)';
  gridEl.style.marginTop = '10px';
  gridEl.appendChild(document.createElement('div'));
  ZONA_COL_LABELS.forEach(c => {
    const d = document.createElement('div');
    d.className = 'zona-col-head';
    d.textContent = c;
    gridEl.appendChild(d);
  });
  grid.forEach((row, ri) => {
    const rowHead = document.createElement('div');
    rowHead.className = 'zona-row-head';
    rowHead.textContent = ZONA_ROW_LABELS[ri];
    gridEl.appendChild(rowHead);
    row.forEach((v, ci) => {
      const cell = document.createElement('div');
      cell.className = 'zona-cell';
      const t = v / maxVal;
      cell.style.background = v === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--accent) ${Math.round(20 + t * 70)}%, var(--surface-2))`;
      cell.textContent = v || '';
      cell.title = `${ZONA_ROW_LABELS[ri]} · ${ZONA_COL_LABELS[ci]}: ${v} caso(s)`;
      gridEl.appendChild(cell);
    });
  });
  return gridEl;
}

function renderFaltaFunnelBlock(dir, data, labelTrigger) {
  const pct = data.nTrigger ? Math.round(100 * data.nFaltas / data.nTrigger) : 0;
  const isZero = data.nFaltas === 0;
  const pctClass = isZero ? 'zero' : (dir === 'defensiva' ? 'bad' : 'good');
  const div = document.createElement('div');
  div.className = `funil-card ${dir}`;
  const labelConsequencia = dir === 'defensiva' ? 'Faltas cometidas' : 'Faltas sofridas';
  let html = `<div class="funil-title">${dir === 'defensiva' ? '⬇ Perda → falta cometida por nós' : '⬆ Ganho → falta sofrida por nós'}</div>`;
  html += `<div class="funil-row">
    <div class="funil-step"><div class="funil-num">${data.nTrigger}</div><div class="funil-label">${labelTrigger}</div></div>
    <div class="funil-arrow">→</div>
    <div class="funil-step"><div class="funil-num ${isZero ? 'zero' : ''}">${data.nFaltas}</div><div class="funil-label">${labelConsequencia}</div><div class="funil-pct ${pctClass}">${pct}%</div></div>
  </div>`;
  if (data.casos.length) {
    html += '<div class="funil-cases">';
    data.casos.forEach(c => {
      html += `<div class="funil-case-row"><span class="funil-case-min">${c.minutoTrigger}'</span><span>${nome(c.jogadorTriggerId)} → falta ${nome(c.jogadorFaltaId)} min ${c.minutoFalta}' (+${c.deltaS}s) — ${ZONA_ROW_LABELS[c.zonaRow]} · ${ZONA_COL_LABELS[c.zonaCol]}</span></div>`;
    });
    html += '</div>';
  } else {
    html += `<div class="empty">Nenhum caso dentro de ${data.windowS}s — o mais próximo ficou a ${data.minDeltaGeralS ?? '—'}s.</div>`;
  }
  div.innerHTML = html;
  div.appendChild(renderZoneMini(zonaGridDeCasos(data.casos)));
  return div;
}

function renderFaltaFunnels() {
  const holder = el('falta-funnels');
  holder.innerHTML = '';
  holder.appendChild(renderFaltaFunnelBlock('defensiva', faltasPerda, 'Perdas de bola'));
  holder.appendChild(renderFaltaFunnelBlock('ofensiva', faltasGanho, 'Ganhos de bola'));
}

// ---------- Insights (Edge Function gerar-insights) ----------

function renderInsights(insights) {
  const holder = el('insights-list');
  holder.innerHTML = '';
  (insights || []).forEach(it => {
    const div = document.createElement('div');
    div.className = `insight-card ${it.level || 'info'}`;
    div.innerHTML = `<span class="insight-badge">${it.badge || ''}</span><p>${it.text || ''}</p>`;
    holder.appendChild(div);
  });
}

function agregarParaInsights() {
  return {
    meta: { adversario: D.match.adversario, data: D.match.data },
    defensivas: { nTrigger: defensivas.nTrigger, nTransicoes: defensivas.nTransicoes, nGolos: defensivas.nGolos, windowS: defensivas.windowS },
    ofensivas: { nTrigger: ofensivas.nTrigger, nTransicoes: ofensivas.nTransicoes, nGolos: ofensivas.nGolos, tempoMedioS: ofensivas.tempoMedioS, windowS: ofensivas.windowS },
    crossFavor: { total: crossFavor.totalRemates, casos: crossFavor.casos.length },
    crossContra: { total: crossContra.totalRemates, casos: crossContra.casos.length },
    faltasPerda: { nTrigger: faltasPerda.nTrigger, nFaltas: faltasPerda.nFaltas },
    faltasGanho: { nTrigger: faltasGanho.nTrigger, nFaltas: faltasGanho.nFaltas },
    golosSofridos: contextoGolos.length,
  };
}

async function carregarInsightsCache() {
  const { data } = await supabase.from('report_insights').select('*').eq('match_id', currentMatchId).eq('tipo', 'transicoes').maybeSingle();
  if (data) {
    renderInsights(data.conteudo);
    el('insights-status').textContent = `Gerada em ${new Date(data.gerado_em).toLocaleString('pt-PT')}.`;
    el('btn-gerar-insights').textContent = 'Regenerar análise';
  }
}

function wireInsights() {
  el('btn-gerar-insights').addEventListener('click', async () => {
    const btn = el('btn-gerar-insights');
    btn.disabled = true;
    el('insights-status').textContent = 'A gerar análise...';
    try {
      const { data, error } = await supabase.functions.invoke('gerar-insights', {
        body: { tipo: 'transicoes', dados: agregarParaInsights() },
      });
      if (error) throw error;
      renderInsights(data.insights);
      await supabase.from('report_insights').upsert({
        team_id: currentTeamId, match_id: currentMatchId, tipo: 'transicoes', conteudo: data.insights,
      }, { onConflict: 'match_id,tipo' });
      el('insights-status').textContent = 'Gerada agora.';
      btn.textContent = 'Regenerar análise';
    } catch (err) {
      el('insights-status').textContent = `Erro ao gerar: ${err.message || err}`;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Init ----------

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  if (!currentTeamId) { window.location.href = 'teams.html'; return; }
  if (!currentMatchId) { window.location.href = 'dashboard.html'; return; }

  const { data: trial } = await supabase.from('trial_teams').select('team_id').eq('team_id', currentTeamId).maybeSingle();
  isTrialTeam = !!trial;

  el('btn-sign-out').addEventListener('click', async () => {
    localStorage.removeItem('current_team_id');
    localStorage.removeItem('current_match_id');
    if (isTrialTeam) {
      // Não faz supabase.auth.signOut(): destruiria de vez a sessão anónima,
      // impedindo start_trial() de reconhecer esta equipa da próxima vez.
      window.location.href = 'trial.html';
      return;
    }
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
  el('btn-voltar-jogo').addEventListener('click', () => { window.location.href = 'match.html'; });

  const { data: team } = await supabase.from('teams').select('*').eq('id', currentTeamId).single();
  D = await fetchMatchData(currentMatchId, currentTeamId);
  if (!D.match) { window.location.href = 'dashboard.html'; return; }

  el('team-indicator').textContent = team ? `Equipa: ${team.nome}` : 'Equipa';
  el('match-indicator').textContent = `Jogo: vs ${D.match.adversario} (${D.match.data})`;

  defensivas = calcularTransicoes(D.events, 'Y');
  ofensivas = calcularTransicoes(D.events, 'X');
  crossFavor = calcularRematesDeCruzamento(D.events, 'X');
  crossContra = calcularRematesDeCruzamento(D.events, 'Y');
  faltasPerda = calcularFaltasAposTransicao(D.events, 'Y', 'X');
  faltasGanho = calcularFaltasAposTransicao(D.events, 'X', 'Y');
  contextoGolos = contextoGolosSofridos(D.events, D.goals);

  renderFunnels();
  renderGolosContexto();
  renderCrossSections();
  renderFaltaFunnels();

  // Equipas de teste (pages/trial.html, ver trial_teams) não têm acesso à
  // análise por IA — a Edge Function também recusa o pedido, isto é só
  // para não mostrar um botão que ia falhar.
  if (isTrialTeam) {
    el('btn-gerar-insights').hidden = true;
    el('insights-status').textContent = 'Análise por IA indisponível na versão de teste.';
  } else {
    wireInsights();
    await carregarInsightsCache();
  }
}

init();
