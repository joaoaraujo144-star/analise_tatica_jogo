import { supabase } from './supabase-client.js';

const el = (id) => document.getElementById(id);

function showMessage(msg) {
  el('auth-error').textContent = msg;
}

async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = 'dashboard.html';
}

el('btn-sign-in').addEventListener('click', async () => {
  const email = el('auth-email').value.trim();
  const password = el('auth-password').value;
  if (!email || !password) { showMessage('Preenche o email e a palavra-passe.'); return; }
  showMessage('');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { showMessage(error.message); return; }
  window.location.href = 'dashboard.html';
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
