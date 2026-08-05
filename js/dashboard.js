/**
 * Análise de Jogo — dashboard.js
 * Lógica do dashboard de uma equipa (pages/dashboard.html): tabs Jogos
 * (criar/abrir/importar), Plantel (jogadores reutilizáveis da equipa),
 * Wellness (vista do treinador sobre o questionário diário dos jogadores)
 * e Relatórios (totais agregados por jogador ao longo de todos os jogos).
 *
 * Versão: 1.13 (2026-08-05)
 * Histórico:
 *   1.0 (2026-07-08) — criação, ao migrar de localStorage para Supabase (multi-jogo, plantel, relatórios).
 *   1.1 (2026-07-08) — separado do login, que passa a ter página própria.
 *   1.2 (2026-07-08) — renomeado de app.js para dashboard.js.
 *   1.3 (2026-07-08) — passa a filtrar tudo por equipa (team_id), com troca de equipa.
 *   1.4 (2026-07-09) — separado o dashboard da página de um jogo específico (match.html).
 *   1.5 (2026-07-09) — relatório agregado de todos os jogos passa a viver aqui (por jogo fica em match.html).
 *   1.6 (2026-07-09) — a tab Plantel passa a viver aqui, em vez de dentro de cada jogo.
 *   1.7 (2026-07-10) — relatório agregado passa a somar também o 2º cartão amarelo.
 *   1.8 (2026-07-14) — movido de raiz para js/, sem alterações de lógica.
 *   1.9 (2026-08-05) — Plantel ganha "Criar login" por jogador (conta própria para o
 *                       questionário de wellness); nova tab Wellness com quem respondeu hoje.
 *   1.10 (2026-08-05) — "Criar login" passa a gerar o utilizador automaticamente a partir
 *                        do nome (@jogador.local) — o treinador só define a password.
 *   1.11 (2026-08-05) — tab Wellness ganha as médias do dia por métrica (dores, stress,
 *                        fadiga, sono), calculadas só sobre quem já respondeu.
 *   1.12 (2026-08-05) — exportação da tab Wellness para Excel (.xlsx), diária e semanal
 *                        (semana civil, segunda a domingo), via SheetJS (CDN).
 *   1.13 (2026-08-05) — cor (verde/amarelo/vermelho) nos valores da tabela e nas médias
 *                        da tab Wellness, igual à escala usada em jogador.html.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-client.js';

const TRACKERS = [
  { id: 'faltas', title: 'Faltas', xLabel: 'Realizadas', yLabel: 'Sofridas' },
  { id: 'cantos', title: 'Cantos', xLabel: 'A Favor', yLabel: 'Contra' },
  { id: 'perdas', title: 'Perdas de Bola', xLabel: 'A Favor', yLabel: 'Contra' },
  { id: 'remates', title: 'Remates', xLabel: 'A Favor', yLabel: 'Contra' },
];

const el = (id) => document.getElementById(id);

let currentUser = null;
let currentTeamId = localStorage.getItem('current_team_id') || null;
let currentTeam = null;
let matchesCache = [];
let rosterCache = [];
let creatingLoginForId = null;

// ---------- Topo (indicador de equipa, sair, trocar de equipa) ----------

function updateTeamIndicator() {
  el('team-indicator').textContent = currentTeam ? `Equipa: ${currentTeam.nome}` : 'Equipa';
}

function wireAuthForm() {
  el('btn-sign-out').addEventListener('click', async () => {
    localStorage.removeItem('current_team_id');
    localStorage.removeItem('current_match_id');
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });

  el('btn-switch-team').addEventListener('click', () => {
    window.location.href = 'teams.html';
  });
}

// ---------- Tabs ----------

function wireTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.hidden = panel.id !== `tab-${btn.dataset.tab}`;
      });
      if (btn.dataset.tab === 'relatorios') loadReports();
      if (btn.dataset.tab === 'wellness') loadWellness();
    });
  });
}

// ---------- Jogos ----------

function openMatch(matchId) {
  localStorage.setItem('current_match_id', matchId);
  window.location.href = 'match.html';
}

function wireMatches() {
  el('btn-create-match').addEventListener('click', async () => {
    const data = el('match-date').value;
    const adversario = el('match-opponent').value.trim();
    if (!data || !adversario) return;
    const { data: row, error } = await supabase
      .from('matches')
      .insert({ user_id: currentUser.id, team_id: currentTeamId, data, adversario })
      .select()
      .single();
    if (error) { alert(error.message); return; }
    openMatch(row.id);
  });

  el('match-opponent').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('btn-create-match').click();
  });
}

async function loadMatches() {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('team_id', currentTeamId)
    .order('data', { ascending: false });
  if (error) { console.error(error); return; }
  matchesCache = data || [];
  renderMatches();
}

function renderMatches() {
  const body = el('matches-body');
  body.innerHTML = '';
  matchesCache.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.data}</td><td>${m.adversario}</td><td><button class="action" data-id="${m.id}">Abrir</button></td>`;
    body.appendChild(tr);
  });
  el('matches-empty').hidden = matchesCache.length > 0;
  body.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => openMatch(btn.dataset.id));
  });
}

// ---------- Plantel ----------

function wireRoster() {
  el('btn-add-roster-player').addEventListener('click', async () => {
    const nome = el('roster-name').value.trim();
    if (!nome) return;
    const numero = el('roster-number').value.trim();
    const { error } = await supabase.from('players').insert({ user_id: currentUser.id, team_id: currentTeamId, numero: numero || null, nome });
    if (error) { alert(error.message); return; }
    el('roster-number').value = '';
    el('roster-name').value = '';
    await loadRoster();
  });

  [el('roster-number'), el('roster-name')].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') el('btn-add-roster-player').click();
    });
  });

  el('roster-body').addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('.btn-remove-player');
    if (removeBtn) {
      if (!confirm('Remover este jogador do plantel? Isto remove também as suas convocatórias em todos os jogos.')) return;
      await supabase.from('players').delete().eq('id', removeBtn.dataset.id);
      await loadRoster();
      return;
    }

    const startBtn = e.target.closest('[data-action="start-login"]');
    if (startBtn) {
      creatingLoginForId = startBtn.dataset.id;
      renderRoster();
      return;
    }

    const cancelBtn = e.target.closest('[data-action="cancel-login"]');
    if (cancelBtn) {
      creatingLoginForId = null;
      renderRoster();
      return;
    }

    const confirmBtn = e.target.closest('[data-action="confirm-login"]');
    if (confirmBtn) {
      const row = confirmBtn.closest('tr');
      const email = row.querySelector('.roster-access-email').value.trim();
      const password = row.querySelector('.roster-access-password').value;
      if (!password) { alert('Preenche a password.'); return; }

      // Cliente à parte, sem guardar sessão — signUp() troca a sessão ativa
      // do cliente que a chama, e não podemos perder a sessão do treinador.
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data, error } = await authClient.auth.signUp({ email, password });
      if (error) { alert(error.message); return; }

      const { error: linkError } = await supabase
        .from('players')
        .update({ auth_user_id: data.user.id, login_email: email })
        .eq('id', confirmBtn.dataset.id);
      if (linkError) { alert(linkError.message); return; }

      creatingLoginForId = null;
      await loadRoster();
    }
  });
}

async function loadRoster() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('team_id', currentTeamId)
    .order('nome', { ascending: true });
  if (error) { console.error(error); return; }
  rosterCache = data || [];
  renderRoster();
}

function randomPassword() {
  return Math.random().toString(36).slice(-8);
}

// O Supabase Auth exige sempre algo com formato de email, mas o jogador
// nunca precisa de o receber nem de lhe aceder — funciona como um simples
// "username", gerado a partir do nome para o treinador não ter de inventar
// nada (só define a password). O sufixo aleatório evita colisões entre
// jogadores com nomes iguais/parecidos.
function slugifyNome(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'jogador';
}

function generateLoginUsername(nome) {
  // Domínio ".app" de propósito — TLDs reservados como ".local"/".test"
  // são rejeitados pelo validador de email do Supabase Auth ("Email
  // address is invalid"), mesmo sem nenhum email real ser enviado.
  const suffix = Math.random().toString(36).slice(-4);
  return `${slugifyNome(nome)}-${suffix}@jogador.app`;
}

function accessCellHtml(p) {
  if (p.auth_user_id) {
    return `<span class="access-badge" title="Login criado">🔑 ${p.login_email || ''}</span>`;
  }
  if (creatingLoginForId === p.id) {
    return `
      <div class="roster-access-form">
        <input type="text" class="roster-access-email" value="${generateLoginUsername(p.nome)}" readonly title="Utilizador (gerado automaticamente)">
        <input type="text" class="roster-access-password" value="${randomPassword()}" title="Password">
        <button class="action small" data-action="confirm-login" data-id="${p.id}">Criar</button>
        <button class="action small" data-action="cancel-login" title="Cancelar">✕</button>
      </div>
    `;
  }
  return `<button class="action small" data-action="start-login" data-id="${p.id}">Criar login</button>`;
}

function renderRoster() {
  const body = el('roster-body');
  body.innerHTML = '';
  rosterCache.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.numero || ''}</td><td>${p.nome}</td><td class="roster-access">${accessCellHtml(p)}</td><td><button class="btn-remove-player" data-id="${p.id}" title="Remover">✕</button></td>`;
    body.appendChild(tr);
  });
  el('roster-empty').hidden = rosterCache.length > 0;
}

// ---------- Relatórios ----------

async function loadReports() {
  const { data, error } = await supabase
    .from('match_players')
    .select('golo, assistencias, amarelo, amarelo2, vermelho, players(id, numero, nome)')
    .eq('team_id', currentTeamId);
  if (error) { console.error(error); return; }

  const byPlayer = new Map();
  (data || []).forEach(row => {
    const p = row.players;
    if (!p) return;
    if (!byPlayer.has(p.id)) {
      byPlayer.set(p.id, { numero: p.numero, nome: p.nome, jogos: 0, golo: 0, assistencias: 0, amarelo: 0, vermelho: 0 });
    }
    const agg = byPlayer.get(p.id);
    agg.jogos += 1;
    agg.golo += row.golo || 0;
    agg.assistencias += row.assistencias || 0;
    agg.amarelo += (row.amarelo || 0) + (row.amarelo2 || 0);
    agg.vermelho += row.vermelho || 0;
  });

  const rows = Array.from(byPlayer.values()).sort((a, b) => b.golo - a.golo || b.assistencias - a.assistencias);
  renderReports(rows);
}

function renderReports(rows) {
  const body = el('reports-body');
  body.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.numero || ''}</td><td>${r.nome}</td><td>${r.jogos}</td><td>${r.golo}</td><td>${r.assistencias}</td><td>${r.amarelo}</td><td>${r.vermelho}</td>`;
    body.appendChild(tr);
  });
  el('reports-empty').hidden = rows.length > 0;
}

// ---------- Wellness (vista do treinador: quem respondeu hoje) ----------

async function loadWellness() {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('wellness_responses')
    .select('player_id, dores_musculares, stress, fadiga, sono')
    .eq('team_id', currentTeamId)
    .eq('data', hoje);
  if (error) { console.error(error); return; }
  const byPlayer = new Map((data || []).map(r => [r.player_id, r]));
  renderWellness(byPlayer);
}

// Em todas as métricas, valor baixo é bom (pouca dor/stress/fadiga, sono
// "muito bom") — verde no nível baixo, vermelho no alto. Mesma escala
// usada em jogador.js (1-4 verde, 5-7 amarelo, 8-10 vermelho).
function wellnessColorClass(value) {
  if (value <= 4) return 'wellness-val-green';
  if (value <= 7) return 'wellness-val-yellow';
  return 'wellness-val-red';
}

function wellnessCell(value) {
  return value == null ? '—' : `<span class="${wellnessColorClass(value)}">${value}</span>`;
}

function renderWellness(byPlayer) {
  const body = el('wellness-body');
  body.innerHTML = '';
  rosterCache.forEach(p => {
    const r = byPlayer.get(p.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.numero || ''}</td><td>${p.nome}</td><td>${r ? '✅' : '❌'}</td><td>${wellnessCell(r?.dores_musculares)}</td><td>${wellnessCell(r?.stress)}</td><td>${wellnessCell(r?.fadiga)}</td><td>${wellnessCell(r?.sono)}</td>`;
    body.appendChild(tr);
  });
  el('wellness-empty').hidden = rosterCache.length > 0;
  renderWellnessAverages(Array.from(byPlayer.values()), rosterCache.length);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Média do dia, só sobre quem já respondeu (não conta os que faltam como 0).
function renderWellnessAverages(responses, totalJogadores) {
  const fields = [['dores', 'dores_musculares'], ['stress', 'stress'], ['fadiga', 'fadiga'], ['sono', 'sono']];
  fields.forEach(([id, key]) => {
    const avg = average(responses.map(r => r[key]));
    const span = el(`avg-${id}`);
    span.textContent = avg === null ? '—' : avg.toFixed(1);
    span.className = avg === null ? 'num' : `num ${wellnessColorClass(avg)}`;
  });
  el('wellness-averages-hint').textContent = responses.length
    ? `Médias com base em ${responses.length} de ${totalJogadores} jogador(es) que já responderam hoje.`
    : 'Ainda ninguém respondeu hoje.';
}

// ---------- Wellness: exportação para Excel (.xlsx) ----------

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const WELLNESS_METRICAS = ['dores_musculares', 'stress', 'fadiga', 'sono'];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Segunda-feira da semana civil que contém "date".
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = domingo, 1 = segunda, ...
  const diffParaSegunda = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffParaSegunda);
  return d;
}

function currentWeekDates() {
  const segunda = startOfWeek(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function mediasRow(responses) {
  return WELLNESS_METRICAS.map(k => {
    const avg = average(responses.map(r => r[k]));
    return avg === null ? '' : Number(avg.toFixed(1));
  });
}

function downloadWorkbook(sheets, filename) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  });
  XLSX.writeFile(wb, filename);
}

async function exportWellnessDaily() {
  const hojeIso = isoDate(new Date());
  const { data, error } = await supabase
    .from('wellness_responses')
    .select('player_id, dores_musculares, stress, fadiga, sono')
    .eq('team_id', currentTeamId)
    .eq('data', hojeIso);
  if (error) { alert(error.message); return; }

  const byPlayer = new Map((data || []).map(r => [r.player_id, r]));
  const rows = [['Nº', 'Nome', 'Respondeu', 'Dores', 'Stress', 'Fadiga', 'Sono']];
  rosterCache.forEach(p => {
    const r = byPlayer.get(p.id);
    rows.push([p.numero || '', p.nome, r ? 'Sim' : 'Não', r?.dores_musculares ?? '', r?.stress ?? '', r?.fadiga ?? '', r?.sono ?? '']);
  });
  rows.push(['', '', 'Média', ...mediasRow(Array.from(byPlayer.values()))]);

  downloadWorkbook([{ name: 'Wellness', rows }], `wellness-diario-${hojeIso}.xlsx`);
}

async function exportWellnessWeekly() {
  const dates = currentWeekDates();
  const inicioIso = isoDate(dates[0]);
  const fimIso = isoDate(dates[6]);

  const { data, error } = await supabase
    .from('wellness_responses')
    .select('player_id, data, dores_musculares, stress, fadiga, sono')
    .eq('team_id', currentTeamId)
    .gte('data', inicioIso)
    .lte('data', fimIso);
  if (error) { alert(error.message); return; }

  const byPlayerDay = new Map((data || []).map(r => [`${r.player_id}_${r.data}`, r]));

  const respostasRows = [['Data', 'Dia', 'Nº', 'Nome', 'Respondeu', 'Dores', 'Stress', 'Fadiga', 'Sono']];
  const mediasRows = [['Data', 'Dia', 'Dores', 'Stress', 'Fadiga', 'Sono', 'Nº respostas']];

  dates.forEach((date, i) => {
    const diaIso = isoDate(date);
    const respostasDoDia = [];
    rosterCache.forEach(p => {
      const r = byPlayerDay.get(`${p.id}_${diaIso}`);
      if (r) respostasDoDia.push(r);
      respostasRows.push([diaIso, DIAS_SEMANA[i], p.numero || '', p.nome, r ? 'Sim' : 'Não', r?.dores_musculares ?? '', r?.stress ?? '', r?.fadiga ?? '', r?.sono ?? '']);
    });
    mediasRows.push([diaIso, DIAS_SEMANA[i], ...mediasRow(respostasDoDia), respostasDoDia.length]);
  });

  downloadWorkbook(
    [{ name: 'Respostas', rows: respostasRows }, { name: 'Médias diárias', rows: mediasRows }],
    `wellness-semanal-${inicioIso}-a-${fimIso}.xlsx`
  );
}

function wireWellnessExports() {
  el('btn-export-wellness-daily').addEventListener('click', exportWellnessDaily);
  el('btn-export-wellness-weekly').addEventListener('click', exportWellnessWeekly);
}

// ---------- Importar dados locais (localStorage -> Supabase) ----------

function checkLocalImport() {
  const hasLocalData = TRACKERS.some(cfg => localStorage.getItem(`${cfg.id}_clicks_v1`)) || localStorage.getItem('jogadores_v1');
  el('import-card').hidden = !hasLocalData;
}

function wireImport() {
  el('btn-import-local').addEventListener('click', async () => {
    if (!confirm('Isto cria um novo jogo "Importado" e copia os dados guardados neste browser. Continuar?')) return;

    const { data: match, error } = await supabase
      .from('matches')
      .insert({ user_id: currentUser.id, team_id: currentTeamId, adversario: 'Importado', data: new Date().toISOString().slice(0, 10) })
      .select()
      .single();
    if (error) { alert(error.message); return; }

    const oldPlayers = JSON.parse(localStorage.getItem('jogadores_v1') || '[]');
    for (const p of oldPlayers) {
      const { data: newPlayer, error: playerError } = await supabase
        .from('players')
        .insert({ user_id: currentUser.id, team_id: currentTeamId, numero: p.numero || null, nome: p.nome })
        .select()
        .single();
      if (playerError) continue;
      await supabase.from('match_players').insert({
        user_id: currentUser.id,
        team_id: currentTeamId,
        match_id: match.id,
        player_id: newPlayer.id,
        estado: p.estado || 'Suplente',
        amarelo: p.amarelo || 0,
        vermelho: p.vermelho || 0,
        assistencias: p.assistencias || 0,
        golo: p.golo || 0,
        minuto_substituicao: p.minutoSubstituicao ? Number(p.minutoSubstituicao) : null
      });
    }

    for (const cfg of TRACKERS) {
      const oldClicks = JSON.parse(localStorage.getItem(`${cfg.id}_clicks_v1`) || '[]');
      if (!oldClicks.length) continue;
      const rows = oldClicks.map(c => ({
        user_id: currentUser.id,
        team_id: currentTeamId,
        match_id: match.id,
        tracker_id: cfg.id,
        tipo: c.tipo,
        x_pct: Number(c.x_pct),
        y_pct: Number(c.y_pct)
      }));
      await supabase.from('events').insert(rows);
    }

    openMatch(match.id);
  });
}

// ---------- Init ----------

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  currentUser = session.user;

  if (!currentTeamId) { window.location.href = 'teams.html'; return; }
  const { data: team, error: teamError } = await supabase.from('teams').select('*').eq('id', currentTeamId).single();
  if (teamError || !team) { window.location.href = 'teams.html'; return; }
  currentTeam = team;
  updateTeamIndicator();

  wireAuthForm();
  wireTabs();
  wireMatches();
  wireRoster();
  wireWellnessExports();
  wireImport();

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession) window.location.href = 'login.html';
  });

  await loadMatches();
  await loadRoster();
  checkLocalImport();
}

init();
