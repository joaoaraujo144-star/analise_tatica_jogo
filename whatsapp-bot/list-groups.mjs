#!/usr/bin/env node
/**
 * Análise de Jogo — whatsapp-bot/list-groups.mjs
 * Ferramenta auxiliar: liga à sessão de WhatsApp já guardada em auth/
 * (criada ao correr index.mjs pela 1ª vez) e lista nome + JID de cada
 * grupo — corre-se uma vez, para copiar o JID certo para
 * WHATSAPP_GROUP_JID no .env.
 *
 * Uso: node list-groups.mjs
 *
 * Versão: 1.0 (2026-10-10)
 */

import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

const { state, saveCreds } = await useMultiFileAuthState('auth');
const sock = makeWASocket({ auth: state, markOnlineOnConnect: false });
sock.ev.on('creds.update', saveCreds);

sock.ev.on('connection.update', async ({ connection, qr }) => {
  if (qr) {
    console.log('\nAinda não há sessão guardada — lê este QR code com o WhatsApp primeiro:\n');
    qrcode.generate(qr, { small: true });
    return;
  }
  if (connection !== 'open') return;

  const grupos = await sock.groupFetchAllParticipating();
  const lista = Object.values(grupos);
  if (lista.length === 0) {
    console.log('Esta conta não está em nenhum grupo de WhatsApp.');
  } else {
    console.log('\nGrupos encontrados:\n');
    for (const g of lista) console.log(`${g.subject}\n  JID: ${g.id}\n`);
  }
  process.exit(0);
});
