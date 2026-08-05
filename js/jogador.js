/**
 * Análise de Jogo — jogador.js
 * Lógica da página do jogador (pages/jogador.html): completar o perfil no
 * primeiro login (nome + data de nascimento) e preencher o questionário de
 * wellness do dia (ou mostrar o resumo, se já tiver respondido hoje).
 *
 * Versão: 1.2 (2026-08-05)
 * Histórico:
 *   1.0 (2026-08-05) — criação.
 *   1.1 (2026-08-05) — cor no valor de cada pergunta (1-4 vermelho, 5-7 amarelo,
 *                       8-10 verde), no slider e no resumo de "já respondeste hoje".
 *   1.2 (2026-08-05) — a cor passa também para a bolinha (thumb) do slider, não só
 *                       para o número ao lado.
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

// 1-4 vermelho, 5-7 amarelo, 8-10 verde (0 conta como o nível mais baixo).
function wellnessColorClass(value) {
  if (value <= 4) return 'wellness-val-red';
  if (value <= 7) return 'wellness-val-yellow';
  return 'wellness-val-green';
}

function wireWellnessSliders() {
  WELLNESS_FIELDS.forEach(field => {
    const input = el(`w-${field}`);
    const value = el(`w-${field}-value`);
    const update = () => {
      const colorClass = wellnessColorClass(Number(input.value));
      value.textContent = input.value;
      value.className = colorClass;
      input.className = colorClass;
    };
    update();
    input.addEventListener('input', update);
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

function summaryRow(label, value) {
  return `<div class="wellness-summary-row"><span>${label}</span><b class="${wellnessColorClass(value)}">${value}/10</b></div>`;
}

function showWellnessDone(response) {
  el('wellness-summary').innerHTML = [
    summaryRow(WELLNESS_LABELS.dores, response.dores_musculares),
    summaryRow(WELLNESS_LABELS.stress, response.stress),
    summaryRow(WELLNESS_LABELS.fadiga, response.fadiga),
    summaryRow(WELLNESS_LABELS.sono, response.sono),
  ].join('');
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
