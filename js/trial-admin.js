/**
 * Análise de Jogo — trial-admin.js
 * Lógica de pages/trial-admin.html: painel de administração do modo de
 * teste — criar/bloquear códigos (trial_codes) e ver as equipas de teste
 * ativas com os dias até expirarem (trial_teams).
 *
 * Página sem login: em vez de auth.signIn, valida um código de
 * administração via RPC (admin_*, ver
 * supabase/migrations/031_trial_admin.sql) — as tabelas trial_codes/
 * trial_teams/admin_access não têm nenhuma policy de RLS, só estas
 * funções (SECURITY DEFINER) lhes tocam.
 *
 * Versão: 1.2 (2026-09-17)
 * Histórico:
 *   1.0 (2026-09-17) — criação.
 *   1.1 (2026-09-17) — botão "Apagar" por equipa de teste
 *                       (admin_delete_trial_team()), com confirmação.
 *   1.2 (2026-09-17) — coluna "Equipa" na tabela de códigos — 1 código passa
 *                       a ligar-se para sempre à mesma equipa (ver
 *                       033_trial_one_team_per_code.sql), por isso mostra-se
 *                       aqui qual é (ou "ainda por estrear", sem nenhuma).
 *                       carregarEquipas() passa a correr antes de
 *                       renderCodigos() para o cruzamento por team_id já
 *                       ter dados.
 */

import { supabase } from './supabase-client.js';

const CODE_STORAGE_KEY = 'trial_admin_access_code';

let adminCode = localStorage.getItem(CODE_STORAGE_KEY) || '';
let codesCache = [];
let teamsCache = [];

function el(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatData(iso) {
  return new Date(iso).toLocaleDateString('pt-PT');
}

function diasRestantes(iso) {
  const dias = Math.ceil((new Date(iso) - new Date()) / 86400000);
  return dias;
}

// ---------- Entrar (código de administração) ----------

async function tentarEntrar(code) {
  const { data, error } = await supabase.rpc('admin_list_trial_codes', { p_code: code });
  if (error) {
    el('code-error').textContent = 'Código inválido.';
    return false;
  }
  adminCode = code;
  localStorage.setItem(CODE_STORAGE_KEY, code);
  codesCache = data || [];
  el('code-screen').hidden = true;
  el('admin-screen').hidden = false;
  el('codes-card').hidden = false;
  el('teams-card').hidden = false;
  await carregarEquipas();
  renderCodigos();
  return true;
}

function wireCodeScreen() {
  el('btn-enter-code').addEventListener('click', () => {
    const code = el('access-code').value.trim();
    if (!code) return;
    tentarEntrar(code);
  });
  el('access-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('btn-enter-code').click();
  });
}

// ---------- Códigos de teste ----------

function renderCodigos() {
  const body = el('codes-body');
  body.innerHTML = '';
  codesCache.forEach(c => {
    const tr = document.createElement('tr');
    const usos = c.max_usos ? `${c.usos} / ${c.max_usos}` : `${c.usos} (sem limite)`;
    const equipa = c.team_id ? teamsCache.find(t => t.team_id === c.team_id) : null;
    tr.innerHTML = `
      <td>${escapeHtml(c.label) || '<span class="hint">—</span>'}</td>
      <td>${equipa ? escapeHtml(equipa.nome) : '<span class="hint">ainda por estrear</span>'}</td>
      <td>${c.ativo ? '✅ Ativo' : '⛔ Bloqueado'}</td>
      <td>${usos}</td>
      <td>${formatData(c.created_at)}</td>
      <td><button type="button" class="action" data-action="toggle" data-id="${c.id}" data-ativo="${c.ativo}">
        ${c.ativo ? 'Bloquear' : 'Reativar'}
      </button></td>
    `;
    body.appendChild(tr);
  });
  el('codes-empty').hidden = codesCache.length > 0;
}

function wireCreateCode() {
  el('btn-create-code').addEventListener('click', async () => {
    const label = el('new-code-label').value.trim();
    const codigo = el('new-code-value').value.trim();
    const maxUsosRaw = el('new-code-max-usos').value.trim();
    el('create-code-error').textContent = '';
    if (!codigo) { el('create-code-error').textContent = 'Escreve o código a partilhar.'; return; }
    const maxUsos = maxUsosRaw ? Number(maxUsosRaw) : null;

    const { data, error } = await supabase.rpc('admin_create_trial_code', {
      p_code: adminCode, p_label: label, p_new_code: codigo, p_max_usos: maxUsos,
    });
    if (error) { el('create-code-error').textContent = error.message; return; }

    codesCache.unshift(data);
    renderCodigos();
    el('new-code-label').value = '';
    el('new-code-value').value = '';
    el('new-code-max-usos').value = '';
  });
}

function wireCodesTable() {
  el('codes-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="toggle"]');
    if (!btn) return;
    const novoAtivo = btn.dataset.ativo !== 'true';
    const { data, error } = await supabase.rpc('admin_set_trial_code_active', {
      p_code: adminCode, p_id: btn.dataset.id, p_ativo: novoAtivo,
    });
    if (error) { alert(error.message); return; }
    const c = codesCache.find(x => x.id === btn.dataset.id);
    if (c) c.ativo = data.ativo;
    renderCodigos();
  });
}

// ---------- Equipas de teste ativas ----------

async function carregarEquipas() {
  const { data, error } = await supabase.rpc('admin_list_trial_teams', { p_code: adminCode });
  if (error) { console.error(error); return; }
  teamsCache = data || [];
  renderEquipas();
}

function renderEquipas() {
  const body = el('teams-body');
  body.innerHTML = '';
  teamsCache.forEach(t => {
    const dias = diasRestantes(t.expires_at);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(t.nome)}</td>
      <td>${escapeHtml(t.trial_code_label) || '<span class="hint">—</span>'}</td>
      <td>${t.jogos}</td>
      <td>${dias > 0 ? `${dias} dia${dias === 1 ? '' : 's'}` : 'expirado'}</td>
      <td><button type="button" class="action" data-action="delete-team" data-id="${t.team_id}">Apagar</button></td>
    `;
    body.appendChild(tr);
  });
  el('teams-empty').hidden = teamsCache.length > 0;
}

function wireTeamsTable() {
  el('teams-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="delete-team"]');
    if (!btn) return;
    const equipa = teamsCache.find(t => t.team_id === btn.dataset.id);
    if (!confirm(`Apagar a equipa de teste "${equipa ? equipa.nome : ''}"? Apaga tudo (jogadores, jogos, eventos) e não pode ser desfeito.`)) return;
    const { error } = await supabase.rpc('admin_delete_trial_team', {
      p_code: adminCode, p_team_id: btn.dataset.id,
    });
    if (error) { alert(error.message); return; }
    teamsCache = teamsCache.filter(t => t.team_id !== btn.dataset.id);
    renderEquipas();
  });
}

wireCodeScreen();
wireCreateCode();
wireCodesTable();
wireTeamsTable();

if (adminCode) {
  tentarEntrar(adminCode);
}
