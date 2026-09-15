/**
 * Análise de Jogo — calendario-jogos.js
 * Lógica de pages/calendario-jogos.html: calendário do campeonato (Zona
 * Norte 2026-2027), uma jornada de cada vez, com popups para gerir os
 * links de vídeo (vários por jogo) e o link do ZeroZero (um só) de cada
 * jogo.
 *
 * Página sem login: em vez de auth.signIn, valida um código de acesso via
 * RPC — as tabelas por trás (competition_matches/competition_match_videos/
 * competition_access) não têm nenhuma policy de RLS, só as funções abaixo
 * (SECURITY DEFINER) lhes tocam, depois de confirmarem o código. Ver
 * supabase/migrations/027_competition_calendar.sql e
 * supabase/migrations/028_competition_video_links.sql.
 *
 * Versão: 2.1 (2026-09-15)
 * Histórico:
 *   1.0 (2026-09-15) — criação: tabela única com todos os jogos + filtro,
 *                       um input de vídeo e um de ZeroZero por linha.
 *   2.0 (2026-09-15) — redesenho: mostra uma jornada de cada vez (por
 *                       omissão a mais próxima da data atual, com ‹ ›/
 *                       select para mudar), e os links passam a ser
 *                       geridos num popup por jogo (mesmo padrão visual de
 *                       ".goal-overlay"/".goal-popup" em match.js) — o de
 *                       vídeo aceita vários links, o do ZeroZero só um.
 *   2.1 (2026-09-15) — filtro por equipa (mostra todos os jogos dessa
 *                       equipa na época, em vez de uma jornada só); setas
 *                       passam para a sua própria linha, por cima dos
 *                       filtros; coluna "Jornada" de volta à tabela.
 */

import { supabase } from './supabase-client.js';

const CODE_STORAGE_KEY = 'competition_access_code';
const TOTAL_JORNADAS = 26;

let accessCode = localStorage.getItem(CODE_STORAGE_KEY) || '';
let matchesCache = [];
let videosCache = []; // { id, match_id, url, created_at }
let jornadaAtual = 1;
let equipaFiltro = ''; // '' = sem filtro (modo jornada); senão, nome exato da equipa
let linkPopupEl = null;
let linkPopupOutsideHandler = null;

