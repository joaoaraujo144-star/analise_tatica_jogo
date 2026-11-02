#!/usr/bin/env node
/**
 * Análise de Jogo — whatsapp-bot/index.mjs
 * Bot local (não-oficial, fora do site e do deploy) que liga a uma sessão
 * pessoal de WhatsApp (via Baileys) e posta no grupo da equipa, às 10h e
 * 12h30 (hora de Lisboa), quantos jogadores já responderam ao Wellness
 * de hoje — ver whatsapp-bot/README.md para a configuração.
 *
 * Fica ligado indefinidamente (não desliga entre envios) — reconectar com
 * frequência é mais suspeito para a deteção de automação do WhatsApp do
 * que manter uma sessão estável. A hora exata é verificada a cada minuto
 * dentro do próprio processo, em "Europe/Lisbon" (não UTC), para não
 * desviar na mudança de hora de verão/inverno — mesmo padrão já usado no
 * pg_cron da app principal (ver supabase/migrations/029_trial_mode.sql).
 *
 * Uso:
 *   node --env-file=.env index.mjs          corre indefinidamente
 *   node --env-file=.env index.mjs --now    envia um resumo de teste já, e sai
 *
 * HORAS_ENVIO (opcional, no .env) substitui as horas por omissão
 * ("10:00,12:30") — útil para testar o agendamento real (correr sem
 * --now e esperar pelos minutos certos) sem mexer no código, ex:
 * HORAS_ENVIO=12:35,12:36
 *
 * Versão: 1.8 (2026-10-29)
 * Histórico:
 *   1.0 (2026-10-10) — criação.
 *   1.1 (2026-10-10) — HORAS_ENVIO configurável via .env, para testar o
 *                       agendamento (não só o --now) sem editar o código.
 *   1.2 (2026-10-12) — corrige envio das 12h de 2026-10-11 nunca ter saído:
 *                       a ligação ao WhatsApp ficou "zombie" (não fechou
 *                       formalmente, só parou de responder) e
 *                       sock.sendMessage() ficou pendurado indefinidamente,
 *                       sem erro nenhum a aparecer no log. Agora o envio
 *                       tem um limite de 20s; se expirar, força o fim da
 *                       ligação (sock.end()) para desencadear a reconexão
 *                       automática já existente, espera por ela, e tenta
 *                       outra vez — só desiste (com erro bem visível no
 *                       log) se a 2ª tentativa também falhar.
 *   1.3 (2026-10-12) — markOnlineOnConnect: false — por omissão o Baileys
 *                       marca a conta como "online" permanentemente
 *                       enquanto o bot está ligado, o que impedia o
 *                       telemóvel de receber notificações push (o
 *                       WhatsApp já via a conta "presente" aqui).
 *   1.4 (2026-10-23) — corrige envio das 10h de 2026-10-23 nunca ter
 *                       saído nem dado erro: um soluço de rede (visível
 *                       nos logs como o WhatsApp a cair/religar várias
 *                       vezes seguidas nessa janela) deixou os pedidos ao
 *                       Supabase (contarRespostasHoje/loginSupabase)
 *                       pendurados para sempre — fetch() nativo não tem
 *                       timeout nenhum por omissão. Agora todos os
 *                       pedidos ao Supabase têm um limite de 20s
 *                       (fetchComTimeout, via AbortController), e o envio
 *                       agendado como um todo (contagem + WhatsApp) tenta
 *                       outra vez 30s depois se falhar à 1ª.
 *   1.5 (2026-10-26) — envio das 10h de 2026-10-25 falhou outra vez, desta
 *                       vez sem NENHUM erro registado (nem a 1ª nem a 2ª
 *                       tentativa), apesar das proteções de 1.4 — sinal de
 *                       que algo escapou mesmo aos timeouts (suspeita:
 *                       laço de eventos ocupado durante uma instabilidade
 *                       de rede com 5+ reconexões em 50 minutos). Não foi
 *                       possível confirmar a causa exata pelos logs
 *                       existentes, por isso ficam dois registos novos
 *                       para a próxima vez: "A tentar enviar..." no
 *                       início de cada tentativa (para saber se sequer
 *                       chegou a arrancar) e um heartbeat a cada 10 min
 *                       (para ver se o próprio relógio de 60s chegou a
 *                       parar de bater).
 *   1.6 (2026-10-26) — confirmado ao vivo: o heartbeat parou de bater às
 *                       10h de hoje mesmo (gap de ~4 min sem NENHUM
 *                       registo) e o processo estava a 0% CPU (bloqueado
 *                       à espera, não preso num ciclo) — a coincidir com
 *                       rajadas de "failed to decrypt message". shouldIgnoreJid
 *                       (Baileys) faz o bot ignorar toda a atividade de
 *                       WhatsApp que não seja o grupo da equipa — o bot só
 *                       envia, nunca precisa de ler nada, por isso não há
 *                       razão para gastar tempo a desencriptar o resto dos
 *                       chats/grupos pessoais da conta ligada.
 *   1.7 (2026-10-29) — envio das 10h de 2026-10-28 falhou outra vez: desta
 *                       vez sem rajadas de "failed to decrypt" (a correção
 *                       de 1.6 resultou para essa causa), mas com 10
 *                       quedas/reconexões seguidas da ligação em 2h20 —
 *                       instabilidade bem mais severa que nas vezes
 *                       anteriores — durante a qual o heartbeat ficou
 *                       calado o tempo todo. Em vez de continuar a
 *                       perseguir causas uma a uma, muda de estratégia
 *                       para uma rede de segurança: (1) a versão do
 *                       WhatsApp Web deixa de ser pedida à rede em cada
 *                       reconexão (guardada uma vez só, no 1º connect);
 *                       (2) o agendamento ganha uma janela de tolerância
 *                       de 15 min — tenta enviar até 15 min depois da hora
 *                       exata, em vez de só no minuto certo; (3) novo
 *                       watchdog.sh, a correr via launchd a cada 2 min,
 *                       mata o processo principal se bot.log ficar sem
 *                       atualizações por mais de 4 min (o launchd do
 *                       processo principal, KeepAlive: true, reinicia-o
 *                       sozinho a seguir) — garante um limite ao atraso
 *                       máximo independentemente da causa exata.
 *   1.8 (2026-10-29) — corrige 3 envios da mesma hora no mesmo dia: o
 *                       watchdog (4 min) matava o processo antes do
 *                       heartbeat seguinte (10 min) sequer chegar — um
 *                       processo saudável, nunca preso — a cada ~6 min, a
 *                       noite toda (confirmado em watchdog.log: 90+
 *                       mortes desde a meia-noite). Cada reinício
 *                       esquecia-se de que já tinha enviado hoje (só
 *                       vivia em memória) e, ainda dentro da janela de
 *                       tolerância de 15 min, enviava outra vez. Corrige
 *                       os dois lados: heartbeat passa a 3 em 3 min
 *                       (watchdog.sh sobe para 10 min — ver changelog
 *                       próprio), e "já enviei hoje" passa a ficar
 *                       gravado em estado.json, não só em memória — um
 *                       reinício dentro da janela de tolerância, por
 *                       qualquer razão, deixa de poder duplicar o envio.
 */

