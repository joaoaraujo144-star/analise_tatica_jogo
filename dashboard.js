import { supabase } from './supabase-client.js';

const TRACKERS = [
  { id: 'faltas', title: 'Faltas', xLabel: 'Realizadas', yLabel: 'Sofridas' },
  { id: 'cantos', title: 'Cantos', xLabel: 'A Favor', yLabel: 'Contra' },
  { id: 'perdas', title: 'Perdas de Bola', xLabel: 'A Favor', yLabel: 'Contra' },
  { id: 'remates', title: 'Remates', xLabel: 'A Favor', yLabel: 'Contra' },
];

const el = (id) => document.getElementById(id);

let currentUser = null;
let currentMatchId = localStorage.getItem('current_match_id') || null;
let matchesCache = [];
let rosterCache = [];
let matchPlayersCache = [];
let trackerApis = {};
let hoveredTracker = null;

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---------- Auth ----------

async function loadApp() {
  await loadMatches();
  await loadRoster();

  if (currentMatchId && !matchesCache.some(m => m.id === currentMatchId)) {
    currentMatchId = null;
    localStorage.removeItem('current_match_id');
  }

  updateMatchIndicator();
  await loadMatchPlayers();
  reloadAllTrackers();
  updateRegistoAvailability();
  checkLocalImport();
}

function wireAuthForm() {
  el('btn-sign-out').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}

// ---------- Tabs ----------

function wireTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.hidden = panel.id !== `tab-${btn.dataset.tab}`;
      });
      if (btn.dataset.tab === 'relatorios') loadReports();
    });
  });
}

// ---------- Jogos ----------

function wireMatches() {
  el('btn-create-match').addEventListener('click', async () => {
    const data = el('match-date').value;
    const adversario = el('match-opponent').value.trim();
    if (!data || !adversario) return;
    const { data: row, error } = await supabase
      .from('matches')
      .insert({ user_id: currentUser.id, data, adversario })
      .select()
      .single();
    if (error) { alert(error.message); return; }
    el('match-date').value = '';
    el('match-opponent').value = '';
    await loadMatches();
    selectMatch(row.id);
  });
}

async function loadMatches() {
  const { data, error } = await supabase.from('matches').select('*').order('data', { ascending: false });
  if (error) { console.error(error); return; }
  matchesCache = data || [];
  renderMatches();
}

function renderMatches() {
  const body = el('matches-body');
  body.innerHTML = '';
  matchesCache.forEach(m => {
    const tr = document.createElement('tr');
    const isActive = m.id === currentMatchId;
    tr.innerHTML = `<td>${m.data}</td><td>${m.adversario}</td><td><button class="action" data-id="${m.id}">${isActive ? 'Selecionado' : 'Abrir'}</button></td>`;
    body.appendChild(tr);
  });
  el('matches-empty').hidden = matchesCache.length > 0;
  body.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => selectMatch(btn.dataset.id));
  });
}

function updateMatchIndicator() {
  const m = matchesCache.find(x => x.id === currentMatchId);
  el('match-indicator').textContent = m ? `Jogo atual: vs ${m.adversario} (${m.data})` : 'Nenhum jogo selecionado';
}

async function selectMatch(matchId) {
  currentMatchId = matchId;
  localStorage.setItem('current_match_id', matchId);
  updateMatchIndicator();
  renderMatches();
  await loadMatchPlayers();
  reloadAllTrackers();
  updateRegistoAvailability();
}

function updateRegistoAvailability() {
  const hasMatch = !!currentMatchId;
  el('tab-registo-warning').hidden = hasMatch;
  el('page').style.display = hasMatch ? '' : 'none';
  el('convocar-warning').hidden = hasMatch;
  el('convocar-select').disabled = !hasMatch;
  el('convocar-status').disabled = !hasMatch;
  el('btn-convocar').disabled = !hasMatch;
}

// ---------- Plantel ----------

function wireRoster() {
  el('btn-add-roster-player').addEventListener('click', async () => {
    const nome = el('roster-name').value.trim();
    if (!nome) return;
    const numero = el('roster-number').value.trim();
    const { error } = await supabase.from('players').insert({ user_id: currentUser.id, numero: numero || null, nome });
    if (error) { alert(error.message); return; }
    el('roster-number').value = '';
    el('roster-name').value = '';
    await loadRoster();
  });

  [el('roster-number'), el('roster-name')].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') el('btn-add-roster-player').click();
    });
  });

  el('roster-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-remove-player');
    if (!btn) return;
    if (!confirm('Remover este jogador do plantel? Isto remove também as suas convocatórias em todos os jogos.')) return;
    await supabase.from('players').delete().eq('id', btn.dataset.id);
    await loadRoster();
    if (currentMatchId) await loadMatchPlayers();
  });
}

