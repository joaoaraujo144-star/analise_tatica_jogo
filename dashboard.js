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
  wireMatches();
  wireImport();

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession) window.location.href = 'login.html';
  });

  await loadMatches();
  checkLocalImport();
}

init();
