/**
 * Análise de Jogo — relatorio.js
 * Relatório geral de um jogo: domínio por métrica, evolução por parte e
 * por momento, zona do campo, resumo por bloco, por jogador, e a análise
 * em prosa gerada pela Edge Function gerar-insights (API da Claude),
 * guardada em cache na tabela report_insights.
 *
 * Toda a agregação vem de js/relatorio-dados.js (partilhado com
 * transicoes.js) — este ficheiro só desenha.
 *
 * Versão: 1.2 (2026-09-14)
 * Histórico:
 *   1.0 (2026-09-14) — criação, com o tema escuro partilhado (css/styles.css).
 *   1.1 (2026-09-14) — cores das barras/legenda passam a var(--accent) (com
 *                       opacidade a diferenciar a favor/contra), a acompanhar o
 *                       visual próprio novo de pages/relatorio.html — antes
 *                       usavam var(--x-color)/var(--y-color) do tema escuro
 *                       partilhado, que deixou de estar ligado a esta página.
 *   1.2 (2026-09-14) — renderPlacar() reconstruído como scoreboard a sério
 *                       (nomes das duas equipas, placar grande, pill de
 *                       resultado, cartões separados "Golos e assistências"/
 *                       "Substituições") — a versão anterior era só um parágrafo
 *                       de texto simples, não batia com o resto do visual novo.
 */

import { supabase } from './supabase-client.js';
import {
  TRACKERS, fetchMatchData, nomeJogador,
  dominioPorMetrica, evolucaoPorParte, construirBlocos, calcularTimeline,
  resumoPorBloco, calcularZonaCampo, ZONA_COL_LABELS, ZONA_ROW_LABELS,
  calcularPorJogador, golosPorJogador, marcadoresComAssistencia,
} from './relatorio-dados.js';

const el = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const TLABEL = Object.fromEntries(TRACKERS.map(t => [t.id, t.title]));

const currentTeamId = localStorage.getItem('current_team_id') || null;
const currentMatchId = localStorage.getItem('current_match_id') || null;

let D = null; // { match, matchPlayers, goals, events, playerEvents }
let blocks = [];

function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function svgRoot(w, h) {
  return svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h, style: 'display:block;overflow:visible' });
}
function addTitle(node, text) {
  svgEl('title', {}, node).textContent = text;
}

// ---------- Placar ----------

function renderPlacar(team) {
  const golosMarcados = D.goals.filter(g => g.tipo === 'marcado');
  const golosSofridosN = D.goals.filter(g => g.tipo === 'sofrido').length;
  const resultado = golosMarcados.length > golosSofridosN ? 'Vitória' : (golosMarcados.length < golosSofridosN ? 'Derrota' : 'Empate');

  el('score-team-nos').textContent = team ? team.nome : 'Equipa';
  el('score-team-adversario').textContent = D.match.adversario;
  el('score-us').textContent = golosMarcados.length;
  el('score-them').textContent = golosSofridosN;
  const scoreUsEl = el('score-us');
  scoreUsEl.classList.remove('good', 'bad');
  if (golosMarcados.length !== golosSofridosN) scoreUsEl.classList.add(golosMarcados.length > golosSofridosN ? 'good' : 'bad');

  const pill = el('result-pill');
  pill.textContent = resultado;
  pill.style.background = resultado === 'Vitória' ? 'var(--good-soft)' : (resultado === 'Derrota' ? 'var(--bad-soft)' : 'var(--surface-2)');
  pill.style.color = resultado === 'Vitória' ? 'var(--good)' : (resultado === 'Derrota' ? 'var(--bad)' : 'var(--ink-muted)');

  el('scorers-summary').innerHTML = `<span>${golosMarcados.length} golo(s) marcado(s)</span><span>${golosSofridosN} golo(s) sofrido(s)</span>`;

  const marcadores = marcadoresComAssistencia(D.goals, D.playerEvents);
  const scorersListEl = el('scorers-list');
  scorersListEl.innerHTML = '';
  if (marcadores.length) {
    marcadores.forEach(m => {
      const nome = nomeJogador(D.matchPlayers, m.playerId) || '?';
      const assistNome = m.assistPlayerId ? nomeJogador(D.matchPlayers, m.assistPlayerId) : null;
      const row = document.createElement('div');
      row.className = 'scorer-row';
      row.innerHTML = `<span class="scorer-min">${m.minuto}'</span><span>⚽ <b>${nome}</b>${assistNome ? ` <span class="hint" style="display:inline">(assist. ${assistNome})</span>` : ''} <span class="hint" style="display:inline">— ${m.parte}ª parte</span></span>`;
      scorersListEl.appendChild(row);
    });
  } else {
    scorersListEl.innerHTML = '<p class="hint">Sem golos marcados.</p>';
  }

  const subListEl = el('sub-list');
  subListEl.innerHTML = '';
  const entraram = D.matchPlayers.filter(mp => mp.substituicao === 'Entrou');
  const sairam = D.matchPlayers.filter(mp => mp.substituicao === 'Saiu');
  const subRows = [
    ...entraram.map(mp => ({ icon: 'in', txt: `Entrou: ${mp.players?.nome || '?'}` })),
    ...sairam.map(mp => ({ icon: 'out', txt: `Saiu: ${mp.players?.nome || '?'}` })),
  ];
  if (subRows.length) {
    subRows.forEach(r => {
      const div = document.createElement('div');
      div.className = 'sub-item';
      div.innerHTML = `<span class="pip ${r.icon}"></span><span>${r.txt}</span>`;
      subListEl.appendChild(div);
    });
  } else {
    subListEl.innerHTML = '<p class="hint">Sem substituições.</p>';
  }
}