async function loadRoster() {
  const { data, error } = await supabase.from('players').select('*').order('nome', { ascending: true });
  if (error) { console.error(error); return; }
  rosterCache = data || [];
  renderRoster();
  renderConvocarOptions();
}

function renderRoster() {
  const body = el('roster-body');
  body.innerHTML = '';
  rosterCache.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.numero || ''}</td><td>${p.nome}</td><td><button class="btn-remove-player" data-id="${p.id}" title="Remover">✕</button></td>`;
    body.appendChild(tr);
  });
  el('roster-empty').hidden = rosterCache.length > 0;
}

// ---------- Convocatória ----------

function renderConvocarOptions() {
  const select = el('convocar-select');
  const already = new Set(matchPlayersCache.map(mp => mp.player_id));
  const available = rosterCache.filter(p => !already.has(p.id));
  select.innerHTML = available.length
    ? available.map(p => `<option value="${p.id}">${p.numero ? p.numero + ' - ' : ''}${p.nome}</option>`).join('')
    : '<option value="">Sem jogadores disponíveis</option>';
}

function wireConvocatoria() {
  el('btn-convocar').addEventListener('click', async () => {
    if (!currentMatchId) { alert('Seleciona ou cria um jogo primeiro (tab Jogos).'); return; }
    const playerId = el('convocar-select').value;
    if (!playerId) return;
    const estado = el('convocar-status').value;
    const { error } = await supabase.from('match_players').insert({
      user_id: currentUser.id,
      match_id: currentMatchId,
      player_id: playerId,
      estado
    });
    if (error) { alert(error.message); return; }
    await loadMatchPlayers();
  });

  el('players-body').addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('.btn-remove-player');
    if (removeBtn) {
      await supabase.from('match_players').delete().eq('id', removeBtn.dataset.id);
      await loadMatchPlayers();
      return;
    }

    const cell = e.target.closest('[data-action]');
    if (!cell) return;
    const mp = matchPlayersCache.find(x => x.id === cell.dataset.id);
    if (!mp) return;
    const decrement = e.ctrlKey || e.metaKey;
    const patch = {};

    switch (cell.dataset.action) {
      case 'toggle-estado':
        patch.estado = mp.estado === 'Titular' ? 'Suplente' : 'Titular';
        break;
      case 'toggle-amarelo':
        patch.amarelo = mp.amarelo ? 0 : 1;
        break;
      case 'toggle-vermelho':
        patch.vermelho = mp.vermelho ? 0 : 1;
        break;
      case 'count-assistencias':
        patch.assistencias = Math.max(0, (mp.assistencias || 0) + (decrement ? -1 : 1));
        break;
      case 'count-golo':
        patch.golo = Math.max(0, (mp.golo || 0) + (decrement ? -1 : 1));
        break;
      default:
        return;
    }

    Object.assign(mp, patch);
    renderMatchPlayers();
    await supabase.from('match_players').update(patch).eq('id', mp.id);
  });

  el('players-body').addEventListener('contextmenu', async (e) => {
    const cell = e.target.closest('.stat-counter');
    if (!cell) return;
    e.preventDefault();
    const mp = matchPlayersCache.find(x => x.id === cell.dataset.id);
    if (!mp) return;
    const key = cell.dataset.action === 'count-assistencias' ? 'assistencias' : 'golo';
    mp[key] = Math.max(0, (mp[key] || 0) - 1);
    renderMatchPlayers();
    await supabase.from('match_players').update({ [key]: mp[key] }).eq('id', mp.id);
  });

  el('players-body').addEventListener('input', async (e) => {
    const input = e.target.closest('.minute-input');
    if (!input) return;
    const mp = matchPlayersCache.find(x => x.id === input.dataset.id);
    if (!mp) return;
    const value = input.value === '' ? null : Number(input.value);
    mp.minuto_substituicao = value;
    await supabase.from('match_players').update({ minuto_substituicao: value }).eq('id', mp.id);
  });
}

async function loadMatchPlayers() {
  if (!currentMatchId) {
    matchPlayersCache = [];
    renderMatchPlayers();
    renderConvocarOptions();
    return;
  }
  const { data, error } = await supabase
    .from('match_players')
    .select('*, players(numero, nome)')
    .eq('match_id', currentMatchId);
  if (error) { console.error(error); return; }
  matchPlayersCache = data || [];
  renderMatchPlayers();
  renderConvocarOptions();
}

function renderMatchPlayers() {
  const body = el('players-body');
  body.innerHTML = '';
  const sorted = [...matchPlayersCache].sort((a, b) => {
    const na = parseInt(a.players?.numero, 10);
    const nb = parseInt(b.players?.numero, 10);
    if (isNaN(na) && isNaN(nb)) return 0;
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return na - nb;
  });
  sorted.forEach(mp => {
    const estado = mp.estado || 'Suplente';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${mp.players?.numero || ''}</td>
      <td>${mp.players?.nome || ''}</td>
      <td><span class="badge-estado ${estado === 'Titular' ? 'titular' : ''}" data-action="toggle-estado" data-id="${mp.id}">${estado}</span></td>
      <td class="stat-cell stat-toggle ${mp.amarelo ? 'on' : ''}" data-action="toggle-amarelo" data-id="${mp.id}">🟨</td>
      <td class="stat-cell stat-toggle ${mp.vermelho ? 'on' : ''}" data-action="toggle-vermelho" data-id="${mp.id}">🟥</td>
      <td class="stat-cell stat-counter ${mp.assistencias ? 'has-count' : ''}" data-action="count-assistencias" data-id="${mp.id}">${mp.assistencias || 0}</td>
      <td class="stat-cell stat-counter ${mp.golo ? 'has-count' : ''}" data-action="count-golo" data-id="${mp.id}">${mp.golo || 0}</td>
      <td><input type="number" class="minute-input" data-id="${mp.id}" min="0" max="130" placeholder="Min" value="${mp.minuto_substituicao ?? ''}"></td>
      <td><button class="btn-remove-player" data-id="${mp.id}" title="Remover">✕</button></td>
    `;
    body.appendChild(tr);
  });
  el('players-empty').hidden = matchPlayersCache.length > 0;
}

