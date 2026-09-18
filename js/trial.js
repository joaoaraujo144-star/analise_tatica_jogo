/**
 * Análise de Jogo — trial.js
 * Lógica de pages/trial.html: em vez de login, faz signInAnonymously() e
 * chama start_trial(codigo) — se o código bater certo, cria uma equipa de
 * teste normal (1 jogo, expira em 10 dias) e abre-a como qualquer outra
 * equipa (mesmo padrão de openTeam() em teams.js).
 *
 * Versão: 1.1 (2026-09-17)
 * Histórico:
 *   1.0 (2026-09-17) — criação.
 *   1.1 (2026-09-17) — só chama signInAnonymously() se ainda não houver
 *                       nenhuma sessão — chamá-la sempre substituía a sessão
 *                       anónima existente por uma nova a cada tentativa,
 *                       perdendo o acesso à equipa de teste anterior mesmo
 *                       usando o mesmo código (start_trial() já sabe devolver
 *                       a equipa da sessão atual, mas só se a sessão for a
 *                       mesma).
 */

import { supabase } from './supabase-client.js';

function el(id) {
  return document.getElementById(id);
}

function openTeam(teamId) {
  localStorage.setItem('current_team_id', teamId);
  window.location.href = 'dashboard.html';
}

function setLoading(loading) {
  el('btn-start-trial').disabled = loading;
  el('btn-start-trial').textContent = loading ? 'A criar equipa de teste…' : 'Começar teste';
}

async function startTrial() {
  const code = el('trial-code').value.trim();
  el('trial-error').textContent = '';
  if (!code) { el('trial-error').textContent = 'Escreve o código de acesso.'; return; }

  setLoading(true);

  // Sessão anónima real (auth.uid() passa a funcionar) — não é preciso
  // criar conta nem palavra-passe; start_trial() exige uma sessão para
  // saber quem é o "owner" da equipa de teste. Só cria uma sessão nova se
  // ainda não houver nenhuma — reaproveitar a existente é o que permite ao
  // start_trial() reconhecer quem já tem uma equipa de teste em curso.
  const { data: { session: existingSession } } = await supabase.auth.getSession();
  if (!existingSession) {
    const { error: authError } = await supabase.auth.signInAnonymously();
    if (authError) {
      el('trial-error').textContent = 'Não foi possível iniciar a sessão de teste. Tenta outra vez.';
      setLoading(false);
      return;
    }
  }

  const { data: team, error } = await supabase.rpc('start_trial', { p_code: code });
  if (error) {
    el('trial-error').textContent = 'Código inválido.';
    setLoading(false);
    return;
  }

  openTeam(team.id);
}

function wireTrial() {
  el('btn-start-trial').addEventListener('click', startTrial);
  el('trial-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startTrial();
  });
}

async function init() {
  // Já tens uma sessão de teste ativa neste browser? Não vale a pena
  // criar outra (perderias o acesso à equipa de teste anterior) — segue
  // direto para o dashboard, tal como as outras páginas fazem.
  const { data: { session } } = await supabase.auth.getSession();
  const currentTeamId = localStorage.getItem('current_team_id');
  if (session && currentTeamId) {
    window.location.href = 'dashboard.html';
    return;
  }
  wireTrial();
}

init();
