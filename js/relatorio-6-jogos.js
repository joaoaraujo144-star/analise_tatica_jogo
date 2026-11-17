/**
 * Análise de Jogo — relatorio-6-jogos.js
 * Lógica de pages/relatorio-6-jogos.html: relatório dos últimos 6 jogos
 * terminados (não pré-época) de uma equipa escolhida numa dropdown,
 * organizado por separadores. Por agora só "Overview" está completo
 * (estado geral, total/média/por-90-min de cada evento, saldo de
 * remates e cruzamentos, evolução jogo a jogo, distribuição percentual
 * dos eventos) — o resto (domínio por métrica, mapa de calor, rotação
 * do plantel) fica no separador "Outros", à espera de ser distribuído
 * pelos próximos separadores.
 *
 * Fora da navegação principal (como pages/trial-admin.html) — reaproveita
 * a sessão Supabase já aberta no browser, sem pedir login outra vez.
 *
 * Versão: 2.0 (2026-11-02)
 * Histórico:
 *   1.0 (2026-11-02) — criação.
 *   1.1 (2026-11-02) — reorganizado por separadores; "Overview" completo
 *                       (ver acima); gráficos num separador escondido
 *                       ficam com tamanho 0 (Chart.js), por isso "Outros"
 *                       só é desenhado quando o separador fica visível.
 *   1.2 (2026-11-02) — polimento visual (skill dataviz): cabeçalho com
 *                       nome da equipa + período; marcas de linha/barra
 *                       com espec. fixa (2px linha, pontos >=8px com
 *                       anel na cor da superfície, barras <=24px com
 *                       canto arredondado só na ponta); distribuição
 *                       percentual passa de rosca a barra horizontal
 *                       100% empilhada com paleta categórica validada
 *                       (scripts/validate_palette.js da skill) e legenda
 *                       própria (nome + contagem + %).
 *   2.0 (2026-11-02) — visual novo a partir de uma maqueta fornecida
 *                       (ver css/relatorio-6-jogos.css): sidebar com os
 *                       separadores, KPIs como "tiles" (kpiTile()),
 *                       cartões com cabeçalho. As cores de dados
 *                       (COR_FAVOR/COR_CONTRA/COR_AMARELO/COR_VERMELHO)
 *                       são versões mais escuras dos acentos verde/
 *                       laranja/vermelho da maqueta — os tons claros
 *                       originais não passavam o validador da skill
 *                       dataviz em marcas de dados (só servem como
 *                       acento de interface, ver o CSS).
 */

import { supabase } from './supabase-client.js';
import { Chart } from 'https://esm.sh/chart.js@4/auto';
import { TRACKERS } from './relatorio-dados.js';

const el = (id) => document.getElementById(id);
const N_JOGOS = 6;

let matches = [];     // ordem cronológica (mais antigo primeiro)
let events = [];
let goals = [];
let matchPlayers = [];
let charts = {};
let teamsCache = [];

// ---------- Minutos jogados (mesma lógica de dashboard.js/relatorio-dados.js) ----------

function duracaoParte(inicio, fim) {
  if (!inicio || !fim) return 0;
  return Math.max(0, Math.round((new Date(fim) - new Date(inicio)) / 60000));
}

function minutosJogados(mp, match) {
  const d1 = duracaoParte(match.parte1_inicio, match.parte1_fim);
  const d2 = duracaoParte(match.parte2_inicio, match.parte2_fim);
  if (mp.estado === 'Titular') {
    if (mp.substituicao === 'Saiu' && mp.parte_substituicao && mp.minuto_substituicao != null) {
      return mp.parte_substituicao === 1 ? Math.min(mp.minuto_substituicao, d1) : d1 + Math.min(mp.minuto_substituicao, d2);
    }
    return d1 + d2;
  }
  if (mp.substituicao === 'Entrou' && mp.parte_substituicao && mp.minuto_substituicao != null) {
    const entrada = mp.parte_substituicao === 1 ? Math.min(mp.minuto_substituicao, d1) : d1 + Math.min(mp.minuto_substituicao, d2);
    return Math.max(0, d1 + d2 - entrada);
  }
  return 0;
}