// ---------- Campos (Faltas, Cantos, Perdas de Bola, Remates) ----------

function buildTrackerSections() {
  const page = el('page');
  TRACKERS.forEach(cfg => {
    const section = document.createElement('section');
    section.className = 'tracker';
    section.dataset.tracker = cfg.id;
    section.innerHTML = `
      <h2 class="tracker-title">${cfg.title}</h2>
      <div class="toolbar">
        <button class="mode-btn x active" data-tipo="X">${cfg.xLabel}</button>
        <button class="mode-btn y" data-tipo="Y">${cfg.yLabel}</button>
      </div>
      <div class="counters">
        <div class="counter x"><span class="num" data-count="X">0</span>${cfg.xLabel}</div>
        <div class="counter y"><span class="num" data-count="Y">0</span>${cfg.yLabel}</div>
      </div>
      <div class="field-wrap">
        <img src="campo.png" alt="Campo de futebol" class="field-img" draggable="false">
      </div>
      <div class="actions">
        <button class="action" data-action="undo">Desfazer último</button>
        <button class="action danger" data-action="clear">Limpar tudo</button>
      </div>
      <div class="log">
        <table>
          <thead>
            <tr><th>#</th><th>Tipo</th><th>X (%)</th><th>Y (%)</th><th>Hora</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;
    page.appendChild(section);
    trackerApis[cfg.id] = initTracker(cfg, section);
    section.addEventListener('mouseenter', () => { hoveredTracker = trackerApis[cfg.id]; });
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (!hoveredTracker) return;
    if (e.key === 'x' || e.key === 'X') hoveredTracker.setMode('X');
    if (e.key === 'y' || e.key === 'Y') hoveredTracker.setMode('Y');
  });
}

function initTracker(cfg, root) {
  let mode = 'X';
  let clicks = [];

  const fieldWrap = root.querySelector('.field-wrap');
  const fieldImg = root.querySelector('.field-img');
  const btnX = root.querySelector('.mode-btn.x');
  const btnY = root.querySelector('.mode-btn.y');
  const countX = root.querySelector('[data-count="X"]');
  const countY = root.querySelector('[data-count="Y"]');
  const logBody = root.querySelector('tbody');

  function setMode(m) {
    mode = m;
    btnX.classList.toggle('active', m === 'X');
    btnY.classList.toggle('active', m === 'Y');
  }

  function renderMarker(click) {
    const marker = document.createElement('div');
    marker.className = 'marker ' + click.tipo;
    marker.style.left = click.x_pct + '%';
    marker.style.top = click.y_pct + '%';
    marker.textContent = click.tipo;
    fieldWrap.appendChild(marker);
  }

  function renderAll() {
    fieldWrap.querySelectorAll('.marker').forEach(m => m.remove());
    clicks.forEach(renderMarker);
    countX.textContent = clicks.filter(c => c.tipo === 'X').length;
    countY.textContent = clicks.filter(c => c.tipo === 'Y').length;
    logBody.innerHTML = '';
    clicks.forEach((c, i) => {
      const tr = document.createElement('tr');
      const hora = new Date(c.created_at).toLocaleTimeString('pt-PT');
      tr.innerHTML = `<td>${i + 1}</td><td class="tipo-${c.tipo}">${c.tipo}</td><td>${c.x_pct}</td><td>${c.y_pct}</td><td>${hora}</td>`;
      logBody.appendChild(tr);
    });
    logBody.parentElement.parentElement.scrollTop = logBody.parentElement.parentElement.scrollHeight;
  }

  async function reload() {
    if (!currentMatchId) { clicks = []; renderAll(); return; }
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('match_id', currentMatchId)
      .eq('tracker_id', cfg.id)
      .order('created_at', { ascending: true });
    if (error) { console.error(error); return; }
    clicks = data || [];
    renderAll();
  }

  async function addClick(x_pct, y_pct) {
    if (!currentMatchId) { alert('Seleciona ou cria um jogo primeiro (tab Jogos).'); return; }
    const row = {
      user_id: currentUser.id,
      match_id: currentMatchId,
      tracker_id: cfg.id,
      tipo: mode,
      x_pct: Number(x_pct.toFixed(2)),
      y_pct: Number(y_pct.toFixed(2))
    };
    const { data, error } = await supabase.from('events').insert(row).select().single();
    if (error) { alert(error.message); return; }
    clicks.push(data);
    renderAll();
  }

  async function undoLast() {
    const last = clicks[clicks.length - 1];
    if (!last) return;
    clicks.pop();
    renderAll();
    await supabase.from('events').delete().eq('id', last.id);
  }

  fieldImg.addEventListener('click', (e) => {
    if (!currentMatchId) { alert('Seleciona ou cria um jogo primeiro (tab Jogos).'); return; }
    if (e.ctrlKey || e.metaKey) { undoLast(); return; }
    const rect = fieldImg.getBoundingClientRect();
    const x_pct = ((e.clientX - rect.left) / rect.width) * 100;
    const y_pct = ((e.clientY - rect.top) / rect.height) * 100;
    addClick(x_pct, y_pct);
  });

  fieldImg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    undoLast();
  });

  btnX.addEventListener('click', () => setMode('X'));
  btnY.addEventListener('click', () => setMode('Y'));

  root.querySelector('[data-action="undo"]').addEventListener('click', undoLast);
  root.querySelector('[data-action="clear"]').addEventListener('click', async () => {
    if (!clicks.length) return;
    if (!confirm(`Apagar todos os pontos registados de "${cfg.title}" neste jogo?`)) return;
    const ids = clicks.map(c => c.id);
    clicks = [];
    renderAll();
    await supabase.from('events').delete().in('id', ids);
  });

  renderAll();

  return { setMode, reload };
}

function reloadAllTrackers() {
  Object.values(trackerApis).forEach(api => api.reload());
}

// ---------- Relatórios ----------

async function loadReports() {
  const { data, error } = await supabase
    .from('match_players')
    .select('golo, assistencias, amarelo, vermelho, players(id, numero, nome)');
  if (error) { console.error(error); return; }

  const byPlayer = new Map();
  (data || []).forEach(row => {
    const p = row.players;
    if (!p) return;
    if (!byPlayer.has(p.id)) {
      byPlayer.set(p.id, { numero: p.numero, nome: p.nome, jogos: 0, golo: 0, assistencias: 0, amarelo: 0, vermelho: 0 });
    }
    const agg = byPlayer.get(p.id);
    agg.jogos += 1;
    agg.golo += row.golo || 0;
    agg.assistencias += row.assistencias || 0;
    agg.amarelo += row.amarelo || 0;
    agg.vermelho += row.vermelho || 0;
  });

  const rows = Array.from(byPlayer.values()).sort((a, b) => b.golo - a.golo || b.assistencias - a.assistencias);
  renderReports(rows);
}

function renderReports(rows) {
  const body = el('reports-body');
  body.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.numero || ''}</td><td>${r.nome}</td><td>${r.jogos}</td><td>${r.golo}</td><td>${r.assistencias}</td><td>${r.amarelo}</td><td>${r.vermelho}</td>`;
    body.appendChild(tr);
  });
  el('reports-empty').hidden = rows.length > 0;
}

