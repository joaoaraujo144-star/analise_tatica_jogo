#!/usr/bin/env node
/**
 * Análise de Jogo — scripts/import-plantel.mjs
 * Ferramenta de desenvolvimento (não faz parte do site): cria uma equipa
 * nova e importa o plantel a partir de um CSV com as colunas
 * "Nome;Alcunha;Data de Nascimento" (datas em dd-mm-aaaa) — pensado para
 * docs/plantel_adc_sanguedo_2026_2027.csv, mas aceita qualquer CSV com o
 * mesmo formato.
 *
 * A alcunha não tem coluna própria na base de dados (só existe "nome"),
 * por isso fica guardada como "Nome (Alcunha)" — editável depois na tab
 * Plantel, tal como qualquer jogador adicionado à mão.
 *
 * Fala diretamente com a REST API do Supabase via fetch nativo do Node
 * (sem nenhuma dependência nova), tal como scripts/seed-demo-match.mjs.
 *
 * Uso:
 *   node scripts/import-plantel.mjs <email> <password> [caminho-do-csv] [nome-da-equipa]
 *   (ou definir SEED_EMAIL / SEED_PASSWORD no ambiente, em vez de passar
 *   a palavra-passe como argumento na linha de comandos)
 *
 * Versão: 1.0 (2026-08-06)
 * Histórico:
 *   1.0 (2026-08-06) — criação.
 */

import { readFileSync } from 'node:fs';

const SUPABASE_URL = 'https://ryxoevwixjfmzlzbrbyq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eG9ldndpeGpmbXpsemJyYnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Mzg2NjEsImV4cCI6MjA5OTExNDY2MX0.UrnlqfF79hfSouCqYYZhMMF2HhSGLPsc9ZZnQLTihkQ';

const email = process.argv[2] || process.env.SEED_EMAIL;
const password = process.argv[3] || process.env.SEED_PASSWORD;
const csvPath = process.argv[4] || 'docs/plantel_adc_sanguedo_2026_2027.csv';
const teamName = process.argv[5] || 'ADC Sanguedo 2026-2027';

if (!email || !password) {
  console.error('Uso: node scripts/import-plantel.mjs <email> <password> [csv] [nome-da-equipa]');
  console.error('(ou define SEED_EMAIL / SEED_PASSWORD no ambiente)');
  process.exit(1);
}

let accessToken = null;
let userId = null;

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
  userId = data.user.id;
}

// "30-05-2006" -> "2006-05-30" (formato aceite pela coluna "date" do Postgres).
function parseDataNascimento(str) {
  const [dia, mes, ano] = str.trim().split('-');
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function parseCsv(text) {
  const linhas = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const [, ...linhasDados] = linhas; // a 1ª linha é o cabeçalho, ignora-se
  return linhasDados.map(linha => {
    const [nome, alcunha, dataNascimento] = linha.split(';').map(c => c.trim());
    return { nome, alcunha, dataNascimento: parseDataNascimento(dataNascimento) };
  });
}

async function main() {
  const jogadores = parseCsv(readFileSync(csvPath, 'utf8'));
  console.log(`${jogadores.length} jogadores encontrados em ${csvPath}.`);

  console.log('A entrar...');
  await login();

  console.log(`A criar a equipa "${teamName}"...`);
  const team = await api('/rest/v1/rpc/create_team', { method: 'POST', body: { p_nome: teamName } });
  console.log(`  Equipa criada (código ${team.join_code}).`);

  console.log('A adicionar os jogadores ao plantel...');
  const payload = jogadores.map(j => ({
    user_id: userId,
    team_id: team.id,
    nome: j.alcunha ? `${j.nome} (${j.alcunha})` : j.nome,
    data_nascimento: j.dataNascimento,
  }));
  await api('/rest/v1/players', { method: 'POST', body: payload, prefer: 'return=minimal' });

  console.log('\nFeito!');
  console.log(`  Equipa: ${team.nome} (código ${team.join_code})`);
  console.log(`  ${jogadores.length} jogadores adicionados ao plantel.`);
  console.log('  Abre a app, entra nesta equipa, e vai a Plantel para conferir.');
}

main().catch(err => { console.error(err); process.exit(1); });