import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { readFileSync, writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://ryxoevwixjfmzlzbrbyq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eG9ldndpeGpmbXpsemJyYnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Mzg2NjEsImV4cCI6MjA5OTExNDY2MX0.UrnlqfF79hfSouCqYYZhMMF2HhSGLPsc9ZZnQLTihkQ';

const { SUPABASE_EMAIL, SUPABASE_PASSWORD, TEAM_ID, WHATSAPP_GROUP_JID, HORAS_ENVIO } = process.env;
const HORAS = (HORAS_ENVIO || '10:00,12:30').split(',').map((h) => h.trim());

// Só valida depois de ligar ao WhatsApp (mais abaixo) — a 1ª vez que se
// corre este script ainda não há .env nenhum preenchido, e é preciso
// ligar primeiro para sequer conseguir descobrir o JID do grupo
// (npm run list-groups) a pôr nele.
function validarEnv() {
  for (const [nome, valor] of Object.entries({ SUPABASE_EMAIL, SUPABASE_PASSWORD, TEAM_ID, WHATSAPP_GROUP_JID })) {
    if (!valor) {
      console.error(`Falta "${nome}" no .env — copia .env.example para .env e preenche (ver README.md).`);
      process.exit(1);
    }
  }
}

const TEST_NOW = process.argv.includes('--now');

// ---------- Supabase (REST, mesmo padrão de scripts/seed-demo-match.mjs) ----------

// fetch() nativo não tem limite de tempo nenhum por omissão — um soluço de
// rede (como o que já vimos acontecer à ligação do WhatsApp) deixa o
// pedido pendurado para sempre, sem erro nenhum a aparecer no log (foi o
// que se passou ao envio das 10h de 2026-10-23). Mesmo princípio do
// timeout já usado no envio do WhatsApp (ver enviarComTimeout).
async function fetchComTimeout(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Timeout (${timeoutMs / 1000}s) a contactar o Supabase: ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function loginSupabase() {
  const res = await fetchComTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SUPABASE_EMAIL, password: SUPABASE_PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login Supabase falhou: ${data.error_description || data.msg || JSON.stringify(data)}`);
  return data.access_token;
}

async function contarRespostasHoje() {
  const accessToken = await loginSupabase();
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` };
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });

  const [resPlayers, resRespostas] = await Promise.all([
    fetchComTimeout(`${SUPABASE_URL}/rest/v1/players?team_id=eq.${TEAM_ID}&select=id`, { headers }),
    fetchComTimeout(`${SUPABASE_URL}/rest/v1/wellness_responses?team_id=eq.${TEAM_ID}&data=eq.${hoje}&select=player_id`, { headers }),
  ]);
  if (!resPlayers.ok) throw new Error(`Players: ${resPlayers.status} ${await resPlayers.text()}`);
  if (!resRespostas.ok) throw new Error(`Wellness: ${resRespostas.status} ${await resRespostas.text()}`);

  const players = await resPlayers.json();
  const respostas = await resRespostas.json();
  return { respondidos: respostas.length, total: players.length };
}