// ---------- Domínio por métrica ----------

function renderDominio() {
  const dominio = dominioPorMetrica(D.events);
  const holder = el('chart-dominio');
  holder.innerHTML = '';
  const rows = TRACKERS.map(t => ({ id: t.id, ...dominio[t.id] }));
  const maxVal = Math.max(1, ...rows.map(r => Math.max(r.favor, r.contra)));
  const W = 720, rowH = 56, padTop = 10, labelW = 130, chartW = W - labelW - 60;
  const H = padTop * 2 + rowH * rows.length;
  const svg = svgRoot(W, H);
  const cx = labelW + chartW / 2;
  const scale = (chartW / 2 - 10) / maxVal;

  svgEl('line', { x1: cx, x2: cx, y1: padTop - 4, y2: H - padTop + 4, class: 'report-gridline' }, svg);

  rows.forEach((r, i) => {
    const y = padTop + i * rowH;
    const barY = y + 14, barH = 20;
    svgEl('text', { x: 0, y: y + rowH / 2 + 4, class: 'report-metric-label' }, svg).textContent = TLABEL[r.id];
    const wF = r.favor * scale, wC = r.contra * scale;
    const barFavor = svgEl('rect', { x: cx, y: barY, width: wF, height: barH, rx: 4, fill: 'var(--accent)' }, svg);
    const barContra = svgEl('rect', { x: cx - wC, y: barY, width: wC, height: barH, rx: 4, fill: 'var(--accent)', opacity: 0.32 }, svg);
    svgEl('text', { x: cx + wF + 8, y: y + rowH / 2 + 4, class: 'report-bar-label' }, svg).textContent = r.favor;
    svgEl('text', { x: cx - wC - 8, y: y + rowH / 2 + 4, class: 'report-bar-label', 'text-anchor': 'end' }, svg).textContent = r.contra;
    addTitle(barFavor, `${TLABEL[r.id]} — ${r.favorLabel}: ${r.favor}`);
    addTitle(barContra, `${TLABEL[r.id]} — ${r.contraLabel}: ${r.contra}`);
  });
  holder.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'report-legend';
  legend.innerHTML = `<span class="report-legend-item"><span class="report-legend-swatch" style="background:var(--accent)"></span>A favor (Realizadas/Ganhos/A Favor)</span>
    <span class="report-legend-item"><span class="report-legend-swatch" style="background:var(--accent);opacity:.32"></span>Contra (Sofridas/Perdas/Contra)</span>`;
  holder.appendChild(legend);
}

// ---------- Evolução por parte ----------