// ---------- Mapa de calor (mesmo padrão de js/match.js) ----------

const HEATMAP_COLS = 6;
const HEATMAP_ROWS = 4;

function buildHeatGrid(points) {
  const counts = Array.from({ length: HEATMAP_ROWS }, () => Array(HEATMAP_COLS).fill(0));
  points.forEach(p => { counts[p.zona_row][p.zona_col]++; });
  return counts;
}

function renderHeatGrid(container, counts) {
  container.innerHTML = '';
  const max = Math.max(1, ...counts.flat());
  counts.forEach((rowArr, row) => {
    rowArr.forEach((count, col) => {
      const cell = document.createElement('div');
      cell.className = 'r6-heat-cell';
      cell.style.left = `${(col / HEATMAP_COLS) * 100}%`;
      cell.style.top = `${(row / HEATMAP_ROWS) * 100}%`;
      cell.style.width = `${100 / HEATMAP_COLS}%`;
      cell.style.height = `${100 / HEATMAP_ROWS}%`;
      if (count > 0) {
        const intensity = count / max;
        cell.style.background = `rgba(35, 153, 115, ${(0.18 + intensity * 0.68).toFixed(2)})`; // --chart-favor
        cell.title = `${count} ponto${count === 1 ? '' : 's'}`;
        cell.textContent = count;
      }
      container.appendChild(cell);
    });
  });
}

// ---------- Gráficos (mesmo padrão de wellness-jogador.js) ----------

