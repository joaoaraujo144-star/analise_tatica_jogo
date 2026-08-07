#!/usr/bin/env node
/**
 * Análise de Jogo — scripts/seed-wellness.mjs
 * Ferramenta de desenvolvimento (não faz parte do site): gera vários dias
 * de respostas de wellness de teste para um jogador (equipa e jogador
 * encontrados por nome, aproximado) — para testar os gráficos de
 * pages/wellness-jogador.html sem esperar dias reais.
 *
 * Precisa da policy "wellness_team_member_insert" (migração 018) —
 * corre-a primeiro se ainda não o fizeste.
 *
 * Fala diretamente com a REST API do Supabase via fetch nativo do Node
 * (sem nenhuma dependência nova), tal como os outros scripts em scripts/.
 *
 * Uso:
 *   node scripts/seed-wellness.mjs <email> <password> <nome-da-equipa> <nome-do-jogador> [dias]
 *   (ou definir SEED_EMAIL / SEED_PASSWORD no ambiente)
 *
 * Versão: 1.0 (2026-08-07)
 * Histórico:
 *   1.0 (2026-08-07) — criação.
 */

const SUPABASE_URL = 'https://ryxoevwixjfmzlzbrbyq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eG9ldndpeGpmbXpsemJyYnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Mzg2NjEsImV4cCI6MjA5OTExNDY2MX0.UrnlqfF79hfSouCqYYZhMMF2HhSGLPsc9ZZnQLTihkQ';

const email = process.argv[2] || process.env.SEED_EMAIL;
const password = process.argv[3] || process.env.SEED_PASSWORD;
const teamNome = process.argv[4];
const playerNome = process.argv[5];
const dias = Number(process.argv[6] || 35);

if (!email || !password || !teamNome || !playerNome) {
  console.error('Uso: node scripts/seed-wellness.mjs <email> <password> <nome-da-equipa> <nome-do-jogador> [dias]');
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

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('A entrar...');
  await login();

  console.log(`A procurar a equipa "${teamNome}"...`);
  const teams = await api(`/rest/v1/teams?nome=ilike.*${encodeURIComponent(teamNome)}*&select=id,nome`);
  if (!teams.length) throw new Error(`Não encontrei nenhuma equipa parecida com "${teamNome}".`);
  const team = teams[0];
  console.log(`  Equipa: ${team.nome}`);

  console.log(`A procurar o jogador "${playerNome}"...`);
  const players = await api(`/rest/v1/players?team_id=eq.${team.id}&nome=ilike.*${encodeURIComponent(playerNome)}*&select=id,nome`);
  if (!players.length) throw new Error(`Não encontrei nenhum jogador parecido com "${playerNome}" em "${team.nome}".`);
  const player = players[0];
  console.log(`  Jogador: ${player.nome}`);

  console.log(`A gerar até ${dias} dias de wellness (alguns dias ficam sem resposta, de propósito)...`);
  let criados = 0;
  let pesoBase = randomInt(70, 85);
  for (let i = 0; i < dias; i++) {
    if (Math.random() < 0.18) continue; // simula dias em que o jogador não respondeu
    const data = isoDaysAgo(i);
    const temPeso = Math.random() < 0.5; // o peso é opcional, nem sempre é preenchido
    pesoBase += (Math.random() - 0.5) * 0.6;
    const row = {
      team_id: team.id,
      player_id: player.id,
      data,
      dores_musculares: randomInt(0, 10),
      stress: randomInt(0, 10),
      fadiga: randomInt(0, 10),
      sono: randomInt(0, 10),
      peso: temPeso ? Math.round(pesoBase * 10) / 10 : null,
    };
    try {
      await api('/rest/v1/wellness_responses', { method: 'POST', body: row, prefer: 'return=minimal' });
      criados++;
    } catch (err) {
      if (!String(err.message).includes('duplicate key')) console.error(`  ✘ ${data}: ${err.message}`);
    }
  }

  console.log(`\nFeito! ${criados} respostas criadas para ${player.nome} (${team.nome}).`);
}

main().catch(err => { console.error(err); process.exit(1); });