function renderEvolucaoParte() {
  const evolucao = evolucaoPorParte(D.events);
  const holder = el('chart-evolucao-parte');
  holder.innerHTML = '';
  ['cruzamentos', 'remates'].forEach(id => {
    const panel = document.createElement('div');
    panel.className = 'tracker';
    const title = document.createElement('h3');
    title.className = 'tracker-title';
    title.textContent = TLABEL[id];
    panel.appendChild(title);
    const data = evolucao[id];
    const maxVal = Math.max(1, ...[1, 2].flatMap(p => [data[p].favor, data[p].contra]));
    const W = 340, rowH = 46, padTop = 6, labelW = 46, chartW = W - labelW - 46;
    const H = padTop * 2 + rowH * 2;
    const svg = svgRoot(W, H);
    const cx = labelW + chartW / 2;
    const scale = (chartW / 2 - 8) / maxVal;
    svgEl('line', { x1: cx, x2: cx, y1: padTop - 4, y2: H - padTop + 4, class: 'report-gridline' }, svg);
    [1, 2].forEach((p, i) => {
      const y = padTop + i * rowH;
      const barY = y + 11, barH = 18;
      svgEl('text', { x: 0, y: y + rowH / 2 + 4, class: 'report-metric-label' }, svg).textContent = p + 'ª P';
      const row = data[p];
      const wF = row.favor * scale, wC = row.contra * scale;
      const bf = svgEl('rect', { x: cx, y: barY, width: wF, height: barH, rx: 4, fill: 'var(--accent)' }, svg);
      const bc = svgEl('rect', { x: cx - wC, y: barY, width: wC, height: barH, rx: 4, fill: 'var(--accent)', opacity: 0.32 }, svg);
      svgEl('text', { x: cx + wF + 6, y: y + rowH / 2 + 4, class: 'report-bar-label' }, svg).textContent = row.favor;
      svgEl('text', { x: cx - wC - 6, y: y + rowH / 2 + 4, class: 'report-bar-label', 'text-anchor': 'end' }, svg).textContent = row.contra;
      addTitle(bf, `${TLABEL[id]} — A Favor (${p}ª parte): ${row.favor}`);
      addTitle(bc, `${TLABEL[id]} — Contra (${p}ª parte): ${row.contra}`);
    });
    panel.appendChild(svg);
    holder.appendChild(panel);
  });
}

// ---------- Evolução por momento (timeline) ----------

let timelineData = null;

function renderTimeline() {
  const holder = el('chart-timeline');
  holder.innerHTML = '';
  const metric = el('filtro-timeline').value;
  const labels = blocks.map(b => b.label);
  const W = 820, H = 220, padL = 30, padR = 16, padTop = 14, padBottom = 30;
  const chartW = W - padL - padR;
  const bw = chartW / labels.length;
  const svg = svgRoot(W, H);

  if (metric === 'total') {
    const vals = timelineData.total;
    const maxVal = Math.max(1, ...vals);
    const chartH = H - padTop - padBottom;
    const zeroY = H - padBottom;
    svgEl('line', { x1: padL, x2: W - padR, y1: zeroY, y2: zeroY, class: 'report-gridline' }, svg);
    vals.forEach((v, i) => {
      const h = (v / maxVal) * chartH;
      const x = padL + i * bw + bw * 0.15, w = bw * 0.7;
      const bar = svgEl('rect', { x, y: zeroY - h, width: w, height: h, rx: 4, fill: 'var(--accent)' }, svg);
      addTitle(bar, `${labels[i]}: ${v} evento(s)`);
      svgEl('text', { x: x + w / 2, y: zeroY - h - 6, 'text-anchor': 'middle', class: 'report-bar-label' }, svg).textContent = v || '';
      svgEl('text', { x: x + w / 2, y: H - 10, 'text-anchor': 'middle', class: 'report-axis-label' }, svg).textContent = labels[i].replace('ªP', 'ª');
    });
  } else {
    const favor = timelineData.timeline[metric].favor, contra = timelineData.timeline[metric].contra;
    const maxVal = Math.max(1, ...favor, ...contra);
    const chartH = (H - padTop - padBottom - 10) / 2;
    const zeroY = padTop + chartH;
    svgEl('line', { x1: padL, x2: W - padR, y1: zeroY, y2: zeroY, class: 'report-gridline' }, svg);
    favor.forEach((v, i) => {
      const h = (v / maxVal) * chartH;
      const x = padL + i * bw + bw * 0.15, w = bw * 0.7;
      const bar = svgEl('rect', { x, y: zeroY - h, width: w, height: h, rx: 4, fill: 'var(--accent)' }, svg);
      addTitle(bar, `${labels[i]} — a favor: ${v}`);
      if (v) svgEl('text', { x: x + w / 2, y: zeroY - h - 6, 'text-anchor': 'middle', class: 'report-bar-label' }, svg).textContent = v;
    });
    contra.forEach((v, i) => {
      const h = (v / maxVal) * chartH;
      const x = padL + i * bw + bw * 0.15, w = bw * 0.7;
      const bar = svgEl('rect', { x, y: zeroY, width: w, height: h, rx: 4, fill: 'var(--accent)', opacity: 0.32 }, svg);
      addTitle(bar, `${labels[i]} — contra: ${v}`);
      if (v) svgEl('text', { x: x + w / 2, y: zeroY + h + 14, 'text-anchor': 'middle', class: 'report-bar-label' }, svg).textContent = v;
    });
    labels.forEach((l, i) => {
      svgEl('text', { x: padL + i * bw + bw / 2, y: H - 10, 'text-anchor': 'middle', class: 'report-axis-label' }, svg).textContent = l.replace('ªP', 'ª');
    });
  }
  holder.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'report-legend';
  legend.innerHTML = metric === 'total'
    ? `<span class="report-legend-item"><span class="report-legend-swatch" style="background:var(--accent)"></span>Total de eventos no bloco</span>`
    : `<span class="report-legend-item"><span class="report-legend-swatch" style="background:var(--accent)"></span>A favor</span><span class="report-legend-item"><span class="report-legend-swatch" style="background:var(--accent);opacity:.32"></span>Contra</span>`;
  holder.appendChild(legend);
}

