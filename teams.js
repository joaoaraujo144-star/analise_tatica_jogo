import { supabase } from './supabase-client.js';

const el = (id) => document.getElementById(id);

async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return null; }
  return session;
}

function openTeam(teamId) {
  localStorage.setItem('current_team_id', teamId);
  window.location.href = 'dashboard.html';
}

const AVATAR_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#c0ca33', '#5e35b1'];

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

async function loadTeams() {
  const { data, error } = await supabase.from('teams').select('*').order('nome', { ascending: true });
  if (error) { console.error(error); return; }
  renderTeams(data || []);
}

function renderTeams(teams) {
  const grid = el('teams-grid');
  grid.innerHTML = '';
  teams.forEach(t => {
    const card = document.createElement('div');
    card.className = 'team-card';
    const badge = t.logo_url
      ? `<img class="team-card-logo" src="${t.logo_url}" alt="${t.nome}">`
      : `<div class="team-card-fallback" style="background:${colorForName(t.nome)}">${t.nome.charAt(0).toUpperCase()}</div>`;
    card.innerHTML = `
      ${badge}
      <div class="team-card-name">${t.nome}</div>
      <div class="team-card-code">${t.join_code}</div>
    `;
    card.addEventListener('click', () => openTeam(t.id));
    grid.appendChild(card);
  });
  el('teams-empty').hidden = teams.length > 0;
}

async function uploadTeamLogo(teamId, file) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${teamId}/logo.${ext}`;
  const { error: uploadError } = await supabase.storage.from('team-logos').upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('team-logos').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

function wireCreateTeam() {
  el('team-logo').addEventListener('change', () => {
    const file = el('team-logo').files[0];
    el('team-logo-filename').textContent = file ? file.name : 'Escolher emblema (opcional)';
  });

  el('btn-create-team').addEventListener('click', async () => {
    const nome = el('team-name').value.trim();
    const file = el('team-logo').files[0];
    el('create-team-error').textContent = '';
    if (!nome) { el('create-team-error').textContent = 'Escreve um nome para a equipa.'; return; }

    const { data: team, error } = await supabase.rpc('create_team', { p_nome: nome });
    if (error) { el('create-team-error').textContent = error.message; return; }

    if (file) {
      try {
        const logoUrl = await uploadTeamLogo(team.id, file);
        await supabase.from('teams').update({ logo_url: logoUrl }).eq('id', team.id);
      } catch (uploadErr) {
        console.error(uploadErr);
        el('create-team-error').textContent = 'Equipa criada, mas o emblema falhou a carregar.';
      }
    }

    openTeam(team.id);
  });

  el('team-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('btn-create-team').click();
  });
}

function wireJoinTeam() {
  el('btn-join-team').addEventListener('click', async () => {
    const code = el('team-code').value.trim();
    el('join-team-error').textContent = '';
    if (!code) { el('join-team-error').textContent = 'Escreve o código de convite.'; return; }
    const { data, error } = await supabase.rpc('join_team_by_code', { p_code: code });
    if (error) { el('join-team-error').textContent = error.message; return; }
    openTeam(data.id);
  });

  el('team-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('btn-join-team').click();
  });
}

function wireSignOut() {
  el('btn-sign-out').addEventListener('click', async () => {
    localStorage.removeItem('current_team_id');
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireCreateTeam();
  wireJoinTeam();
  wireSignOut();
  await loadTeams();
}

init();
