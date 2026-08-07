/**
 * Análise de Jogo — wellness-jogador.js
 * Lógica da página de wellness de um jogador específico (treinador):
 * gráficos de evolução (Semana/Mês/Total) e tabela de respostas diárias,
 * com edição de um dia (ex: o jogador enganou-se a preencher).
 *
 * Versão: 1.3 (2026-08-07)
 * Histórico:
 *   1.0 (2026-08-07) — criação.
 *   1.1 (2026-08-07) — separa o gráfico único de wellness em 4 gráficos, um por
 *                       métrica, cada um com o seu próprio "Chart" (guardados em "charts").
 *   1.2 (2026-08-07) — exportar gráficos (PDF, via window.print()) e tabela (Excel,
 *                       via SheetJS), em dois botões separados.
 *   1.3 (2026-08-07) — o PDF passa a ter um cabeçalho (nome do jogador + intervalo de
 *                       datas), só visível na impressão (#print-header).
 */

import { Chart } from 'https://esm.sh/chart.js@4/auto';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import { supabase } from './supabase-client.js';

const el = (id) => document.getElementById(id);

let currentTeamId = localStorage.getItem('current_team_id') || null;
let currentTeam = null;
let currentPlayer = null;
let currentRange = 'total';
let currentRows = [];
let editingRowId = null;
let charts = {}; // { dores, stress, fadiga, sono, peso } -> instância Chart.js

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatDateLabel(iso) {
  const [, mes, dia] = iso.split('-');
  return `${dia} ${MESES[Number(mes) - 1]}`;
}

function rangeStartDate(range) {
  if (range === 'total') return null;
  const d = new Date();
  d.setDate(d.getDate() - Number(range));
  return d.toISOString().slice(0, 10);
}

// ---------- Topo ----------

function wireTopBar() {
  el('btn-voltar').addEventListener('click', () => { window.location.href = 'dashboard.html'; });
  el('btn-switch-team').addEventListener('click', () => { window.location.href = 'teams.html'; });
  el('btn-sign-out').addEventListener('click', async () => {
    localStorage.removeItem('current_team_id');
    localStorage.removeItem('current_wellness_player_id');
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}

// ---------- Toolbar Semana/Mês/Total ----------

function wireRangeToolbar() {
  document.querySelectorAll('.toolbar .view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toolbar .view-btn').forEach(b => b.classList.toggle('active', b === btn));
      currentRange = btn.dataset.range;
      loadData();
    });
  });
}

// ---------- Gráficos ----------

const CHART_COMMON_OPTIONS = {
  responsive: true,
  interaction: { mode: 'index', intersect: false },
  scales: {
    x: { ticks: { color: '#888' }, grid: { color: '#232b33' } },
    y: { ticks: { color: '#888' }, grid: { color: '#232b33' } },
  },
  plugins: {
    legend: { labels: { color: '#eee' } },
  },
};

// Um gráfico por métrica (em vez de 4 linhas no mesmo gráfico) — cada
// cartão já tem o nome na h2.tracker-title, por isso a legenda do
// Chart.js fica desligada em cada um (seria redundante).
const WELLNESS_METRICS = [
  { id: 'dores', key: 'dores_musculares', label: 'Dores musculares', color: '#e53935' },
  { id: 'stress', key: 'stress', label: 'Stress', color: '#fbc02d' },
  { id: 'fadiga', key: 'fadiga', label: 'Fadiga', color: '#8e24aa' },
  { id: 'sono', key: 'sono', label: 'Sono', color: '#1e88e5' },
];

function renderMetricChart(id, key, label, color, rows) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(el(`chart-${id}`), {
    type: 'line',
    data: {
      labels: rows.map(r => formatDateLabel(r.data)),
      datasets: [{ label, data: rows.map(r => r[key]), borderColor: color, tension: 0.2 }],
    },
    options: {
      ...CHART_COMMON_OPTIONS,
      scales: { ...CHART_COMMON_OPTIONS.scales, y: { ...CHART_COMMON_OPTIONS.scales.y, min: 0, max: 10 } },
      plugins: { legend: { display: false } },
    },
  });
}

function renderWellnessCharts(rows) {
  WELLNESS_METRICS.forEach(({ id, key, label, color }) => renderMetricChart(id, key, label, color, rows));
}

function renderPesoChart(rows) {
  const comPeso = rows.filter(r => r.peso != null);
  if (charts.peso) charts.peso.destroy();
  charts.peso = new Chart(el('chart-peso'), {
    type: 'line',
    data: {
      labels: comPeso.map(r => formatDateLabel(r.data)),
      datasets: [{ label: 'Peso (kg)', data: comPeso.map(r => r.peso), borderColor: '#43a047', tension: 0.2 }],
    },
    options: { ...CHART_COMMON_OPTIONS, plugins: { legend: { display: false } } },
  });
}

// ---------- Tabela de respostas (com edição) ----------

function viewRowHtml(r) {
  return `
    <td>${formatDateLabel(r.data)}</td>
    <td>${r.dores_musculares}</td>
    <td>${r.stress}</td>
    <td>${r.fadiga}</td>
    <td>${r.sono}</td>
    <td>${r.peso ?? '—'}</td>
    <td><button class="action small" data-action="editar" data-id="${r.id}">Editar</button></td>
  `;
}

