/**
 * Análise de Jogo — jogador.js
 * Lógica da página do jogador (pages/jogador.html): completar o perfil no
 * primeiro login (nome + data de nascimento) e preencher o questionário de
 * wellness do dia (ou mostrar o resumo, se já tiver respondido hoje).
 *
 * Versão: 1.4 (2026-08-05)
 * Histórico:
 *   1.0 (2026-08-05) — criação.
 *   1.1 (2026-08-05) — cor no valor de cada pergunta (1-4 vermelho, 5-7 amarelo,
 *                       8-10 verde), no slider e no resumo de "já respondeste hoje".
 *   1.2 (2026-08-05) — a cor passa também para a bolinha (thumb) do slider, não só
 *                       para o número ao lado.
 *   1.3 (2026-08-05) — dores/stress/fadiga passam a escala invertida (1-4 verde,
 *                       5-7 amarelo, 8-10 vermelho — valor baixo é bom); sono mantém
 *                       a leitura direta.
 *   1.4 (2026-08-05) — sono passa também a escala invertida, como as outras três.
 */

import { supabase } from './supabase-client.js';

const el = (id) => document.getElementById(id);

let currentPlayer = null;

// Em todas, valor baixo é bom (pouca dor/stress/fadiga, sono "muito bom")
// — verde no nível baixo, vermelho no alto ("invertido" em relação à
// leitura direta do número).
const WELLNESS_FIELDS = [
  { id: 'dores', key: 'dores_musculares', label: 'Dores musculares', invertido: true },
  { id: 'stress', key: 'stress', label: 'Stress', invertido: true },
  { id: 'fadiga', key: 'fadiga', label: 'Fadiga', invertido: true },
  { id: 'sono', key: 'sono', label: 'Sono', invertido: true },
];

function wireSignOut() {
  el('btn-sign-out').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}

// 1-4 / 5-7 / 8-10 (0 conta como o nível mais baixo); a ordem das cores
// inverte-se consoante "invertido" (ver WELLNESS_FIELDS acima).
function wellnessColorClass(value, invertido) {
  const nivel = value <= 4 ? 0 : value <= 7 ? 1 : 2;
  const escala = invertido
    ? ['wellness-val-green', 'wellness-val-yellow', 'wellness-val-red']
    : ['wellness-val-red', 'wellness-val-yellow', 'wellness-val-green'];
  return escala[nivel];
}

function wireWellnessSliders() {
  WELLNESS_FIELDS.forEach(({ id, invertido }) => {
    const input = el(`w-${id}`);
    const value = el(`w-${id}-value`);
    const update = () => {
      const colorClass = wellnessColorClass(Number(input.value), invertido);
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
    WELLNESS_FIELDS.forEach(({ id }) => { values[id] = Number(el(`w-${id}`).value); });

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

function summaryRow(label, value, invertido) {
  return `<div class="wellness-summary-row"><span>${label}</span><b class="${wellnessColorClass(value, invertido)}">${value}/10</b></div>`;
}

function showWellnessDone(response) {
  el('wellness-summary').innerHTML = WELLNESS_FIELDS
    .map(({ key, label, invertido }) => summaryRow(label, response[key], invertido))
    .join('');
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
