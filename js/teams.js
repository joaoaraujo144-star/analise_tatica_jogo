/**
 * Análise de Jogo — teams.js
 * Lógica da página de equipas (pages/teams.html): listar, criar, entrar
 * por código de convite, e editar nome/emblema das equipas do utilizador.
 * Passo obrigatório entre o login e o dashboard de uma equipa.
 *
 * Versão: 1.2 (2026-07-14)
 * Histórico:
 *   1.0 (2026-07-08) — criação, com equipas partilháveis (join_code) e emblema.
 *   1.1 (2026-07-09) — edição inline do nome e emblema em cada cartão de equipa.
 *   1.2 (2026-07-14) — movido de raiz para js/, sem alterações de lógica.
 */

import { supabase } from './supabase-client.js';

const el = (id) => document.getElementById(id);

// ---------- Sessão e navegação ----------

async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return null; }
  return session;
}

function openTeam(teamId) {
  localStorage.setItem('current_team_id', teamId);
  window.location.href = 'dashboard.html';
}

// ---------- Emblema / avatar de fallback ----------

const AVATAR_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#c0ca33', '#5e35b1'];

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ---------- Listagem e edição de equipas ----------

let editingTeamId = null;

async function loadTeams() {
  const { data, error } = await supabase.from('teams').select('*').order('nome', { ascending: true });
  if (error) { console.error(error); return; }
  renderTeams(data || []);
}

function teamBadge(t) {
  return t.logo_url
    ? `<img class="team-card-logo" src="${t.logo_url}" alt="${t.nome}">`
    : `<div class="team-card-fallback" style="background:${colorForName(t.nome)}">${t.nome.charAt(0).toUpperCase()}</div>`;
}

function renderTeams(teams) {
  const grid = el('teams-grid');
  grid.innerHTML = '';
  teams.forEach(t => {
    const card = document.createElement('div');
    card.dataset.id = t.id;

    if (editingTeamId === t.id) {
      card.className = 'team-card editing';
      card.innerHTML = `
        <button class="team-card-edit-btn" data-action="cancel-edit" title="Cancelar">✕</button>
        ${teamBadge(t)}
        <input type="text" class="team-edit-name" value="${t.nome}">
        <label class="file-label small">
          <span class="team-edit-logo-filename">Trocar emblema</span>
          <input type="file" class="team-edit-logo" accept="image/*">
        </label>
        <div class="team-card-edit-actions">
          <button class="action" data-action="save-edit">Guardar</button>
        </div>
        <p class="hint team-edit-error"></p>
      `;
    } else {
      card.className = 'team-card';
      card.innerHTML = `
        <button class="team-card-edit-btn" data-action="edit" title="Editar equipa">✏️</button>
        ${teamBadge(t)}
        <div class="team-card-name">${t.nome}</div>
        <div class="team-card-code">${t.join_code}</div>
      `;
    }
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

function wireTeamGrid() {
  const grid = el('teams-grid');

  grid.addEventListener('change', (e) => {
    const input = e.target.closest('.team-edit-logo');
    if (!input) return;
    const filenameSpan = input.previousElementSibling;
    if (filenameSpan) filenameSpan.textContent = input.files[0]?.name || 'Trocar emblema';
  });

  grid.addEventListener('click', async (e) => {
    const card = e.target.closest('.team-card');
    if (!card) return;
    const teamId = card.dataset.id;

    if (e.target.closest('[data-action="edit"]')) {
      editingTeamId = teamId;
      await loadTeams();
      return;
    }

    if (e.target.closest('[data-action="cancel-edit"]')) {
      editingTeamId = null;
      await loadTeams();
      return;
    }

    if (e.target.closest('[data-action="save-edit"]')) {
      const nameInput = card.querySelector('.team-edit-name');
      const fileInput = card.querySelector('.team-edit-logo');
      const errorEl = card.querySelector('.team-edit-error');
      const nome = nameInput.value.trim();
      if (!nome) { errorEl.textContent = 'O nome não pode ficar vazio.'; return; }

      const patch = { nome };
      const file = fileInput.files[0];
      if (file) {
        try {
          patch.logo_url = await uploadTeamLogo(teamId, file);
        } catch (uploadErr) {
          console.error(uploadErr);
          errorEl.textContent = 'Falha ao carregar o novo emblema.';
          return;
        }
      }

      const { error } = await supabase.from('teams').update(patch).eq('id', teamId);
      if (error) { errorEl.textContent = error.message; return; }

      editingTeamId = null;
      await loadTeams();
      return;
    }

    if (editingTeamId !== teamId) openTeam(teamId);
  });
}

// ---------- Criar equipa ----------

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

// ---------- Juntar a uma equipa por código de convite ----------

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

// ---------- Init ----------

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireTeamGrid();
  wireCreateTeam();
  wireJoinTeam();
  wireSignOut();
  await loadTeams();
}

init();
