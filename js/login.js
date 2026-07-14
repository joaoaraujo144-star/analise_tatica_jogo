/**
 * Análise de Jogo — login.js
 * Lógica da página de entrada/registo de conta (pages/login.html):
 * autentica com email + palavra-passe via Supabase Auth e redireciona
 * para a escolha de equipa assim que há sessão.
 *
 * Versão: 1.3 (2026-07-14)
 * Histórico:
 *   1.0 (2026-07-08) — criação, ao separar o login do resto da app.
 *   1.1 (2026-07-08) — renomeado de app.html/faltas.html para login.html.
 *   1.2 (2026-07-08) — passa a redirecionar para teams.html (equipas partilháveis).
 *   1.3 (2026-07-14) — movido de raiz para js/, sem alterações de lógica.
 */

import { supabase } from './supabase-client.js';

const el = (id) => document.getElementById(id);

function showMessage(msg) {
  el('auth-error').textContent = msg;
}

// ---------- Sessão ----------

async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = 'teams.html';
}

// ---------- Formulário de entrar / criar conta ----------

el('btn-sign-in').addEventListener('click', async () => {
  const email = el('auth-email').value.trim();
  const password = el('auth-password').value;
  if (!email || !password) { showMessage('Preenche o email e a palavra-passe.'); return; }
  showMessage('');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { showMessage(error.message); return; }
  window.location.href = 'teams.html';
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