// ---------- Resumo por tempo de jogo ----------

function renderBlocoGrid(resumo) {
  const holder = el('bloco-grid');
  holder.innerHTML = '';
  const worstIdx = resumo.reduce((best, b, i) => {
    if (b.total === 0) return best;
    const gap = b.pos.length - b.neg.length;
    if (best === -1) return i;
    const bestGap = resumo[best].pos.length - resumo[best].neg.length;
    return gap < bestGap ? i : best;
  }, -1);
  resumo.forEach((b, i) => {
    const div = document.createElement('div');
    div.className = 'bloco-card' + (i === worstIdx ? ' crise' : '');
    let html = `<h4>${b.label}</h4><span class="n">${b.total} evento(s)</span>`;
    if (!b.total) {
      html += '<div class="empty">Sem eventos registados.</div>';
    } else {
      html += '<ul>';
      b.pos.forEach(p => html += `<li class="pos-line">${p}</li>`);
      b.neg.forEach(n => html += `<li class="neg-line">${n}</li>`);
      html += '</ul>';
    }
    div.innerHTML = html;
    holder.appendChild(div);
  });
}

// ---------- Zona do campo ----------

let zoneData = null;
const TIPOLABEL = {
  faltas: { X: 'Realizadas', Y: 'Sofridas' }, perdas: { X: 'Ganhos', Y: 'Perdas' },
  remates: { X: 'A Favor', Y: 'Contra' }, cruzamentos: { X: 'A Favor', Y: 'Contra' }, cantos: { X: 'A Favor', Y: 'Contra' },
};

function renderZona() {
  const holder = el('chart-zona');
  holder.innerHTML = '';
  const mkey = el('filtro-zona-metrica').value, mom = el('filtro-zona-momento').value;
  const grid = (zoneData[mkey] && zoneData[mkey][mom]) || [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const narrow = holder.parentElement.clientWidth < 420;
  const colLabelsShown = narrow ? ['Recuado', 'Méd. Def.', 'Méd. Of.', 'Frente'] : ZONA_COL_LABELS;

  const gridEl = document.createElement('div');
  gridEl.className = 'zona-grid';
  gridEl.style.gridTemplateColumns = '64px repeat(4, 1fr)';
  gridEl.appendChild(document.createElement('div'));
  colLabelsShown.forEach(c => {
    const d = document.createElement('div');
    d.className = 'zona-col-head';
    d.textContent = c;
    gridEl.appendChild(d);
  });
  const maxVal = Math.max(1, ...grid.flat());
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
      cell.title = `${ZONA_ROW_LABELS[ri]} · ${ZONA_COL_LABELS[ci]}: ${v} evento(s)`;
      gridEl.appendChild(cell);
    });
  });
  holder.appendChild(gridEl);

  const total = grid.flat().reduce((a, b) => a + b, 0);
  const note = document.createElement('p');
  note.className = 'hint';
  note.style.marginTop = '8px';
  note.textContent = `${total} evento(s) nesta seleção.`;
  holder.appendChild(note);
}

function wireZonaFiltros() {
  const metricSelect = el('filtro-zona-metrica');
  const momentoSelect = el('filtro-zona-momento');
  let options = [{ key: 'total', label: 'Todos os eventos' }];
  TRACKERS.forEach(t => {
    ['X', 'Y'].forEach(tp => {
      const k = `${t.id}_${tp}`;
      if (zoneData[k]) options.push({ key: k, label: `${TLABEL[t.id]} — ${TIPOLABEL[t.id][tp]}` });
    });
  });
  metricSelect.innerHTML = options.map(o => `<option value="${o.key}">${o.label}</option>`).join('');
  momentoSelect.innerHTML = '<option value="total">Jogo completo</option>' +
    blocks.map((b, i) => `<option value="${i}">${b.label}</option>`).join('');
  metricSelect.addEventListener('change', renderZona);
  momentoSelect.addEventListener('change', renderZona);
  window.addEventListener('resize', renderZona);
}

