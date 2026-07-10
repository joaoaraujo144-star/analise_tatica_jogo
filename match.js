import { supabase } from './supabase-client.js';

const TRACKERS = [
  { id: 'faltas', title: 'Faltas', xLabel: 'Realizadas', yLabel: 'Sofridas' },
  { id: 'cantos', title: 'Cantos', xLabel: 'A Favor', yLabel: 'Contra' },
  { id: 'perdas', title: 'Perdas de Bola', xLabel: 'A Favor', yLabel: 'Contra' },
  { id: 'remates', title: 'Remates', xLabel: 'A Favor', yLabel: 'Contra' },
];

const el = (id) => document.getElementById(id);

let currentUser = null;
let currentTeamId = localStorage.getItem('current_team_id') || null;
let currentTeam = null;
let currentMatchId = localStorage.getItem('current_match_id') || null;
let currentMatch = null;
let rosterCache = [];
let matchPlayersCache = [];
let trackerApis = {};
let hoveredTracker = null;

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---------- Histórico de ações (player_events) ----------

function logPlayerActions(mp, patch) {
  const rows = Object.entries(patch).map(([tipo, valor]) => ({
    user_id: currentUser.id,
    team_id: currentTeamId,
    match_id: currentMatchId,
    player_id: mp.player_id,
    tipo,
    valor: valor === null || valor === undefined ? '' : String(valor)
  }));
  if (!rows.length) return Promise.resolve();
  return supabase.from('player_events').insert(rows);
}

function updateIndicators() {
  el('team-indicator').textContent = currentTeam ? `Equipa: ${currentTeam.nome}` : 'Equipa';
  el('match-indicator').textContent = currentMatch ? `Jogo: vs ${currentMatch.adversario} (${currentMatch.data})` : 'Jogo';
}

// ---------- Cronómetro do jogo (1ª / 2ª parte) ----------

function isLocked() {
  return !!(currentMatch && currentMatch.parte2_fim);
}

let periodoTimerInterval = null;

function startPeriodoTimer() {
  if (periodoTimerInterval) return;
  periodoTimerInterval = setInterval(updatePeriodoTimer, 1000);
}

function updatePeriodoTimer() {
  const m = currentMatch;
  const timerEl = el('periodo-timer');
  const p1Running = !!(m && m.parte1_inicio && !m.parte1_fim);
  const p2Running = !!(m && m.parte2_inicio && !m.parte2_fim);
  const start = p2Running ? m.parte2_inicio : (p1Running ? m.parte1_inicio : null);

  if (!start) { timerEl.textContent = '00:00'; return; }

  const totalSeconds = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  timerEl.textContent = `${mm}:${ss}`;
}

function updatePeriodoUI() {
  const m = currentMatch;
  const pill = el('periodo-pill');
  const status = el('periodo-status');
  const fmt = (ts) => ts ? new Date(ts).toLocaleTimeString('pt-PT') : null;

  const p1Running = !!(m.parte1_inicio && !m.parte1_fim);
  const p2Running = !!(m.parte2_inicio && !m.parte2_fim);

  updatePeriodoTimer();

  pill.classList.toggle('part-2', p2Running || !!m.parte2_fim);
  pill.classList.toggle('part-1', !(p2Running || m.parte2_fim));

  el('btn-iniciar-parte1').disabled = !!m.parte1_inicio;
  el('btn-iniciar-parte2').disabled = !m.parte1_fim || !!m.parte2_inicio;
  el('btn-finalizar-parte').disabled = !(p1Running || p2Running);
  el('btn-recomecar-jogo').disabled = !m.parte1_inicio;

  if (p2Running) {
    status.textContent = `2ª parte em curso (início ${fmt(m.parte2_inicio)}).`;
  } else if (m.parte2_fim) {
    status.textContent = `Jogo terminado (fim ${fmt(m.parte2_fim)}).`;
  } else if (m.parte1_fim) {
    status.textContent = `Intervalo (1ª parte terminou às ${fmt(m.parte1_fim)}).`;
  } else if (p1Running) {
    status.textContent = `1ª parte em curso (início ${fmt(m.parte1_inicio)}).`;
  } else {
    status.textContent = 'Jogo ainda não começou.';
  }

  applyLockState();
}

function applyLockState() {
  const locked = isLocked();

  el('jogadores-locked-hint').hidden = !locked;
  el('registo-locked-hint').hidden = !locked;

  el('btn-convocar').disabled = locked;
  el('convocar-select').disabled = locked;
  el('convocar-status').disabled = locked;
  document.querySelectorAll('#players-body .stat-cell, #players-body .badge-estado, #players-body .btn-remove-player').forEach(node => {
    node.style.pointerEvents = locked ? 'none' : '';
    node.style.opacity = locked ? '0.5' : '';
  });

  document.querySelectorAll('.tracker .field-img').forEach(img => {
    img.style.pointerEvents = locked ? 'none' : '';
    img.style.opacity = locked ? '0.5' : '';
  });
  document.querySelectorAll('.tracker .actions button').forEach(btn => { btn.disabled = locked; });
}

