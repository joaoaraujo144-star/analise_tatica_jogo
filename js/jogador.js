/**
 * Análise de Jogo — jogador.js
 * Lógica da página do jogador (pages/jogador.html): completar o perfil no
 * primeiro login (nome + data de nascimento) e preencher o questionário de
 * wellness do dia (ou mostrar o resumo, se já tiver respondido hoje).
 *
 * Versão: 1.0 (2026-08-05)
 * Histórico:
 *   1.0 (2026-08-05) — criação.
 */

import { supabase } from './supabase-client.js';

const el = (id) => document.getElementById(id);

let currentPlayer = null;

const WELLNESS_FIELDS = ['dores', 'stress', 'fadiga', 'sono'];
const WELLNESS_LABELS = { dores: 'Dores musculares', stress: 'Stress', fadiga: 'Fadiga', sono: 'Sono' };

function wireSignOut() {
  el('btn-sign-out').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}

function wireWellnessSliders() {
  WELLNESS_FIELDS.forEach(field => {
    const input = el(`w-${field}`);
    const value = el(`w-${field}-value`);
    input.addEventListener('input', () => { value.textContent = input.value; });
  });
}

// ---------- Perfil (primeiro login) ----------

function showPerfilForm() {
  el('perfil-nome').value = currentPlayer.nome || '';
  el('perfil-card').hidden = false;
}

function wirePerfilForm() {
  el('btn-guardar-perfil').addEventListener('click', async () => {
    const nome = el('perfil-nome').value.trim();
    const dataNascimento = el('perfil-nascimento').value;
    el('perfil-error').textContent = '';
    if (!nome || !dataNascimento) { el('perfil-error').textContent = 'Preenche o nome e a data de nascimento.'; return; }

    const { error } = await supabase
      .from('players')
      .update({ nome, data_nascimento: dataNascimento })
      .eq('id', currentPlayer.id);
    if (error) { el('perfil-error').textContent = error.message; return; }

    currentPlayer.nome = nome;
    currentPlayer.data_nascimento = dataNascimento;
    el('perfil-card').hidden = true;
    updateIndicator();
    await loadWellnessToday();
  });
}

// ---------- Wellness do dia ----------

function updateIndicator() {
  el('jogador-indicator').textContent = currentPlayer.nome ? `Olá, ${currentPlayer.nome}` : 'Jogador';
}

function wireWellnessForm() {
  el('btn-enviar-wellness').addEventListener('click', async () => {
    el('wellness-error').textContent = '';
    const values = {};
    WELLNESS_FIELDS.forEach(field => { values[field] = Number(el(`w-${field}`).value); });

    const { data, error } = await supabase.rpc('submit_wellness', {
      p_dores_musculares: values.dores,
      p_stress: values.stress,
      p_fadiga: values.fadiga,
      p_sono: values.sono,
    });
    if (error) { el('wellness-error').textContent = error.message; return; }

    el('wellness-form-card').hidden = true;
    showWellnessDone(data);
  });
}

function showWellnessDone(response) {
  el('wellness-summary').innerHTML = `
    <div class="wellness-summary-row"><span>${WELLNESS_LABELS.dores}</span><b>${response.dores_musculares}/10</b></div>
    <div class="wellness-summary-row"><span>${WELLNESS_LABELS.stress}</span><b>${response.stress}/10</b></div>
    <div class="wellness-summary-row"><span>${WELLNESS_LABELS.fadiga}</span><b>${response.fadiga}/10</b></div>
    <div class="wellness-summary-row"><span>${WELLNESS_LABELS.sono}</span><b>${response.sono}/10</b></div>
  `;
  el('wellness-done-card').hidden = false;
}

async function loadWellnessToday() {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('wellness_responses')
    .select('*')
    .eq('player_id', currentPlayer.id)
    .eq('data', hoje)
    .maybeSingle();
  if (error) { console.error(error); return; }

  if (data) {
    showWellnessDone(data);
  } else {
    el('wellness-form-card').hidden = false;
  }
}

// ---------- Init ----------

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  const { data: player, error } = await supabase
    .from('players')
    .select('*')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();
  if (error || !player) {
    alert('Esta conta não está associada a nenhum jogador. Fala com o treinador.');
    await supabase.auth.signOut();
    window.location.href = 'login.html';
    return;
  }
  currentPlayer = player;
  updateIndicator();

  wireSignOut();
  wirePerfilForm();
  wireWellnessSliders();
  wireWellnessForm();

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession) window.location.href = 'login.html';
  });

  if (!currentPlayer.data_nascimento) {
    showPerfilForm();
  } else {
    await loadWellnessToday();
  }
}

init();