const CHART_COMMON_OPTIONS = {
  responsive: true,
  interaction: { mode: 'index', intersect: false },
  scales: {
    x: { ticks: { color: '#9aacc5' }, grid: { color: '#34445b' } },
    y: { ticks: { color: '#9aacc5' }, grid: { color: '#34445b' }, beginAtZero: true },
  },
  plugins: { legend: { labels: { color: '#edf4ff' } } },
};

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function formatDateLabel(dataStr) {
  const d = new Date(`${dataStr}T00:00:00`);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

function labelsJogos() {
  return matches.map(m => `${m.adversario} (${formatDateLabel(m.data)})`);
}

// ---------- Agregações ----------

function golosPorJogo(matchId, tipo) {
  return goals.filter(g => g.match_id === matchId && g.tipo === tipo).length;
}

function cartaoPorJogo(matchId, campo) {
  return matchPlayers.filter(mp => mp.match_id === matchId).reduce((n, mp) => n + (mp[campo] || 0), 0);
}

function contarEventos(matchId, trackerId, tipo) {
  return events.filter(e => e.match_id === matchId && e.tracker_id === trackerId && e.tipo === tipo).length;
}

function somaTotal(trackerId, tipo) {
  return events.filter(e => e.tracker_id === trackerId && e.tipo === tipo).length;
}

// Minutos de jogo somados nos 6 jogos (não minutos de jogadores) — usado
// para normalizar "por 90 min", o padrão da análise de futebol para
// comparar jogos de duração ligeiramente diferente (descontos, etc.).
function totalMinutosJogo() {
  return matches.reduce((n, m) => n + duracaoParte(m.parte1_inicio, m.parte1_fim) + duracaoParte(m.parte2_inicio, m.parte2_fim), 0);
}

function por90(total) {
  const minutos = totalMinutosJogo();
  return minutos ? Math.round((total * 90 / minutos) * 10) / 10 : 0;
}

// ---------- Render ----------

function renderJogosTable() {
  const body = el('jogos-body');
  body.innerHTML = matches.map(m => {
    const marcados = golosPorJogo(m.id, 'marcado');
    const sofridos = golosPorJogo(m.id, 'sofrido');
    return `<tr><td>${formatDateLabel(m.data)}</td><td>${m.adversario}</td><td>${marcados}</td><td>${sofridos}</td></tr>`;
  }).join('');
  el('jogos-pill').textContent = `${matches.length} jogo${matches.length === 1 ? '' : 's'}`;
}

// Tons de gráfico — versões mais escuras dos acentos verde/laranja/
// vermelho da maqueta (ver css/relatorio-6-jogos.css), validadas para
// dados densos com scripts/validate_palette.js da skill dataviz (os
// tons claros originais da maqueta não passam a banda de luminosidade
// nem a separação CVD quando usados como marca de dados — só como
// acento de interface, texto, pontos de legenda).
const COR_FAVOR = '#239973';    // valida com COR_CONTRA: CVD ΔE 8.1, luminosidade OK
const COR_CONTRA = '#c97a2e';
const COR_AMARELO = '#b8871f';  // valida com COR_VERMELHO: CVD ΔE 10.0
const COR_VERMELHO = '#c9465a';
const COR_SUPERFICIE = '#151e30'; // --panel, para o anel dos pontos de linha

// Espec. de marca comum às linhas (2px, pontos >=8px com anel na cor da
// superfície) e às barras (<=24px, canto arredondado só na ponta, base
// quadrada) — critério da skill dataviz, ver references/marks-and-anatomy.md.
function lineMark(cor) {
  return { borderColor: cor, borderWidth: 2, tension: 0.25, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: cor, pointBorderColor: COR_SUPERFICIE, pointBorderWidth: 2 };
}
function barMark(cor) {
  return { backgroundColor: cor, maxBarThickness: 24, borderRadius: 4, borderSkipped: false };
}

function renderGolosChart() {
  destroyChart('golos');
  charts.golos = new Chart(el('chart-golos'), {
    type: 'line',
    data: {
      labels: labelsJogos(),
      datasets: [
        { label: 'Marcados', data: matches.map(m => golosPorJogo(m.id, 'marcado')), ...lineMark(COR_FAVOR) },
        { label: 'Sofridos', data: matches.map(m => golosPorJogo(m.id, 'sofrido')), ...lineMark(COR_CONTRA) },
      ],
    },
    options: CHART_COMMON_OPTIONS,
  });
}

function renderCartoesChart() {
  destroyChart('cartoes');
  charts.cartoes = new Chart(el('chart-cartoes'), {
    type: 'bar',
    data: {
      labels: labelsJogos(),
      datasets: [
        { label: 'Amarelos', data: matches.map(m => cartaoPorJogo(m.id, 'amarelo') + cartaoPorJogo(m.id, 'amarelo2')), ...barMark(COR_AMARELO) },
        { label: 'Vermelhos', data: matches.map(m => cartaoPorJogo(m.id, 'vermelho')), ...barMark(COR_VERMELHO) },
      ],
    },
    options: CHART_COMMON_OPTIONS,
  });
}

function renderDominioCharts() {
  TRACKERS.forEach(t => destroyChart(`dominio-${t.id}`)); // antes de substituir o HTML (os canvas vão deixar de existir)

  const container = el('dominio-charts');
  container.innerHTML = TRACKERS.map(t => `
    <div class="r6-card">
      <h2 class="r6-section-title">${t.title}</h2>
      <canvas id="chart-dominio-${t.id}"></canvas>
    </div>
  `).join('');

  TRACKERS.forEach(t => {
    charts[`dominio-${t.id}`] = new Chart(el(`chart-dominio-${t.id}`), {
      type: 'bar',
      data: {
        labels: labelsJogos(),
        datasets: [
          { label: t.xLabel, data: matches.map(m => contarEventos(m.id, t.id, 'X')), ...barMark(COR_FAVOR) },
          { label: t.yLabel, data: matches.map(m => contarEventos(m.id, t.id, 'Y')), ...barMark(COR_CONTRA) },
        ],
      },
      options: CHART_COMMON_OPTIONS,
    });
  });
}

function populateHeatSelect() {
  const sel = el('heat-select');
  sel.innerHTML = TRACKERS.flatMap(t => [
    `<option value="${t.id}_X">${t.title} — ${t.xLabel}</option>`,
    `<option value="${t.id}_Y">${t.title} — ${t.yLabel}</option>`,
  ]).join('');
  sel.addEventListener('change', renderHeatmap);
}

function renderHeatmap() {
  const [trackerId, tipo] = el('heat-select').value.split('_');
  const pontos = events.filter(e => e.tracker_id === trackerId && e.tipo === tipo);
  renderHeatGrid(el('heat-grid'), buildHeatGrid(pontos));
}

function renderMinutosChart() {
  const porJogador = new Map(); // player_id -> { nome, minutos }
  matchPlayers.forEach(mp => {
    const match = matches.find(m => m.id === mp.match_id);
    if (!match) return;
    const nome = mp.players?.nome || '?';
    const minutos = minutosJogados(mp, match);
    const atual = porJogador.get(mp.player_id) || { nome, minutos: 0 };
    atual.minutos += minutos;
    porJogador.set(mp.player_id, atual);
  });
  const rows = Array.from(porJogador.values()).filter(r => r.minutos > 0).sort((a, b) => b.minutos - a.minutos);

  destroyChart('minutos');
  charts.minutos = new Chart(el('chart-minutos'), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.nome),
      datasets: [{ label: 'Minutos jogados', data: rows.map(r => r.minutos), ...barMark(COR_FAVOR) }],
    },
    options: { ...CHART_COMMON_OPTIONS, indexAxis: 'y', plugins: { legend: { display: false } } },
  });
}