function wirePeriodo() {
  el('btn-iniciar-parte1').addEventListener('click', async () => {
    const now = new Date().toISOString();
    const { error } = await supabase.from('matches').update({ parte1_inicio: now }).eq('id', currentMatchId);
    if (error) { alert(error.message); return; }
    currentMatch.parte1_inicio = now;
    updatePeriodoUI();
  });

  el('btn-finalizar-parte').addEventListener('click', async () => {
    const now = new Date().toISOString();
    const field = (currentMatch.parte2_inicio && !currentMatch.parte2_fim) ? 'parte2_fim' : 'parte1_fim';
    const { error } = await supabase.from('matches').update({ [field]: now }).eq('id', currentMatchId);
    if (error) { alert(error.message); return; }
    currentMatch[field] = now;
    updatePeriodoUI();
  });

  el('btn-iniciar-parte2').addEventListener('click', async () => {
    const now = new Date().toISOString();
    const { error } = await supabase.from('matches').update({ parte2_inicio: now }).eq('id', currentMatchId);
    if (error) { alert(error.message); return; }
    currentMatch.parte2_inicio = now;
    updatePeriodoUI();
  });

  el('btn-recomecar-jogo').addEventListener('click', async () => {
    if (!confirm('Recomeçar o jogo? Isto limpa o início/fim da 1ª e 2ª parte (os dados dos jogadores e do registo não são apagados).')) return;
    const reset = { parte1_inicio: null, parte1_fim: null, parte2_inicio: null, parte2_fim: null };
    const { error } = await supabase.from('matches').update(reset).eq('id', currentMatchId);
    if (error) { alert(error.message); return; }
    Object.assign(currentMatch, reset);
    updatePeriodoUI();
  });
}

function wireTopBar() {
  el('btn-sign-out').addEventListener('click', async () => {
    localStorage.removeItem('current_team_id');
    localStorage.removeItem('current_match_id');
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });

  el('btn-switch-team').addEventListener('click', () => {
    localStorage.removeItem('current_match_id');
    window.location.href = 'teams.html';
  });

  el('btn-switch-match').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
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

// ---------- Plantel (leitura, para preencher o dropdown de convocatória) ----------

async function loadRoster() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('team_id', currentTeamId)
    .order('nome', { ascending: true });
  if (error) { console.error(error); return; }
  rosterCache = data || [];
  renderConvocarOptions();
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
    if (isLocked()) return;
    const playerId = el('convocar-select').value;
    if (!playerId) return;
    const estado = el('convocar-status').value;
    const { error } = await supabase.from('match_players').insert({
      user_id: currentUser.id,
      team_id: currentTeamId,
      match_id: currentMatchId,
      player_id: playerId,
      estado
    });
    if (error) { alert(error.message); return; }
    await loadMatchPlayers();
  });

  el('players-body').addEventListener('click', async (e) => {
    if (isLocked()) return;
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
      case 'toggle-amarelo2':
        patch.amarelo2 = mp.amarelo2 ? 0 : 1;
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
      case 'toggle-substituicao': {
        const target = mp.estado === 'Titular' ? 'Saiu' : 'Entrou';
        patch.substituicao = mp.substituicao === target ? null : target;
        break;
      }
      default:
        return;
    }

    if (cell.dataset.action === 'toggle-amarelo' || cell.dataset.action === 'toggle-amarelo2') {
      const newAmarelo = patch.amarelo ?? mp.amarelo;
      const newAmarelo2 = patch.amarelo2 ?? mp.amarelo2;
      if (newAmarelo && newAmarelo2) patch.vermelho = 1;
    }

    Object.assign(mp, patch);
    renderMatchPlayers();
    await Promise.all([
      supabase.from('match_players').update(patch).eq('id', mp.id),
      logPlayerActions(mp, patch)
    ]);
  });

  el('players-body').addEventListener('contextmenu', async (e) => {
    if (isLocked()) return;
    const substCell = e.target.closest('[data-action="toggle-substituicao"]');
    if (substCell) {
      e.preventDefault();
      const mp = matchPlayersCache.find(x => x.id === substCell.dataset.id);
      if (!mp) return;
      mp.substituicao = null;
      renderMatchPlayers();
      await Promise.all([
        supabase.from('match_players').update({ substituicao: null }).eq('id', mp.id),
        logPlayerActions(mp, { substituicao: null })
      ]);
      return;
    }

    const cell = e.target.closest('.stat-counter');
    if (!cell) return;
    e.preventDefault();
    const mp = matchPlayersCache.find(x => x.id === cell.dataset.id);
    if (!mp) return;
    const key = cell.dataset.action === 'count-assistencias' ? 'assistencias' : 'golo';
    mp[key] = Math.max(0, (mp[key] || 0) - 1);
    renderMatchPlayers();
    await Promise.all([
      supabase.from('match_players').update({ [key]: mp[key] }).eq('id', mp.id),
      logPlayerActions(mp, { [key]: mp[key] })
    ]);
  });
}