function editRowHtml(r) {
  return `
    <td>${formatDateLabel(r.data)}</td>
    <td><input type="number" min="0" max="10" class="wellness-edit-input" id="edit-dores" value="${r.dores_musculares}"></td>
    <td><input type="number" min="0" max="10" class="wellness-edit-input" id="edit-stress" value="${r.stress}"></td>
    <td><input type="number" min="0" max="10" class="wellness-edit-input" id="edit-fadiga" value="${r.fadiga}"></td>
    <td><input type="number" min="0" max="10" class="wellness-edit-input" id="edit-sono" value="${r.sono}"></td>
    <td><input type="number" min="0" step="0.1" class="wellness-edit-input" id="edit-peso" value="${r.peso ?? ''}"></td>
    <td>
      <button class="action small" data-action="guardar" data-id="${r.id}">Guardar</button>
      <button class="action small" data-action="cancelar">Cancelar</button>
    </td>
  `;
}

function renderTable(rows) {
  const body = el('wellness-jogador-body');
  body.innerHTML = '';
  [...rows].reverse().forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = editingRowId === r.id ? editRowHtml(r) : viewRowHtml(r);
    body.appendChild(tr);
  });
  el('wellness-jogador-empty').hidden = rows.length > 0;
}

function wireTable() {
  el('wellness-jogador-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'editar') {
      editingRowId = btn.dataset.id;
      renderTable(currentRows);
      return;
    }

    if (btn.dataset.action === 'cancelar') {
      editingRowId = null;
      renderTable(currentRows);
      return;
    }

    if (btn.dataset.action === 'guardar') {
      const pesoStr = el('edit-peso').value.trim();
      const patch = {
        dores_musculares: Number(el('edit-dores').value),
        stress: Number(el('edit-stress').value),
        fadiga: Number(el('edit-fadiga').value),
        sono: Number(el('edit-sono').value),
        peso: pesoStr ? Number(pesoStr) : null,
      };
      const { error } = await supabase.from('wellness_responses').update(patch).eq('id', btn.dataset.id);
      if (error) { alert(error.message); return; }
      editingRowId = null;
      await loadData();
    }
  });
}

// ---------- Exportações ----------

const RANGE_LABELS = { 7: 'última semana', 30: 'último mês', total: 'histórico completo' };

// Escondido no ecrã (ver .print-only-header em styles.css), só aparece no
// PDF exportado — sem isto o topo (com o nome do jogador) fica escondido
// na impressão e o PDF não diz de quem nem de que período é.
function updatePrintHeader() {
  const rangeLabel = RANGE_LABELS[currentRange] || currentRange;
  let intervalo = rangeLabel;
  if (currentRows.length) {
    const primeira = formatDateLabel(currentRows[0].data);
    const ultima = formatDateLabel(currentRows[currentRows.length - 1].data);
    intervalo = `${rangeLabel} — ${primeira} a ${ultima}`;
  }
  el('print-header').textContent = `${currentPlayer.nome} — ${intervalo}`;
}

// Só os gráficos saem no PDF — o resto (topo, toolbar, tabela, botões)
// esconde-se via @media print em styles.css. window.print() em vez de
// jsPDF: os canvas do Chart.js imprimem bem tal como estão, sem precisar
// de nenhuma dependência nova (mesmo padrão já usado em match.js).
function exportChartsPdf() {
  window.print();
}

function exportTableExcel() {
  const rows = [['Data', 'Dores', 'Stress', 'Fadiga', 'Sono', 'Peso (kg)']];
  currentRows.forEach(r => {
    rows.push([r.data, r.dores_musculares, r.stress, r.fadiga, r.sono, r.peso ?? '']);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Wellness');
  XLSX.writeFile(wb, `wellness-${slugify(currentPlayer.nome)}-${currentRange}.xlsx`);
}

function slugify(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function wireExports() {
  el('btn-export-charts-pdf').addEventListener('click', exportChartsPdf);
  el('btn-export-table-excel').addEventListener('click', exportTableExcel);
}

// ---------- Carregar dados ----------

async function loadData() {
  let query = supabase
    .from('wellness_responses')
    .select('*')
    .eq('player_id', currentPlayer.id)
    .order('data', { ascending: true });
  const desde = rangeStartDate(currentRange);
  if (desde) query = query.gte('data', desde);

  const { data, error } = await query;
  if (error) { console.error(error); return; }

  currentRows = data || [];
  renderWellnessCharts(currentRows);
  renderPesoChart(currentRows);
  renderTable(currentRows);
  updatePrintHeader();
}

// ---------- Init ----------

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  if (!currentTeamId) { window.location.href = 'teams.html'; return; }
  const { data: team, error: teamError } = await supabase.from('teams').select('*').eq('id', currentTeamId).single();
  if (teamError || !team) { window.location.href = 'teams.html'; return; }
  currentTeam = team;

  const playerId = localStorage.getItem('current_wellness_player_id');
  if (!playerId) { window.location.href = 'dashboard.html'; return; }
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .eq('team_id', currentTeamId)
    .single();
  if (playerError || !player) { window.location.href = 'dashboard.html'; return; }
  currentPlayer = player;

  el('team-indicator').textContent = `Equipa: ${currentTeam.nome}`;
  el('jogador-indicator').textContent = `Jogador: ${currentPlayer.nome}`;

  wireTopBar();
  wireRangeToolbar();
  wireTable();
  wireExports();

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession) window.location.href = 'login.html';
  });

  await loadData();
}

init();
