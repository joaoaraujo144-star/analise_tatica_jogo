/**
 * Análise de Jogo — dashboard.js
 * Lógica do dashboard de uma equipa (pages/dashboard.html): tabs Jogos
 * (criar/abrir/importar), Plantel (jogadores reutilizáveis da equipa) e
 * Relatórios (totais agregados por jogador ao longo de todos os jogos).
 *
 * Versão: 1.8 (2026-07-14)
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
 */

import { supabase } from './supabase-client.js';

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
    const btn = e.target.closest('.btn-remove-player');
    if (!btn) return;
    if (!confirm('Remover este jogador do plantel? Isto remove também as suas convocatórias em todos os jogos.')) return;
    await supabase.from('players').delete().eq('id', btn.dataset.id);
    await loadRoster();
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

function renderRoster() {
  const body = el('roster-body');
  body.innerHTML = '';
  rosterCache.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.numero || ''}</td><td>${p.nome}</td><td><button class="btn-remove-player" data-id="${p.id}" title="Remover">✕</button></td>`;
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
  wireImport();

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession) window.location.href = 'login.html';
  });

  await loadMatches();
  await loadRoster();
  checkLocalImport();
}

init();