async function loadMatchPlayers() {
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
      <td class="stat-cell stat-toggle ${mp.amarelo2 ? 'on' : ''}" data-action="toggle-amarelo2" data-id="${mp.id}">🟨</td>
      <td class="stat-cell stat-toggle ${mp.vermelho ? 'on' : ''}" data-action="toggle-vermelho" data-id="${mp.id}">🟥</td>
      <td class="stat-cell stat-counter ${mp.assistencias ? 'has-count' : ''}" data-action="count-assistencias" data-id="${mp.id}">${mp.assistencias || 0}</td>
      <td class="stat-cell stat-counter ${mp.golo ? 'has-count' : ''}" data-action="count-golo" data-id="${mp.id}">${mp.golo || 0}</td>
      <td><span class="badge-estado ${mp.substituicao === 'Entrou' ? 'entrou' : mp.substituicao === 'Saiu' ? 'saiu' : ''}" data-action="toggle-substituicao" data-id="${mp.id}">${mp.substituicao || '—'}</span></td>
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
    if (isLocked()) return;
    const row = {
      user_id: currentUser.id,
      team_id: currentTeamId,
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
    if (isLocked()) return;
    const last = clicks[clicks.length - 1];
    if (!last) return;
    clicks.pop();
    renderAll();
    await supabase.from('events').delete().eq('id', last.id);
  }

  fieldImg.addEventListener('click', (e) => {
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
    if (isLocked() || !clicks.length) return;
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

// ---------- Relatórios (só deste jogo) ----------

function loadReports() {
  const rows = [...matchPlayersCache].sort((a, b) => (b.golo || 0) - (a.golo || 0) || (b.assistencias || 0) - (a.assistencias || 0));
  renderReports(rows);
}

function renderReports(rows) {
  const body = el('reports-body');
  body.innerHTML = '';
  rows.forEach(mp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${mp.players?.numero || ''}</td><td>${mp.players?.nome || ''}</td><td>${mp.estado || 'Suplente'}</td><td>${mp.golo || 0}</td><td>${mp.assistencias || 0}</td><td>${(mp.amarelo || 0) + (mp.amarelo2 || 0)}</td><td>${mp.vermelho || 0}</td>`;
    body.appendChild(tr);
  });
  el('reports-empty').hidden = rows.length > 0;
}

// ---------- Descarregar jogo atual (CSV) ----------

function wireDownloadSession() {
  el('btn-download-session').addEventListener('click', async () => {
    const lines = [];

    lines.push('=== JOGADORES ===');
    lines.push(['Número', 'Nome', 'Estado', 'Amarelos', 'Vermelho', 'Assistências', 'Golos', 'Substituição'].join(','));
    matchPlayersCache.forEach(mp => {
      lines.push([
        csvField(mp.players?.numero || ''),
        csvField(mp.players?.nome || ''),
        csvField(mp.estado || 'Suplente'),
        (mp.amarelo || 0) + (mp.amarelo2 || 0),
        mp.vermelho || 0,
        mp.assistencias || 0,
        mp.golo || 0,
        csvField(mp.substituicao ?? '')
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

    lines.push('');
    lines.push('=== HISTÓRICO DE AÇÕES ===');
    lines.push(['Nº', 'Nome', 'Tipo', 'Valor', 'Data', 'Hora'].join(','));
    const { data: playerEvents } = await supabase
      .from('player_events')
      .select('*, players(numero, nome)')
      .eq('match_id', currentMatchId)
      .order('created_at', { ascending: true });
    (playerEvents || []).forEach(pe => {
      const when = new Date(pe.created_at);
      lines.push([
        csvField(pe.players?.numero || ''),
        csvField(pe.players?.nome || ''),
        csvField(pe.tipo),
        csvField(pe.valor ?? ''),
        csvField(when.toLocaleDateString('pt-PT')),
        csvField(when.toLocaleTimeString('pt-PT'))
      ].join(','));
    });

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const opponentSlug = (currentMatch?.adversario || 'jogo').replace(/[^a-z0-9]+/gi, '_');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `analise_${opponentSlug}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// ---------- Init ----------

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  currentUser = session.user;

  if (!currentTeamId) { window.location.href = 'teams.html'; return; }
  const { data: team, error: teamError } = await supabase.from('teams').select('*').eq('id', currentTeamId).single();
  if (teamError || !team) { window.location.href = 'teams.html'; return; }
  currentTeam = team;

  if (!currentMatchId) { window.location.href = 'dashboard.html'; return; }
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', currentMatchId)
    .eq('team_id', currentTeamId)
    .single();
  if (matchError || !match) { window.location.href = 'dashboard.html'; return; }
  currentMatch = match;

  updateIndicators();
  wirePeriodo();
  updatePeriodoUI();
  startPeriodoTimer();

  wireTopBar();
  wireTabs();
  wireConvocatoria();
  buildTrackerSections();
  wireDownloadSession();
  applyLockState();

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession) window.location.href = 'login.html';
  });

  await loadRoster();
  await loadMatchPlayers();
  reloadAllTrackers();
}

init();