function el(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatData(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

// ---------- Entrar (código de acesso) ----------

async function tentarEntrar(code) {
  const [matchesRes, videosRes] = await Promise.all([
    supabase.rpc('competition_list_matches', { p_code: code }),
    supabase.rpc('competition_list_videos', { p_code: code }),
  ]);
  if (matchesRes.error || videosRes.error) {
    el('code-error').textContent = 'Código inválido.';
    return false;
  }
  accessCode = code;
  localStorage.setItem(CODE_STORAGE_KEY, code);
  matchesCache = matchesRes.data || [];
  videosCache = videosRes.data || [];
  el('code-screen').hidden = true;
  el('calendar-screen').hidden = false;
  popularSeletorJornadas();
  popularFiltroEquipas();
  jornadaAtual = jornadaMaisProximaDeHoje();
  renderView();
  return true;
}

function wireCodeScreen() {
  el('btn-enter-code').addEventListener('click', () => {
    const code = el('access-code').value.trim();
    if (!code) return;
    tentarEntrar(code);
  });
  el('access-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('btn-enter-code').click();
  });
}

// ---------- Navegação por jornada / filtro por equipa ----------

function popularSeletorJornadas() {
  const select = el('jornada-select');
  select.innerHTML = '';
  for (let j = 1; j <= TOTAL_JORNADAS; j++) {
    const opt = document.createElement('option');
    opt.value = String(j);
    opt.textContent = `Jornada ${j}`;
    select.appendChild(opt);
  }
}

function popularFiltroEquipas() {
  const equipas = Array.from(new Set(matchesCache.flatMap(m => [m.equipa_casa, m.equipa_fora]))).sort((a, b) => a.localeCompare(b));
  const select = el('filtro-equipa');
  select.innerHTML = '<option value="">Todas as equipas</option>' +
    equipas.map(eq => `<option value="${escapeHtml(eq)}">${escapeHtml(eq)}</option>`).join('');
}

// Data "típica" de uma jornada (a maioria dos jogos joga-se no mesmo
// fim de semana; usa a data mais frequente para ignorar os 1-2 jogos
// antecipados para sábado).
function dataTipicaDaJornada(jornada) {
  const jogos = matchesCache.filter(m => m.jornada === jornada);
  if (!jogos.length) return null;
  const contagem = new Map();
  jogos.forEach(m => contagem.set(m.data, (contagem.get(m.data) || 0) + 1));
  let melhor = null, melhorContagem = -1;
  contagem.forEach((count, data) => {
    if (count > melhorContagem) { melhor = data; melhorContagem = count; }
  });
  return melhor;
}

function jornadaMaisProximaDeHoje() {
  const hoje = new Date();
  let melhorJornada = 1;
  let melhorDiff = Infinity;
  for (let j = 1; j <= TOTAL_JORNADAS; j++) {
    const data = dataTipicaDaJornada(j);
    if (!data) continue;
    const diff = Math.abs(new Date(data) - hoje);
    if (diff < melhorDiff) { melhorDiff = diff; melhorJornada = j; }
  }
  return melhorJornada;
}

function irParaJornada(jornada) {
  jornadaAtual = Math.min(TOTAL_JORNADAS, Math.max(1, jornada));
  renderView();
}

function wireJornadaNav() {
  el('btn-jornada-prev').addEventListener('click', () => irParaJornada(jornadaAtual - 1));
  el('btn-jornada-next').addEventListener('click', () => irParaJornada(jornadaAtual + 1));
  el('jornada-select').addEventListener('change', (e) => irParaJornada(Number(e.target.value)));
  el('filtro-equipa').addEventListener('change', (e) => {
    equipaFiltro = e.target.value;
    renderView();
  });
}

// ---------- Tabela da jornada atual ----------

function videosDoJogo(matchId) {
  return videosCache.filter(v => v.match_id === matchId);
}

function videoCellHtml(match) {
  const links = videosDoJogo(match.id);
  const abrirBtns = links.map(v =>
    `<a href="${escapeHtml(v.url)}" target="_blank" rel="noopener" class="link-open-btn" title="${escapeHtml(v.url)}">▶</a>`
  ).join('');
  return `<div class="link-cell">
    ${abrirBtns}
    <button type="button" class="action link-manage-btn" data-action="manage-video" data-id="${match.id}">
      ${links.length ? 'Gerir' : '+ Vídeo'}
    </button>
  </div>`;
}

function zerozeroCellHtml(match) {
  const abrirBtn = match.zerozero_url
    ? `<a href="${escapeHtml(match.zerozero_url)}" target="_blank" rel="noopener" class="link-open-btn" title="${escapeHtml(match.zerozero_url)}">↗</a>`
    : '';
  return `<div class="link-cell">
    ${abrirBtn}
    <button type="button" class="action link-manage-btn" data-action="manage-zerozero" data-id="${match.id}">
      ${match.zerozero_url ? 'Editar' : '+ Link'}
    </button>
  </div>`;
}

function renderView() {
  el('jornada-select').value = String(jornadaAtual);
  el('filtro-equipa').value = equipaFiltro;

  const emModoEquipa = equipaFiltro !== '';
  el('btn-jornada-prev').disabled = emModoEquipa || jornadaAtual <= 1;
  el('btn-jornada-next').disabled = emModoEquipa || jornadaAtual >= TOTAL_JORNADAS;
  el('jornada-select').disabled = emModoEquipa;

  let jogos;
  if (emModoEquipa) {
    el('jornada-titulo').textContent = equipaFiltro;
    el('jornada-data').textContent = 'todos os jogos da época';
    jogos = matchesCache.filter(m => m.equipa_casa === equipaFiltro || m.equipa_fora === equipaFiltro);
  } else {
    el('jornada-titulo').textContent = `Jornada ${jornadaAtual}`;
    const dataTipica = dataTipicaDaJornada(jornadaAtual);
    el('jornada-data').textContent = dataTipica ? formatData(dataTipica) : '';
    jogos = matchesCache.filter(m => m.jornada === jornadaAtual);
  }
  jogos = [...jogos].sort((a, b) => a.jornada - b.jornada || (a.data + a.hora).localeCompare(b.data + b.hora));

  const body = el('matches-body');
  body.innerHTML = '';
  jogos.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.jornada}</td>
      <td>${formatData(m.data)}</td>
      <td>${escapeHtml(m.equipa_casa)}</td>
      <td>${escapeHtml(m.equipa_fora)}</td>
      <td>${videoCellHtml(m)}</td>
      <td>${zerozeroCellHtml(m)}</td>
    `;
    body.appendChild(tr);
  });
}

// ---------- Popup de links (mesmo padrão de .goal-overlay/.goal-popup) ----------

function closeLinkPopup() {
  if (linkPopupEl) { linkPopupEl.remove(); linkPopupEl = null; }
  if (linkPopupOutsideHandler) {
    document.removeEventListener('pointerdown', linkPopupOutsideHandler, true);
    linkPopupOutsideHandler = null;
  }
}

function openPopup(innerHtml) {
  closeLinkPopup();
  const overlay = document.createElement('div');
  overlay.className = 'link-overlay';
  overlay.innerHTML = `<div class="link-popup">${innerHtml}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLinkPopup(); });
  linkPopupEl = overlay;
  return overlay;
}

function jogoLabel(match) {
  return `${match.equipa_casa} vs ${match.equipa_fora}`;
}