// ---------- WhatsApp (Baileys) ----------

let sock;
let resolveConectado;
let conectado;

// Cria uma nova promessa de "próxima ligação estabelecida" — usada no
// arranque e sempre que forçamos uma reconexão (ver enviarComRetry).
// Tem de ser chamada ANTES de sock.end()/connectWhatsapp(), nunca depois
// (senão corre-se o risco de apanhar o resolve de uma ligação antiga já
// resolvida, e o await seguinte não esperaria mesmo pela ligação nova).
function novaPromessaConexao() {
  conectado = new Promise((resolve) => { resolveConectado = resolve; });
  return conectado;
}
novaPromessaConexao();

let waVersion; // guardada uma vez (abaixo) — evita um pedido à rede em cada reconexão

async function connectWhatsapp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  if (!waVersion) {
    ({ version: waVersion } = await fetchLatestBaileysVersion());
  }
  const version = waVersion;
  // markOnlineOnConnect: false — por omissão o Baileys marca a conta como
  // "online" permanentemente enquanto este bot está ligado, o que faz o
  // WhatsApp deixar de mandar notificação push ao telemóvel (ele já se
  // vê "presente" aqui). Isto mantém o telemóvel a notificar normalmente.
  //
  // shouldIgnoreJid — o bot só precisa de ENVIAR para o grupo da equipa,
  // nunca de ler nada. Sem isto, o Baileys desencripta e processa também
  // todo o resto da atividade pessoal de WhatsApp da conta ligada (outros
  // chats, outros grupos) — suspeito de ter bloqueado o processo (0% CPU,
  // sem reagir a nada) exatamente na janela das 10h de 2026-10-26,
  // coincidindo com rajadas de "failed to decrypt message" vindas de
  // outras conversas, não do grupo da equipa.
  sock = makeWASocket({
    version,
    auth: state,
    markOnlineOnConnect: false,
    shouldIgnoreJid: (jid) => jid !== WHATSAPP_GROUP_JID,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\nLê este QR code com o WhatsApp (Definições → Dispositivos ligados → Ligar dispositivo):\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log('Ligado ao WhatsApp.');
      resolveConectado();
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const terminouSessao = statusCode === DisconnectReason.loggedOut;
      if (terminouSessao) {
        console.error('Sessão terminada a partir do telemóvel — apaga a pasta auth/ e corre outra vez para ligar de novo.');
        process.exit(1);
      }
      console.log('Ligação fechada, a tentar religar em 5s...');
      setTimeout(connectWhatsapp, 5000);
    }
  });
}

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A ligação do WhatsApp pode ficar "zombie" (não fecha formalmente, só
// para de responder) sem o Baileys dar por isso durante muito tempo — foi
// o que aconteceu ao envio das 12h de 2026-10-11, que ficou pendurado em
// sock.sendMessage() sem nunca lançar erro. Por isso o envio tem sempre
// um limite de tempo próprio, em vez de confiar só na deteção do Baileys.
async function enviarComTimeout(texto, timeoutMs = 20_000) {
  await Promise.race([
    sock.sendMessage(WHATSAPP_GROUP_JID, { text: texto }),
    aguardar(timeoutMs).then(() => { throw new Error(`Timeout (${timeoutMs / 1000}s) a enviar a mensagem — ligação pode estar parada.`); }),
  ]);
}

async function enviarComRetry(texto) {
  try {
    await enviarComTimeout(texto);
    return;
  } catch (err) {
    console.error(`Falha ao enviar (1ª tentativa): ${err.message} — a forçar reconexão e tentar outra vez...`);
  }

  const proximaLigacao = novaPromessaConexao();
  sock.end(new Error('watchdog: envio pendurado, a forçar reconexão'));
  await Promise.race([proximaLigacao, aguardar(30_000)]); // segue em frente mesmo que a reconexão ainda não tenha confirmado — a 2ª tentativa falha com um erro claro se mesmo assim não estiver pronta
  await enviarComTimeout(texto, 20_000);
}

async function enviarResumo(hhmm) {
  const { respondidos, total } = await contarRespostasHoje();
  const saudacao = hhmm === '10:00' ? 'Bom dia' : 'Boa tarde';
  const texto = `🤖 ${saudacao}, ${respondidos} de ${total} jogador(es) já responderam ao Wellness de hoje.\n_(mensagem automática)_`;
  await enviarComRetry(texto);
  console.log(`[${new Date().toISOString()}] Enviado: "${texto}"`);
}

// ---------- Agendamento (verifica a hora de Lisboa a cada minuto) ----------

function horaAgoraEmLisboa() {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hour12: false });
}

