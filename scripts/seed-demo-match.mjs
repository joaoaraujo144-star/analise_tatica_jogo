#!/usr/bin/env node
/**
 * Análise de Jogo — scripts/seed-demo-match.mjs
 * Ferramenta de desenvolvimento (não faz parte do site): cria uma equipa
 * nova com 25 jogadores, um jogo já terminado (11 titulares + 8 suplentes,
 * alguns cartões amarelos, 1 vermelho, 2 golos com assistência) e preenche
 * os 5 campos do Registo de Jogo com pontos tacticamente plausíveis
 * (cantos perto da bandeirola, remates perto da baliza, cruzamentos nas
 * zonas laterais — sempre a respeitar a orientação de ataque de cada
 * parte, como num jogo a sério) — para servir de demo rápida da app sem
 * preencher tudo manualmente durante 90 minutos.
 *
 * Fala diretamente com a REST API do Supabase via fetch nativo do Node
 * (sem nenhuma dependência nova) — a mesma URL/chave pública já usadas em
 * js/supabase-client.js. Autentica-se com uma conta já existente na app
 * (ex: a conta de teste) e cria a equipa/jogo dentro dela.
 *
 * Uso:
 *   node scripts/seed-demo-match.mjs <email> <password>
 *   (ou definir SEED_EMAIL / SEED_PASSWORD no ambiente, em vez de
 *   passar a palavra-passe como argumento na linha de comandos)
 *
 * Versão: 1.1 (2026-07-15)
 * Histórico:
 *   1.0 (2026-07-15) — criação.
 *   1.1 (2026-07-15) — corrige erro "Unexpected end of JSON input": respostas sem corpo
 *                       (204, ou 201 com Prefer: return=minimal) já não tentam fazer parse.
 */

const SUPABASE_URL = 'https://ryxoevwixjfmzlzbrbyq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eG9ldndpeGpmbXpsemJyYnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Mzg2NjEsImV4cCI6MjA5OTExNDY2MX0.UrnlqfF79hfSouCqYYZhMMF2HhSGLPsc9ZZnQLTihkQ';