function openVideoPopup(match) {
  const overlay = openPopup(`
    <div class="link-popup-title">Vídeo — ${escapeHtml(jogoLabel(match))}</div>
    <div class="link-popup-sub">Podes adicionar mais do que um link (ex: câmaras diferentes).</div>
    <div class="link-popup-list" id="video-popup-list"></div>
    <div class="link-popup-add">
      <input type="url" id="video-popup-input" placeholder="https://...">
      <button class="action" data-action="video-add">Adicionar</button>
    </div>
    <div class="link-popup-actions">
      <button class="action" data-action="link-close">Fechar</button>
    </div>
  `);

  const renderList = () => {
    const list = overlay.querySelector('#video-popup-list');
    const links = videosDoJogo(match.id);
    list.innerHTML = links.length
      ? links.map(v => `
          <div class="link-popup-row" data-id="${v.id}">
            <a href="${escapeHtml(v.url)}" target="_blank" rel="noopener" class="link-open-btn" title="Abrir">▶</a>
            <span class="link-popup-url">${escapeHtml(v.url)}</span>
            <button type="button" class="link-remove-btn" data-action="video-remove" data-id="${v.id}" title="Remover">✕</button>
          </div>
        `).join('')
      : '<p class="hint">Ainda não há nenhum link de vídeo.</p>';
  };
  renderList();

  overlay.querySelector('[data-action="video-add"]').addEventListener('click', async () => {
    const input = overlay.querySelector('#video-popup-input');
    const url = input.value.trim();
    if (!url) return;
    const { data, error } = await supabase.rpc('competition_add_video_link', {
      p_code: accessCode, p_match_id: match.id, p_url: url,
    });
    if (error) { alert(error.message); return; }
    videosCache.push(data);
    input.value = '';
    renderList();
    renderView();
  });

  overlay.querySelector('#video-popup-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('[data-action="video-add"]').click();
  });

  overlay.querySelector('#video-popup-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="video-remove"]');
    if (!btn) return;
    if (!confirm('Remover este link de vídeo?')) return;
    const { error } = await supabase.rpc('competition_delete_video_link', {
      p_code: accessCode, p_link_id: btn.dataset.id,
    });
    if (error) { alert(error.message); return; }
    videosCache = videosCache.filter(v => v.id !== btn.dataset.id);
    renderList();
    renderView();
  });

  overlay.querySelector('[data-action="link-close"]').addEventListener('click', closeLinkPopup);
}

function openZerozeroPopup(match) {
  const overlay = openPopup(`
    <div class="link-popup-title">ZeroZero — ${escapeHtml(jogoLabel(match))}</div>
    <input type="url" id="zerozero-popup-input" placeholder="https://www.zerozero.pt/..." value="${escapeHtml(match.zerozero_url || '')}">
    <div class="link-popup-actions">
      <button class="action" data-action="link-cancel">Cancelar</button>
      <button class="action" data-action="zerozero-save">Guardar</button>
    </div>
  `);

  overlay.querySelector('[data-action="link-cancel"]').addEventListener('click', closeLinkPopup);
  overlay.querySelector('#zerozero-popup-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('[data-action="zerozero-save"]').click();
  });
  overlay.querySelector('[data-action="zerozero-save"]').addEventListener('click', async () => {
    const url = overlay.querySelector('#zerozero-popup-input').value.trim();
    const { data, error } = await supabase.rpc('competition_set_zerozero_link', {
      p_code: accessCode, p_id: match.id, p_url: url,
    });
    if (error) { alert(error.message); return; }
    const m = matchesCache.find(x => x.id === match.id);
    if (m) m.zerozero_url = data.zerozero_url;
    closeLinkPopup();
    renderView();
  });
}

function wireMatchesBody() {
  el('matches-body').addEventListener('click', (e) => {
    const videoBtn = e.target.closest('[data-action="manage-video"]');
    if (videoBtn) {
      const match = matchesCache.find(m => m.id === videoBtn.dataset.id);
      if (match) openVideoPopup(match);
      return;
    }
    const zerozeroBtn = e.target.closest('[data-action="manage-zerozero"]');
    if (zerozeroBtn) {
      const match = matchesCache.find(m => m.id === zerozeroBtn.dataset.id);
      if (match) openZerozeroPopup(match);
    }
  });
}

// ---------- Sair ----------

function wireLogout() {
  el('btn-logout-code').addEventListener('click', () => {
    localStorage.removeItem(CODE_STORAGE_KEY);
    accessCode = '';
    matchesCache = [];
    videosCache = [];
    el('access-code').value = '';
    el('code-error').textContent = '';
    el('calendar-screen').hidden = true;
    el('code-screen').hidden = false;
  });
}

wireCodeScreen();
wireJornadaNav();
wireMatchesBody();
wireLogout();

if (accessCode) {
  tentarEntrar(accessCode);
}