function totalCartoes(campo) {
  return matches.reduce((n, m) => n + cartaoPorJogo(m.id, campo), 0);
}

// ---------- Overview ----------

// Um "tile" de KPI — mesmo contrato da maqueta (label · valor grande ·
// delta opcional, nunca o número a cores — "text never wears the data
// color", a cor fica só no "warn").
function kpiTile(label, valor, delta, warn) {
  return `<article class="r6-card"><div class="r6-kpi-label">${label}</div><div class="r6-kpi-big">${valor}</div>${delta ? `<div class="r6-kpi-delta${warn ? ' warn' : ''}">${delta}</div>` : ''}</article>`;
}

function renderEstadoGeral() {
  const n = matches.length;
  const marcados = goals.filter(g => g.tipo === 'marcado').length;
  const sofridos = goals.filter(g => g.tipo === 'sofrido').length;
  const saldo = marcados - sofridos;
  const emForma = matches.filter(m => golosPorJogo(m.id, 'marcado') > golosPorJogo(m.id, 'sofrido')).length;
  const amarelos = totalCartoes('amarelo') + totalCartoes('amarelo2');
  const vermelhos = totalCartoes('vermelho');

  el('estado-geral-counters').innerHTML = [
    kpiTile('Jogos analisados', n, `${n} terminados, sem pré-época`),
    kpiTile('Golos marcados', marcados, `${(marcados / n).toFixed(1)} / jogo`),
    kpiTile('Golos sofridos', sofridos, `${(sofridos / n).toFixed(1)} / jogo`, true),
    kpiTile('Saldo de golos', `${saldo > 0 ? '+' : ''}${saldo}`, saldo >= 0 ? 'Positivo' : 'Negativo', saldo < 0),
    kpiTile('Jogos com saldo positivo', `${emForma}/${n}`, `${Math.round((emForma / n) * 100)}% dos jogos`),
    kpiTile('Cartões amarelos', amarelos, `${(amarelos / n).toFixed(1)} / jogo`),
    kpiTile('Cartões vermelhos', vermelhos, vermelhos > 0 ? `${(vermelhos / n).toFixed(1)} / jogo` : 'Nenhum', vermelhos > 0),
  ].join('');
}

// Total/média/por-90 de cada evento (os 5 campos X/Y, golos e cartões).
function linhasTotais() {
  const linhas = [];
  TRACKERS.forEach(t => {
    linhas.push({ label: `${t.title} — ${t.xLabel}`, total: somaTotal(t.id, 'X') });
    linhas.push({ label: `${t.title} — ${t.yLabel}`, total: somaTotal(t.id, 'Y') });
  });
  linhas.push({ label: 'Golos marcados', total: goals.filter(g => g.tipo === 'marcado').length });
  linhas.push({ label: 'Golos sofridos', total: goals.filter(g => g.tipo === 'sofrido').length });
  linhas.push({ label: 'Cartões amarelos', total: totalCartoes('amarelo') + totalCartoes('amarelo2') });
  linhas.push({ label: 'Cartões vermelhos', total: totalCartoes('vermelho') });
  return linhas;
}

