#!/usr/bin/env node
/**
 * Análise de Jogo — scripts/create-team-logins.mjs
 * Ferramenta de desenvolvimento (não faz parte do site): cria o login de
 * todos os jogadores de uma equipa que ainda não têm um (o mesmo que o
 * botão "Criar login" da tab Plantel faz, um a um) e exporta um CSV local
 * com Nome/Utilizador/Password — o único momento em que a password ainda
 * é conhecida em texto simples (o Supabase nunca a guarda recuperável).
 *
 * Só processa jogadores sem "auth_user_id" — por isso é seguro correr
 * outra vez mais tarde (ex: depois de esbarrar no limite de emails do
 * Supabase): os que já têm login ficam de fora automaticamente.
 *
 * Fala diretamente com a REST API do Supabase via fetch nativo do Node
 * (sem nenhuma dependência nova), tal como os outros scripts em scripts/.
 *
 * Uso:
 *   node scripts/create-team-logins.mjs <email> <password> <join_code> [ficheiro-csv-de-saida]
 *   (ou definir SEED_EMAIL / SEED_PASSWORD no ambiente)
 *
 * Versão: 1.0 (2026-08-06)
 * Histórico:
 *   1.0 (2026-08-06) — criação.
 */

import { writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://ryxoevwixjfmzlzbrbyq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eG9ldndpeGpmbXpsemJyYnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Mzg2NjEsImV4cCI6MjA5OTExNDY2MX0.UrnlqfF79hfSouCqYYZhMMF2HhSGLPsc9ZZnQLTihkQ';

const email = process.argv[2] || process.env.SEED_EMAIL;
const password = process.argv[3] || process.env.SEED_PASSWORD;
const joinCode = process.argv[4];
const outCsv = process.argv[5] || `credenciais-${(joinCode || 'equipa').toUpperCase()}.csv`;

if (!email || !password || !joinCode) {
  console.error('Uso: node scripts/create-team-logins.mjs <email> <password> <join_code> [ficheiro-csv-de-saida]');
  console.error('(ou define SEED_EMAIL / SEED_PASSWORD no ambiente)');
  process.exit(1);
}

let accessToken = null;

async function api(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  if (!text) return null;
  return JSON.parse(text);
}

async function login() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login falhou: ${data.error_description || data.msg || JSON.stringify(data)}`);
  accessToken = data.access_token;
}

// Cria o login em texto simples (endpoint público de signup) — não usa o
// accessToken do treinador, por isso não interfere com a sessão dele.
async function signUp(userEmail, userPassword) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: userPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || JSON.stringify(data));
  return data.id || data.user?.id;
}

function slugifyNome(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'jogador';
}

function randomPassword() {
  return Math.random().toString(36).slice(-8);
}

function generateLoginUsername(nome) {
  const suffix = Math.random().toString(36).slice(-4);
  return `${slugifyNome(nome)}-${suffix}@jogador.app`;
}

function toCsv(rows) {
  const header = 'Nome,Utilizador,Password';
  const linhas = rows.map(r => `${r.nome},${r.username},${r.password}`);
  return [header, ...linhas].join('\n');
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('A entrar...');
  await login();

  console.log(`A procurar a equipa com o código ${joinCode}...`);
  const [team] = await api(`/rest/v1/teams?join_code=eq.${joinCode.toUpperCase()}&select=id,nome`);
  if (!team) throw new Error(`Não encontrei nenhuma equipa com o código ${joinCode}.`);
  console.log(`  Equipa: ${team.nome}`);

  const players = await api(`/rest/v1/players?team_id=eq.${team.id}&auth_user_id=is.null&select=id,nome`);
  if (!players.length) {
    console.log('Todos os jogadores desta equipa já têm login. Nada a fazer.');
    return;
  }
  console.log(`${players.length} jogador(es) sem login. A criar, um a um...`);

  const criados = [];
  for (const p of players) {
    const username = generateLoginUsername(p.nome);
    const pass = randomPassword();
    try {
      const newUserId = await signUp(username, pass);
      await api(`/rest/v1/players?id=eq.${p.id}`, {
        method: 'PATCH',
        body: { auth_user_id: newUserId, login_email: username },
      });
      criados.push({ nome: p.nome, username, password: pass });
      console.log(`  ✔ ${p.nome} -> ${username}`);
    } catch (err) {
      console.error(`  ✘ ${p.nome}: ${err.message}`);
      console.error('  A parar aqui — corre o script outra vez mais tarde para continuar (só falta quem não tem login ainda).');
      break;
    }
    await sleep(2000); // dá tempo ao limite de emails do Supabase, não resolve sozinho um limite muito baixo
  }

  if (criados.length) {
    writeFileSync(outCsv, toCsv(criados), 'utf8');
    console.log(`\n${criados.length} login(s) criado(s). Credenciais guardadas em ${outCsv}.`);
    console.log('Ficheiro só local — tem passwords em texto simples, não o partilhes nem o guardes no git.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
