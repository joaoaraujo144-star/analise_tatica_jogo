/**
 * Análise de Jogo — login.js
 * Lógica da página de entrada/registo de conta (pages/login.html):
 * autentica com email + palavra-passe via Supabase Auth e redireciona
 * para a escolha de equipa assim que há sessão.
 *
 * Versão: 1.4 (2026-08-05)
 * Histórico:
 *   1.0 (2026-07-08) — criação, ao separar o login do resto da app.
 *   1.1 (2026-07-08) — renomeado de app.html/faltas.html para login.html.
 *   1.2 (2026-07-08) — passa a redirecionar para teams.html (equipas partilháveis).
 *   1.3 (2026-07-14) — movido de raiz para js/, sem alterações de lógica.
 *   1.4 (2026-08-05) — jogadores (login criado pelo treinador) passam a ser
 *                       redirecionados para jogador.html em vez de teams.html.
 */

import { supabase } from './supabase-client.js';

const el = (id) => document.getElementById(id);

function showMessage(msg) {
  el('auth-error').textContent = msg;
}

// ---------- Sessão ----------

// Jogadores (login criado pelo treinador na tab Plantel) têm uma linha em
// "players" com auth_user_id = eles próprios, e vão para jogador.html em
// vez de teams.html — uma vista completamente diferente e mais restrita.
async function redirectAfterLogin(userId) {
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();
  window.location.href = player ? 'jogador.html' : 'teams.html';
}

async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await redirectAfterLogin(session.user.id);
}

// ---------- Formulário de entrar / criar conta ----------

el('btn-sign-in').addEventListener('click', async () => {
  const email = el('auth-email').value.trim();
  const password = el('auth-password').value;
  if (!email || !password) { showMessage('Preenche o email e a palavra-passe.'); return; }
  showMessage('');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { showMessage(error.message); return; }
  await redirectAfterLogin(data.user.id);
});

el('btn-sign-up').addEventListener('click', async () => {
  const email = el('auth-email').value.trim();
  const password = el('auth-password').value;
  if (!email || !password) { showMessage('Preenche o email e a palavra-passe.'); return; }
  showMessage('');
  const { error } = await supabase.auth.signUp({ email, password });
  showMessage(error ? error.message : 'Conta criada. Já podes entrar.');
});

[el('auth-email'), el('auth-password')].forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('btn-sign-in').click();
  });
});

redirectIfLoggedIn();