function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Se o processo atrasar por qualquer razão (reconexão, o watchdog externo
// a matá-lo e reiniciá-lo, etc. — ver watchdog.sh), ainda assim tenta
// enviar até 15 min depois da hora exata, em vez de desistir do dia só
// por ter perdido o minuto certo (foi o que aconteceu em 2026-10-25/28,
// sem o processo sequer ter crashado).
const JANELA_TOLERANCIA_MIN = 15;

// Persistido em disco (não só em memória) — sem isto, um reinício dentro
// da janela de tolerância acima (ex: o watchdog a matar o processo)
// esquece-se de que já tinha enviado hoje e envia OUTRA VEZ (foi
// exatamente o que aconteceu em 2026-10-29: 3 envios da mesma hora,
// um por cada reinício do watchdog).
const ESTADO_PATH = new URL('./estado.json', import.meta.url);

function carregarEnviadosHoje() {
  try {
    const estado = JSON.parse(readFileSync(ESTADO_PATH, 'utf8'));
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
    if (estado.data === hoje) return new Set(estado.enviados);
  } catch {
    // ainda não existe, ou é de um dia anterior — começa vazio
  }
  return new Set();
}

function gravarEnviadosHoje() {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
  const enviadosDeHoje = [...enviadosHoje].filter((c) => c.startsWith(hoje));
  writeFileSync(ESTADO_PATH, JSON.stringify({ data: hoje, enviados: enviadosDeHoje }));
}

const enviadosHoje = carregarEnviadosHoje(); // "AAAA-MM-DD HH:MM" dos alvos já despachados hoje
let ticks = 0; // só para o heartbeat abaixo

function agendar() {
  setInterval(async () => {
    ticks++;
    // Heartbeat a cada 3 min — tem de ser claramente mais frequente do
    // que o limite do watchdog.sh (10 min), senão o watchdog mata um
    // processo perfeitamente saudável só por ainda não ter chegado o
    // próximo heartbeat (foi exatamente o engano de 2026-10-29: 4 min de
    // limite contra 10 min de heartbeat, matava sempre antes de tempo).
    if (ticks % 3 === 0) console.log(`[${new Date().toISOString()}] heartbeat (hora Lisboa: ${horaAgoraEmLisboa()})`);

    const hojeLisboa = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
    const agoraMin = paraMinutos(horaAgoraEmLisboa());

    for (const alvo of HORAS) {
      const chave = `${hojeLisboa} ${alvo}`;
      if (enviadosHoje.has(chave)) continue;
      const alvoMin = paraMinutos(alvo);
      if (agoraMin < alvoMin || agoraMin > alvoMin + JANELA_TOLERANCIA_MIN) continue;

      enviadosHoje.add(chave); // marca já, mesmo antes de saber se corre bem — nunca duas tentativas em paralelo para o mesmo alvo
      gravarEnviadosHoje();
      console.log(`[${new Date().toISOString()}] A tentar enviar o resumo das ${alvo}...`);
      try {
        await enviarResumo(alvo);
      } catch (err) {
        console.error(`Falha a enviar o resumo das ${alvo} (1ª tentativa): ${err.message} — a tentar outra vez em 30s...`);
        await aguardar(30_000);
        try {
          await enviarResumo(alvo);
        } catch (err2) {
          console.error(`Falha a enviar o resumo das ${alvo} (2ª tentativa, a desistir):`, err2);
        }
      }
    }
  }, 60 * 1000);
}

// ---------- Arranque ----------

await connectWhatsapp();
await conectado;
validarEnv();

if (TEST_NOW) {
  const hhmm = HORAS.includes(horaAgoraEmLisboa()) ? horaAgoraEmLisboa() : HORAS[0];
  await enviarResumo(hhmm);
  process.exit(0);
} else {
  agendar();
  console.log(`A correr — vai verificar a hora a cada minuto e enviar às ${HORAS.join('/')} (Europe/Lisbon).`);
}
