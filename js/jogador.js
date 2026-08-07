/**
 * Análise de Jogo — jogador.js
 * Lógica da página do jogador (pages/jogador.html): preencher o
 * questionário de wellness do dia (ou mostrar o resumo, se já tiver
 * respondido hoje).
 *
 * Versão: 1.9 (2026-08-07)
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
 *   1.5 (2026-08-07) — campo opcional de peso (kg) no questionário, sem cor (não é
 *                       uma escala 0-10) — mostrado no resumo só se tiver sido preenchido.
 *   1.6 (2026-08-07) — remove o passo "Completa o teu perfil" do primeiro login; entra
 *                       logo no questionário do dia.
 *   1.7 (2026-08-07) — popup de confirmação ("Questionário enviado!") ao submeter, antes
 *                       de mostrar o resumo.
 *   1.8 (2026-08-07) — loadWellnessToday() passa a comparar com a resposta mais recente
 *                       (em vez de filtrar direto por data), com log de diagnóstico.
 *   1.9 (2026-08-07) — esconde/mostra os dois cartões (form/resumo) sempre de forma
 *                       explícita nos dois ramos, para não depender do estado inicial do HTML.
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

// ---------- Wellness do dia ----------

function updateIndicator() {
  el('jogador-indicator').textContent = currentPlayer.nome ? `Olá, ${currentPlayer.nome}` : 'Jogador';
}

function wireWellnessForm() {
  el('btn-enviar-wellness').addEventListener('click', async () => {
    el('wellness-error').textContent = '';
    const values = {};
    WELLNESS_FIELDS.forEach(({ id }) => { values[id] = Number(el(`w-${id}`).value); });
    const pesoStr = el('w-peso').value.trim();

    const { data, error } = await supabase.rpc('submit_wellness', {
      p_dores_musculares: values.dores,
      p_stress: values.stress,
      p_fadiga: values.fadiga,
      p_sono: values.sono,
      p_peso: pesoStr ? Number(pesoStr) : null,
    });
    if (error) { el('wellness-error').textContent = error.message; return; }

    alert('Questionário enviado! Já respondeste por hoje — até amanhã.');
    el('wellness-form-card').hidden = true;
    showWellnessDone(data);
  });
}

function summaryRow(label, value, invertido) {
  return `<div class="wellness-summary-row"><span>${label}</span><b class="${wellnessColorClass(value, invertido)}">${value}/10</b></div>`;
}

function showWellnessDone(response) {
  const linhas = WELLNESS_FIELDS.map(({ key, label, invertido }) => summaryRow(label, response[key], invertido));
  if (response.peso != null) {
    linhas.push(`<div class="wellness-summary-row"><span>Peso</span><b>${response.peso} kg</b></div>`);
  }
  el('wellness-summary').innerHTML = linhas.join('');
  el('wellness-done-card').hidden = false;
}

async function loadWellnessToday() {
  const hoje = new Date().toISOString().slice(0, 10);
  // Vai buscar a resposta mais recente (em vez de filtrar logo por "data =
  // hoje") e compara-se a data cá — evita rebentar se alguma vez houver
  // mais que uma linha a corresponder, e ajuda a diagnosticar (consola)
  // se a causa for a data não bater certo.
  const { data, error } = await supabase
    .from('wellness_responses')
    .select('*')
    .eq('player_id', currentPlayer.id)
    .order('data', { ascending: false })
    .limit(1);
  if (error) { console.error(error); return; }

  const ultima = data && data[0];
  console.log('[wellness] hoje =', hoje, '| última resposta =', ultima);

  if (ultima && ultima.data === hoje) {
    el('wellness-form-card').hidden = true;
    showWellnessDone(ultima);
  } else {
    el('wellness-done-card').hidden = true;
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
  wireWellnessSliders();
  wireWellnessForm();

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession) window.location.href = 'login.html';
  });

  await loadWellnessToday();
}

init();