function renderTotaisTable() {
  el('totais-body').innerHTML = linhasTotais().map(l => {
    const media = (l.total / matches.length).toFixed(1);
    return `<tr><td>${l.label}</td><td>${l.total}</td><td>${media}</td><td>${por90(l.total).toFixed(1)}</td></tr>`;
  }).join('');
}

function renderSaldoRematesCruzamentos() {
  const remF = somaTotal('remates', 'X'), remC = somaTotal('remates', 'Y');
  const cruF = somaTotal('cruzamentos', 'X'), cruC = somaTotal('cruzamentos', 'Y');
  const saldoRem = remF - remC;
  const saldoCru = cruF - cruC;
  el('saldo-counters').innerHTML = [
    kpiTile('Remates a favor', remF),
    kpiTile('Remates contra', remC, null, true),
    kpiTile('Saldo remates', `${saldoRem > 0 ? '+' : ''}${saldoRem}`, saldoRem >= 0 ? 'Positivo' : 'Negativo', saldoRem < 0),
    kpiTile('Cruzamentos a favor', cruF),
    kpiTile('Cruzamentos contra', cruC, null, true),
    kpiTile('Saldo cruzamentos', `${saldoCru > 0 ? '+' : ''}${saldoCru}`, saldoCru >= 0 ? 'Positivo' : 'Negativo', saldoCru < 0),
  ].join('');
}

// Paleta categórica validada (skill dataviz, scripts/validate_palette.js,
// modo escuro, superfície #151e30 — a --panel deste ficheiro):
// node validate_palette.js "#3987e5,#d95926,#199e70,#c98500,#d55181"
// --mode dark --surface "#151e30" → ALL CHECKS PASS. A ordem é a
// mecânica de segurança (não cosmética) — não trocar sem revalidar.
const DISTRIBUICAO_CORES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

// Canto arredondado só nas duas pontas da barra (a 1ª e a última fatia),
// quadrado onde toca a fatia vizinha — "4px rounded data-end, square at
// the baseline" aplicado a uma barra horizontal 100% empilhada.
function segRadius(i, n) {
  if (i === 0) return { topLeft: 4, bottomLeft: 4, topRight: 0, bottomRight: 0 };
  if (i === n - 1) return { topLeft: 0, bottomLeft: 0, topRight: 4, bottomRight: 4 };
  return 0;
}