const email = process.argv[2] || process.env.SEED_EMAIL;
const password = process.argv[3] || process.env.SEED_PASSWORD;
if (!email || !password) {
  console.error('Uso: node scripts/seed-demo-match.mjs <email> <password>');
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
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  // 204 (sem corpo) ou 201 com "Prefer: return=minimal" vêm sem corpo.
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

// ---------- Helpers aleatórios ----------

function rnd(min, max) { return Math.random() * (max - min) + min; }
function rndInt(min, max) { return Math.floor(rnd(min, max + 1)); }
function pick(arr) { return arr[rndInt(0, arr.length - 1)]; }
function round2(n) { return Math.round(n * 100) / 100; }
function shuffled(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

const PRIMEIROS_NOMES = ['João', 'Pedro', 'Miguel', 'Tiago', 'Rui', 'André', 'Bruno', 'Carlos', 'Diogo', 'Eduardo', 'Filipe', 'Gonçalo', 'Hugo', 'Ivo', 'José', 'Luís', 'Marco', 'Nuno', 'Paulo', 'Ricardo', 'Samuel', 'Tomás', 'Vasco', 'Xavier', 'Zé'];
const APELIDOS = ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Costa', 'Rodrigues', 'Martins', 'Jesus', 'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Alves', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira', 'Moreira'];
function playerName() { return `${pick(PRIMEIROS_NOMES)} ${pick(APELIDOS)}`; }

// ---------- Geometria do campo (ver assets/campo.png, 626×443 — x = comprimento/balizas, y = largura/linhas laterais) ----------

const ORIENTACAO_PARTE1 = 'E-D';
function orientacaoDaParte(parte) {
  if (parte === 1) return ORIENTACAO_PARTE1;
  return ORIENTACAO_PARTE1 === 'E-D' ? 'D-E' : 'E-D';
}
// x da baliza que a equipa ataca / defende nesta parte
function xBalizaAtaque(parte) { return orientacaoDaParte(parte) === 'E-D' ? 100 : 0; }
function xBalizaDefesa(parte) { return orientacaoDaParte(parte) === 'E-D' ? 0 : 100; }
// x a uma distância (%) da baliza-alvo, do lado correto do campo
function distDaBaliza(xBaliza, min, max) {
  const d = rnd(min, max);
  return xBaliza === 100 ? round2(100 - d) : round2(d);
}
function zonaLateral() { return pick([rnd(0, 12), rnd(88, 100)]); }
function zonaBandeirola() { return pick([rnd(0, 6), rnd(94, 100)]); }

async function main() {
  console.log('A entrar...');
  await login();

  console.log('A criar a equipa...');
  const team = await api('/rest/v1/rpc/create_team', { method: 'POST', body: { p_nome: 'Equipa Demo' } });
  console.log(`  Equipa "${team.nome}" criada (código ${team.join_code}).`);

  console.log('A criar 25 jogadores...');
  const usados = new Set();
  const playersPayload = Array.from({ length: 25 }, () => {
    let numero;
    do { numero = String(rndInt(1, 30)); } while (usados.has(numero));
    usados.add(numero);
    return { user_id: userId, team_id: team.id, numero, nome: playerName() };
  });
  const players = await api('/rest/v1/players', { method: 'POST', body: playersPayload, prefer: 'return=representation' });

  console.log('A criar o jogo (já terminado)...');
  const hoje = new Date().toISOString().slice(0, 10);
  const [match] = await api('/rest/v1/matches', {
    method: 'POST',
    prefer: 'return=representation',
    body: [{ user_id: userId, team_id: team.id, adversario: 'FC Adversário', data: hoje, orientacao_parte1: ORIENTACAO_PARTE1 }],
  });
  const now = Date.now();
  await api(`/rest/v1/matches?id=eq.${match.id}`, {
    method: 'PATCH',
    body: {
      parte1_inicio: new Date(now - 100 * 60000).toISOString(),
      parte1_fim: new Date(now - 55 * 60000).toISOString(),
      parte2_inicio: new Date(now - 50 * 60000).toISOString(),
      parte2_fim: new Date(now - 5 * 60000).toISOString(),
    },
  });

  console.log('A convocar 19 jogadores (11 titulares + 8 suplentes)...');
  const embaralhados = shuffled(players);
  const titulares = embaralhados.slice(0, 11);
  const suplentes = embaralhados.slice(11, 19);
  const matchPlayers = await api('/rest/v1/match_players', {
    method: 'POST',
    prefer: 'return=representation',
    body: [
      ...titulares.map(p => ({ user_id: userId, team_id: team.id, match_id: match.id, player_id: p.id, estado: 'Titular' })),
      ...suplentes.map(p => ({ user_id: userId, team_id: team.id, match_id: match.id, player_id: p.id, estado: 'Suplente' })),
    ],
  });
  const titularesMP = matchPlayers.filter(mp => mp.estado === 'Titular');

  console.log('A marcar cartões, golos e assistências...');
  const paraCartoes = shuffled(titularesMP);
  for (const mp of paraCartoes.slice(0, 3)) {
    await api(`/rest/v1/match_players?id=eq.${mp.id}`, { method: 'PATCH', body: { amarelo: 1 } });
  }
  await api(`/rest/v1/match_players?id=eq.${paraCartoes[3].id}`, { method: 'PATCH', body: { vermelho: 1 } });

  const paraGolos = shuffled(titularesMP);
  for (let i = 0; i < 2; i++) {
    await api(`/rest/v1/match_players?id=eq.${paraGolos[i].id}`, { method: 'PATCH', body: { golo: 1 } });
    await api(`/rest/v1/match_players?id=eq.${paraGolos[2 + i].id}`, { method: 'PATCH', body: { assistencias: 1 } });
  }

  console.log('A gerar os cliques do Registo de Jogo (Faltas, Cantos, Cruzamentos, Perdas de Bola, Remates)...');
  const events = [];
  function addEvento(parte, tracker, tipo, x, y) {
    events.push({
      user_id: userId, team_id: team.id, match_id: match.id,
      tracker_id: tracker, parte, tipo,
      minuto: rndInt(0, 45),
      x_pct: clamp(round2(x), 0, 100),
      y_pct: clamp(round2(y), 0, 100),
    });
  }

  [1, 2].forEach(parte => {
    const ataque = xBalizaAtaque(parte);
    const defesa = xBalizaDefesa(parte);

    // Cantos: mesmo junto à bandeirola do lado da baliza correta.
    for (let i = 0; i < rndInt(2, 4); i++) addEvento(parte, 'cantos', 'X', distDaBaliza(ataque, 0, 4), zonaBandeirola());
    for (let i = 0; i < rndInt(1, 3); i++) addEvento(parte, 'cantos', 'Y', distDaBaliza(defesa, 0, 4), zonaBandeirola());

    // Remates: dentro/perto da área, mais central em largura.
    for (let i = 0; i < rndInt(3, 6); i++) addEvento(parte, 'remates', 'X', distDaBaliza(ataque, 2, 22), rnd(25, 75));
    for (let i = 0; i < rndInt(2, 5); i++) addEvento(parte, 'remates', 'Y', distDaBaliza(defesa, 2, 22), rnd(25, 75));

    // Cruzamentos: terço final, mas sempre em zona lateral (perto das linhas).
    for (let i = 0; i < rndInt(2, 5); i++) addEvento(parte, 'cruzamentos', 'X', distDaBaliza(ataque, 5, 25), zonaLateral());
    for (let i = 0; i < rndInt(1, 3); i++) addEvento(parte, 'cruzamentos', 'Y', distDaBaliza(defesa, 5, 25), zonaLateral());

    // Faltas: espalhadas pelo campo todo.
    for (let i = 0; i < rndInt(3, 6); i++) addEvento(parte, 'faltas', 'X', rnd(0, 100), rnd(10, 90));
    for (let i = 0; i < rndInt(3, 6); i++) addEvento(parte, 'faltas', 'Y', rnd(0, 100), rnd(10, 90));

    // Perdas de bola: ganhos mais perto da nossa defesa, perdas mais perto do ataque.
    for (let i = 0; i < rndInt(4, 8); i++) addEvento(parte, 'perdas', 'X', distDaBaliza(defesa, 10, 45), rnd(5, 95));
    for (let i = 0; i < rndInt(4, 8); i++) addEvento(parte, 'perdas', 'Y', distDaBaliza(ataque, 10, 45), rnd(5, 95));
  });

  await api('/rest/v1/events', { method: 'POST', body: events, prefer: 'return=minimal' });

  console.log('\nFeito!');
  console.log(`  Equipa: ${team.nome} (código ${team.join_code})`);
  console.log(`  Jogo: vs ${match.adversario} em ${match.data} — já terminado.`);
  console.log(`  ${events.length} cliques criados nos 5 campos do Registo de Jogo.`);
  console.log('  Abre a app, entra nesta equipa, e vai a Relatórios para veres tudo preenchido.');
}

main().catch(err => { console.error(err); process.exit(1); });