// ---------- Por jogador ----------

function renderTabelaJogadores() {
  const { table, completude } = calcularPorJogador(D.events, D.matchPlayers);
  const golos = golosPorJogador(D.goals);

  const partial = Object.entries(completude).filter(([, v]) => v.pctSem > 0);
  el('completude-nota').textContent = partial.length
    ? `Sem jogador identificado: ${partial.map(([k, v]) => `${k} (${Math.round(v.pctSem)}%)`).join(', ')} — a maioria são ações do adversário.`
    : '';

  const cols = [['faltas_X', 'Faltas Real.'], ['faltas_Y', 'Faltas Sofr.'], ['perdas_X', 'Bolas Ganhas'], ['perdas_Y', 'Perdas'], ['remates_X', 'Remates'], ['cruzamentos_X', 'Cruz.']];
  let html = '<thead><tr><th>Jogador</th><th>Golos</th>' + cols.map(c => `<th>${c[1]}</th>`).join('') + '<th>Total</th></tr></thead><tbody>';
  table.forEach(r => {
    const nGolos = golos.get(r.playerId) || 0;
    html += `<tr><td>${r.nome}</td><td>${nGolos || '—'}</td>` + cols.map(c => `<td>${r[c[0]] || '—'}</td>`).join('') + `<td>${r.total}</td></tr>`;
  });
  html += '</tbody>';
  el('tabela-jogadores').innerHTML = html;
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
  // Resumo compacto (sem eventos em bruto) que vai para a Edge Function —
  // números já calculados, sem dados pessoais além dos nomes já visíveis
  // à equipa técnica.
  return {
    meta: {
      adversario: D.match.adversario, data: D.match.data,
      golosMarcados: D.goals.filter(g => g.tipo === 'marcado').length,
      golosSofridos: D.goals.filter(g => g.tipo === 'sofrido').length,
    },
    dominio: dominioPorMetrica(D.events),
    resumoPorBloco: resumoPorBloco(blocks, timelineData.timeline, timelineData.total),
  };
}

async function carregarInsightsCache() {
  const { data } = await supabase.from('report_insights').select('*').eq('match_id', currentMatchId).eq('tipo', 'geral').maybeSingle();
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
        body: { tipo: 'geral', dados: agregarParaInsights() },
      });
      if (error) throw error;
      renderInsights(data.insights);
      await supabase.from('report_insights').upsert({
        team_id: currentTeamId, match_id: currentMatchId, tipo: 'geral', conteudo: data.insights,
      }, { onConflict: 'match_id,tipo' });
      el('insights-status').textContent = `Gerada agora.`;
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

  el('btn-sign-out').addEventListener('click', async () => {
    localStorage.removeItem('current_team_id');
    localStorage.removeItem('current_match_id');
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
  el('btn-voltar-jogo').addEventListener('click', () => { window.location.href = 'match.html'; });

  const { data: team } = await supabase.from('teams').select('*').eq('id', currentTeamId).single();
  D = await fetchMatchData(currentMatchId, currentTeamId);
  if (!D.match) { window.location.href = 'dashboard.html'; return; }

  el('team-indicator').textContent = team ? `Equipa: ${team.nome}` : 'Equipa';
  el('match-indicator').textContent = `Jogo: vs ${D.match.adversario} (${D.match.data})`;

  blocks = construirBlocos(D.events);
  timelineData = calcularTimeline(D.events, blocks);
  zoneData = calcularZonaCampo(D.events, blocks);
  const resumo = resumoPorBloco(blocks, timelineData.timeline, timelineData.total);

  renderPlacar(team);
  renderDominio();
  renderEvolucaoParte();

  const timelineSelect = el('filtro-timeline');
  timelineSelect.innerHTML = '<option value="total">Todos os eventos</option>' +
    TRACKERS.map(t => `<option value="${t.id}">${t.title}</option>`).join('');
  timelineSelect.addEventListener('change', renderTimeline);
  renderTimeline();

  renderBlocoGrid(resumo);
  wireZonaFiltros();
  renderZona();
  renderTabelaJogadores();
  wireInsights();
  await carregarInsightsCache();
}

init();