function renderDistribuicaoChart() {
  const totais = TRACKERS.map(t => somaTotal(t.id, 'X') + somaTotal(t.id, 'Y'));
  const totalGeral = totais.reduce((a, b) => a + b, 0);

  destroyChart('distribuicao');
  el('chart-distribuicao').style.height = '64px'; // maintainAspectRatio:false precisa de uma altura explícita (1 barra só, não faz sentido esticar)
  charts.distribuicao = new Chart(el('chart-distribuicao'), {
    type: 'bar',
    data: {
      labels: [''],
      datasets: TRACKERS.map((t, i) => ({
        label: t.title,
        data: [totais[i]],
        backgroundColor: DISTRIBUICAO_CORES[i],
        borderRadius: segRadius(i, TRACKERS.length),
        borderSkipped: false,
        borderWidth: 2,
        borderColor: COR_SUPERFICIE, // simula o "surface gap" entre fatias (2px), nunca um contorno
        maxBarThickness: 56,
      })),
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, display: false },
        y: { stacked: true, display: false },
      },
      plugins: {
        legend: { display: false }, // legenda própria por baixo, com contagem + % (ver renderAll)
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = totalGeral ? ((ctx.parsed.x / totalGeral) * 100).toFixed(1) : '0.0';
              return `${ctx.dataset.label}: ${ctx.parsed.x} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  el('distribuicao-legend').innerHTML = TRACKERS.map((t, i) => {
    const pct = totalGeral ? ((totais[i] / totalGeral) * 100).toFixed(1) : '0.0';
    return `<span><i class="r6-dot" style="background:${DISTRIBUICAO_CORES[i]}"></i>${t.title}: ${totais[i]} (${pct}%)</span>`;
  }).join('');
}

function renderOverview() {
  renderJogosTable();
  renderEstadoGeral();
  renderTotaisTable();
  renderSaldoRematesCruzamentos();
  renderGolosChart();
  renderCartoesChart();
  renderDistribuicaoChart();
}

// ---------- Outros (separador temporário — por agora o que ainda não foi
// distribuído pelos próximos separadores: domínio por métrica, mapa de
// calor, rotação do plantel) ----------

function renderOutros() {
  renderDominioCharts();
  populateHeatSelect();
  renderHeatmap();
  renderMinutosChart();
}

// ---------- Separadores ----------

function wireTabs() {
  document.querySelectorAll('#tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.hidden = panel.id !== `tab-${btn.dataset.tab}`;
      });
      // Gráficos Chart.js num separador escondido (display:none) ficam
      // com tamanho 0 — por isso "Outros" só é desenhado quando fica
      // visível, nunca antes (mesmo padrão de wireTabs() em dashboard.js).
      if (btn.dataset.tab === 'outros') renderOutros();
    });
  });
}

function activeTab() {
  const btn = document.querySelector('#tabs button.active');
  return btn ? btn.dataset.tab : 'overview';
}

function renderAll() {
  renderOverview();
  if (activeTab() === 'outros') renderOutros();
}

function renderReportHeader(teamId) {
  const equipa = teamsCache.find(t => t.id === teamId);
  el('report-team-nome').textContent = equipa ? equipa.nome : '';
  const primeiro = formatDateLabel(matches[0].data);
  const ultimo = formatDateLabel(matches[matches.length - 1].data);
  el('report-periodo').textContent = matches.length > 1
    ? `${matches.length} jogos · ${primeiro} — ${ultimo}`
    : `${matches.length} jogo · ${primeiro}`;
}

// ---------- Carregar equipa ----------

async function loadTeam(teamId) {
  el('relatorio-body').hidden = true;
  el('poucos-jogos').hidden = true;
  el('sem-jogos').hidden = true;

  const { data: matchesData, error: matchesError } = await supabase
    .from('matches')
    .select('*')
    .eq('team_id', teamId)
    .eq('pre_epoca', false)
    .not('parte2_fim', 'is', null)
    .order('data', { ascending: false })
    .limit(N_JOGOS);
  if (matchesError) { console.error(matchesError); return; }

  matches = (matchesData || []).slice().reverse(); // cronológico, mais antigo primeiro

  if (matches.length === 0) {
    el('sem-jogos').hidden = false;
    return;
  }

  const matchIds = matches.map(m => m.id);
  const [eventsRes, goalsRes, matchPlayersRes] = await Promise.all([
    supabase.from('events_normalizado').select('*').in('match_id', matchIds),
    supabase.from('goals').select('*').in('match_id', matchIds),
    supabase.from('match_players').select('*, players(numero, nome)').in('match_id', matchIds),
  ]);
  if (eventsRes.error || goalsRes.error || matchPlayersRes.error) {
    console.error(eventsRes.error || goalsRes.error || matchPlayersRes.error);
    return;
  }
  events = eventsRes.data || [];
  goals = goalsRes.data || [];
  matchPlayers = matchPlayersRes.data || [];

  if (matches.length < N_JOGOS) {
    el('poucos-jogos').hidden = false;
    el('poucos-jogos').textContent = `Esta equipa só tem ${matches.length} jogo(s) terminado(s) — a mostrar os que existem.`;
  }

  renderReportHeader(teamId);
  el('relatorio-body').hidden = false;
  renderAll();
}

async function loadTeams() {
  const { data, error } = await supabase.from('teams').select('*').order('nome', { ascending: true });
  if (error) { console.error(error); return; }
  if (!data || data.length === 0) {
    el('sem-equipas').hidden = false;
    return;
  }
  teamsCache = data;
  const sel = el('team-select');
  sel.innerHTML = data.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
  sel.addEventListener('change', () => loadTeam(sel.value));
  await loadTeam(data[0].id);
}

// ---------- Init ----------

(async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  el('btn-voltar').addEventListener('click', () => { window.location.href = 'dashboard.html'; });
  el('btn-sign-out').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
  wireTabs();

  await loadTeams();
})();