// ---------- Descarregar jogo atual (CSV) ----------

function wireDownloadSession() {
  el('btn-download-session').addEventListener('click', async () => {
    if (!currentMatchId) { alert('Seleciona ou cria um jogo primeiro (tab Jogos).'); return; }
    const match = matchesCache.find(m => m.id === currentMatchId);
    const lines = [];

    lines.push('=== JOGADORES ===');
    lines.push(['Número', 'Nome', 'Estado', 'Amarelo', 'Vermelho', 'Assistências', 'Golos', 'Minuto Substituição'].join(','));
    matchPlayersCache.forEach(mp => {
      lines.push([
        csvField(mp.players?.numero || ''),
        csvField(mp.players?.nome || ''),
        csvField(mp.estado || 'Suplente'),
        mp.amarelo || 0,
        mp.vermelho || 0,
        mp.assistencias || 0,
        mp.golo || 0,
        csvField(mp.minuto_substituicao ?? '')
      ].join(','));
    });

    for (const cfg of TRACKERS) {
      lines.push('');
      lines.push(`=== ${cfg.title.toUpperCase()} ===`);
      lines.push(['Tipo', 'X (%)', 'Y (%)', 'Hora'].join(','));
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('match_id', currentMatchId)
        .eq('tracker_id', cfg.id)
        .order('created_at', { ascending: true });
      (data || []).forEach(c => {
        const hora = new Date(c.created_at).toLocaleTimeString('pt-PT');
        lines.push([c.tipo, c.x_pct, c.y_pct, csvField(hora)].join(','));
      });
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const opponentSlug = (match?.adversario || 'jogo').replace(/[^a-z0-9]+/gi, '_');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `analise_${opponentSlug}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// ---------- Importar dados locais (localStorage -> Supabase) ----------

function checkLocalImport() {
  const hasLocalData = TRACKERS.some(cfg => localStorage.getItem(`${cfg.id}_clicks_v1`)) || localStorage.getItem('jogadores_v1');
  el('import-card').hidden = !hasLocalData;
}

function wireImport() {
  el('btn-import-local').addEventListener('click', async () => {
    if (!confirm('Isto cria um novo jogo "Importado" e copia os dados guardados neste browser. Continuar?')) return;

    const { data: match, error } = await supabase
      .from('matches')
      .insert({ user_id: currentUser.id, adversario: 'Importado', data: new Date().toISOString().slice(0, 10) })
      .select()
      .single();
    if (error) { alert(error.message); return; }

    const oldPlayers = JSON.parse(localStorage.getItem('jogadores_v1') || '[]');
    for (const p of oldPlayers) {
      const { data: newPlayer, error: playerError } = await supabase
        .from('players')
        .insert({ user_id: currentUser.id, numero: p.numero || null, nome: p.nome })
        .select()
        .single();
      if (playerError) continue;
      await supabase.from('match_players').insert({
        user_id: currentUser.id,
        match_id: match.id,
        player_id: newPlayer.id,
        estado: p.estado || 'Suplente',
        amarelo: p.amarelo || 0,
        vermelho: p.vermelho || 0,
        assistencias: p.assistencias || 0,
        golo: p.golo || 0,
        minuto_substituicao: p.minutoSubstituicao ? Number(p.minutoSubstituicao) : null
      });
    }

    for (const cfg of TRACKERS) {
      const oldClicks = JSON.parse(localStorage.getItem(`${cfg.id}_clicks_v1`) || '[]');
      if (!oldClicks.length) continue;
      const rows = oldClicks.map(c => ({
        user_id: currentUser.id,
        match_id: match.id,
        tracker_id: cfg.id,
        tipo: c.tipo,
        x_pct: Number(c.x_pct),
        y_pct: Number(c.y_pct)
      }));
      await supabase.from('events').insert(rows);
    }

    alert('Importação concluída.');
    el('import-card').hidden = true;
    await loadMatches();
    await selectMatch(match.id);
  });
}

// ---------- Init ----------

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  currentUser = session.user;

  wireAuthForm();
  wireTabs();
  wireMatches();
  wireRoster();
  wireConvocatoria();
  wireImport();
  buildTrackerSections();
  wireDownloadSession();

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession) window.location.href = 'login.html';
  });

  await loadApp();
}

init();
