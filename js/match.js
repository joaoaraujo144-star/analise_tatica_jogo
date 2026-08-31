/**
 * Análise de Jogo — match.js
 * Lógica da página de um jogo específico (pages/match.html): cronómetro
 * de 1ª/2ª parte com orientação de ataque, convocatória e estatísticas
 * por jogador, Registo de Jogo (5 campos clicáveis, por parte), relatório
 * normalizado de fim de jogo, e exportação CSV do jogo atual.
 *
 * Versão: 1.39 (2026-08-31)
 * Histórico:
 *   1.0  (2026-07-08) — criação, ao migrar de localStorage para Supabase.
 *   1.1  (2026-07-08) — separado do login, que passa a ter página própria.
 *   1.2  (2026-07-08) — renomeado de app.js para o nome atual.
 *   1.3  (2026-07-08) — passa a filtrar tudo por equipa (team_id).
 *   1.4  (2026-07-09) — separado do dashboard: cada jogo ganha a sua própria página.
 *   1.5  (2026-07-09) — relatório fica só com os dados deste jogo (agregado vai para o dashboard).
 *   1.6  (2026-07-09) — a tab Plantel sai daqui, passa a viver no dashboard da equipa.
 *   1.7  (2026-07-10) — substituição passa de minuto numérico a badge Saiu/Entrou.
 *   1.8  (2026-07-10) — segundo cartão amarelo, com vermelho automático.
 *   1.9  (2026-07-10) — histórico de ações (player_events) e inclusão no CSV.
 *   1.10 (2026-07-10) — cronómetro de jogo (1ª/2ª parte) com bloqueio de edição no fim.
 *   1.11 (2026-07-10) — temporizador grande (minutos:segundos) da parte em curso.
 *   1.12 (2026-07-10) — seta de orientação do campo (direção de ataque por parte).
 *   1.13 (2026-07-10) — Registo de Jogo passa a ser por parte (1ª/2ª separadas).
 *   1.14 (2026-07-10) — registo normalizado de fim de jogo, tab Registo esconde-se
 *                        ao terminar, e edição só é possível com o jogo a decorrer.
 *   1.15 (2026-07-14) — grava o minuto do jogo em cada ponto; "Perdas de Bola" passa
 *                        a usar os rótulos Ganhos/Perdas.
 *   1.16 (2026-07-14) — nova secção Cruzamentos no Registo de Jogo.
 *   1.17 (2026-07-14) — movido de raiz para js/, sem alterações de lógica.
 *   1.18 (2026-07-15) — popup opcional para escolher o jogador em campo logo após
 *                        cada clique do Registo de Jogo (números de camisola apenas,
 *                        filtrado a quem está em campo); editável na tabela de log
 *                        e no registo normalizado para quem ficar por atribuir.
 *   1.19 (2026-07-15) — remove a coluna "Hora" das tabelas de registo (ao vivo e
 *                        normalizada), mantendo só o "Minuto".
 *   1.20 (2026-07-15) — mapa de calor por zonas (grelha 6×4) no registo normalizado,
 *                        com toggle Pontos/Mapa de Calor e separado por tipo (X/Y) por
 *                        campo; a zona de cada ponto vem da view events_normalizado.
 *   1.21 (2026-07-15) — botão "Exportar relatório (PDF)" na tab Relatórios: força a
 *                        vista de Mapa de Calor em todos os campos e abre a impressão
 *                        do browser (guardar como PDF), via folha de estilo @media print.
 *   1.22 (2026-07-15) — o PDF passa a mostrar sempre os dois mapas de calor (X e Y)
 *                        lado a lado por campo, em vez de só o tipo selecionado no ecrã.
 *   1.23 (2026-08-27) — cada campo do registo normalizado passa a mostrar 3 mapas
 *                        (1ª Parte, 2ª Parte, Ambas as Partes) lado a lado, cada um
 *                        com o seu toggle Pontos/Mapa de Calor; e uma seta "Ataque →"
 *                        fixa em cada mapa a lembrar que a vista já está normalizada
 *                        (a equipa ataca sempre da esquerda para a direita).
 *   1.24 (2026-08-27) — updatePrintHeader() preenche o cabeçalho "vs adversário — data"
 *                        que só aparece no PDF exportado (ver .print-only-header).
 *   1.25 (2026-08-27) — renderHeatGrid() escreve o número de ocorrências dentro de
 *                        cada célula do mapa de calor (antes só dava para ver em
 *                        title, que nunca chegava a aparecer — a grelha tem
 *                        pointer-events: none).
 *   1.26 (2026-08-27) — a seta "Ataque →" (attackArrowHtml) deixa de ficar sobreposta
 *                        ao campo — passa a legenda por cima da imagem, para nunca
 *                        tapar números do mapa de calor que caiam no canto superior
 *                        esquerdo.
 *   1.27 (2026-08-27) — CORRIGE BUG GRAVE da 1.26: a seta reutilizava a classe
 *                        "screen-field", que colidia com o querySelector('.screen-field')
 *                        usado para saber onde desenhar os pontos — apanhava a seta (que
 *                        não é position: relative) em vez do campo, e os pontos ficavam
 *                        soltos pela página inteira. Classe da seta passa a
 *                        "arrow-live-field", e os querySelector relevantes passam a
 *                        ".field-wrap.screen-field" (mais específico).
 *   1.28 (2026-08-27) — número do jogador na convocatória passa a ser editável por
 *                        jogo (match_players.numero, ver migração 019), sobrepondo-se
 *                        ao número de base do Plantel só nesse jogo — útil para
 *                        jogadores cedidos ou com camisola diferente da habitual.
 *                        Corrige de caminho applyLockState() a não aplicar o estado
 *                        visual de bloqueio no arranque da página (corria antes de
 *                        loadMatchPlayers() preencher a tabela).
 *   1.29 (2026-08-31) — reordena TRACKERS: Faltas, Perdas de Bola, Remates,
 *                        Cruzamentos, Cantos (era Faltas, Cantos, Cruzamentos,
 *                        Perdas, Remates) — afeta a ordem dos campos no Registo de
 *                        Jogo, dos mapas no Relatório normalizado, e das secções
 *                        no CSV exportado, todos derivados deste único array.
 *   1.30 (2026-08-31) — golos passam a ser um registo próprio (tabela "goals", ver
 *                        supabase/migrations/021_goals.sql), ligável a um ou mais
 *                        eventos do Registo de Jogo que lhe deram origem. Clicar no
 *                        ⚽ de um jogador abre um popup para escolher (opcional)
 *                        que eventos recentes contribuíram; clique direito/Ctrl+
 *                        clique remove o golo mais recente desse jogador (e desliga
 *                        os eventos associados). Nova secção "Golos do jogo" na tab
 *                        Jogadores, e destaque dourado nos eventos já ligados, no
 *                        log de cada campo. O contador em match_players.golo
 *                        mantém-se, atualizado em paralelo.
 *   1.31 (2026-08-31) — o destaque de golo passa a aparecer também no próprio ponto
 *                        do campo (renderMarker() e o ponto normalizado dos
 *                        Relatórios), com um anel dourado (".marker.golo") — não só
 *                        na linha do log. events_normalizado passa a expor "goal_id"
 *                        (ver supabase/migrations/022_events_normalizado_goal.sql).
 *   1.32 (2026-08-31) — golos sofridos: mesma tabela "goals" e a mesma lógica de
 *                        ligação a eventos, agora com "tipo" ('marcado'/'sofrido') —
 *                        golo sofrido não tem player_id (não há lista de jogadores
 *                        do adversário). openGoalPopup()/confirmGoal() passam a
 *                        receber { mode, mp, existingGoal }; nova secção "Golos
 *                        sofridos" com botão "+ Golo sofrido" (sem clicar num ⚽) e
 *                        botão "Remover" próprio (sem linha de convocado para
 *                        clique direito/Ctrl+clique). Ver
 *                        supabase/migrations/023_goals_sofridos.sql.
 *   1.33 (2026-08-31) — renderScore() mostra o resultado (golos marcados x sofridos)
 *                        por cima do temporizador, contado sempre a partir de
 *                        goalsCache — chamado no fim de loadGoals().
 *   1.34 (2026-08-31) — o temporizador mostrado no ecrã passa a começar em 45:00 na
 *                        2ª parte (convenção do futebol) — só o texto de
 *                        updatePeriodoTimer(); currentMinutoNoJogo(), usado para
 *                        gravar eventos/golos, continua relativo ao início da própria
 *                        parte (0, 1, 2...), para o CSV/BD não mudarem.
 *   1.35 (2026-08-31) — "Golos do jogo" e "Golos sofridos" passam a mostrar o mais
 *                        recente primeiro (sortGoalsRecentFirst(), por minuto do
 *                        jogo) — mais fácil encontrar o golo que acabaste de marcar.
 *   1.36 (2026-08-31) — CSV exportado (wireDownloadSession()) ganha as secções
 *                        "GOLOS" e "GOLOS SOFRIDOS" (minuto, marcador quando há, e a
 *                        cadeia de eventos que lhe deram origem), e cada campo do
 *                        Registo de Jogo ganha a coluna "Golo" (a que golo esse
 *                        evento está ligado, se estiver) — antes a ligação
 *                        evento-golo só existia no ecrã, não saía no ficheiro.
 *   1.37 (2026-08-31) — ao marcar um titular como "Saiu", abre logo o popup "Quem
 *                        entra?" (showEntrouPopup(), mesmo padrão do showJogadorPopup()
 *                        já existente) com os suplentes ainda no banco
 *                        (availableSubstitutes()) — escolher um marca-o logo como
 *                        "Entrou" (setSubstituicao()), sem teres de procurar a linha
 *                        dele na tabela à parte.
 *   1.38 (2026-08-31) — nova coluna "Em Campo" na convocatória: badge só informativo
 *                        (isOnField(), reaproveitado também por onFieldMatchPlayers())
 *                        que mostra quem está mesmo a jogar naquele momento, sem
 *                        cruzar de cabeça Estado + Substituição.
 *   1.39 (2026-08-31) — CORRIGE isOnField(): vermelho (direto ou por 2º amarelo)
 *                        também tira o jogador de campo, mesmo sem "Saiu" marcado —
 *                        antes um titular expulso continuava a aparecer "Em campo".
 *                        availableSubstitutes() também passa a excluir suplentes
 *                        com vermelho (não podem entrar).
 */

import { supabase } from './supabase-client.js';

// Ordem pedida pelo treinador: Faltas, Perdas, Remates, Cruzamentos, Cantos —
// controla a ordem dos campos no Registo de Jogo, dos mapas no Relatório
// normalizado, e das secções no CSV exportado (todos iteram este array).
const TRACKERS = [
  { id: 'faltas', title: 'Faltas', xLabel: 'Realizadas', yLabel: 'Sofridas' },
  { id: 'perdas', title: 'Perdas de Bola', xLabel: 'Ganhos', yLabel: 'Perdas' },
  { id: 'remates', title: 'Remates', xLabel: 'A Favor', yLabel: 'Contra' },
  { id: 'cruzamentos', title: 'Cruzamentos', xLabel: 'A Favor', yLabel: 'Contra' },
  { id: 'cantos', title: 'Cantos', xLabel: 'A Favor', yLabel: 'Contra' },
];

function trackerCfgById(id) {
  return TRACKERS.find(t => t.id === id);
}

const el = (id) => document.getElementById(id);

let currentUser = null;
let currentTeamId = localStorage.getItem('current_team_id') || null;
let currentTeam = null;
let currentMatchId = localStorage.getItem('current_match_id') || null;
let currentMatch = null;
let rosterCache = [];
let matchPlayersCache = [];
let goalsCache = [];
let goalEventsCache = []; // eventos do jogo já ligados a algum golo (goal_id preenchido)
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
  el('score-team-nos').textContent = currentTeam ? currentTeam.nome : 'Equipa';
  el('score-team-adversario').textContent = currentMatch ? currentMatch.adversario : 'Adversário';
}

// Escondido no ecrã (ver .print-only-header em styles.css), só aparece no
// PDF exportado — sem isto o adversário/data do jogo não aparecem no
// relatório impresso (o cabeçalho do browser não é controlável por CSS).
function updatePrintHeader() {
  el('print-header').textContent = currentMatch ? `vs ${currentMatch.adversario} — ${currentMatch.data}` : '';
}

// ---------- Cronómetro do jogo (1ª / 2ª parte) ----------

function isLocked() {
  return !!(currentMatch && currentMatch.parte2_fim);
}

function currentParte() {
  return currentMatch && currentMatch.parte2_inicio ? 2 : 1;
}

function isPeriodoRunning() {
  const m = currentMatch;
  return !!(m && ((m.parte1_inicio && !m.parte1_fim) || (m.parte2_inicio && !m.parte2_fim)));
}

function currentMinutoNoJogo() {
  const m = currentMatch;
  const start = currentParte() === 2 ? m.parte2_inicio : m.parte1_inicio;
  if (!start) return null;
  return Math.floor((Date.now() - new Date(start).getTime()) / 60000);
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

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000));
  // Só o número mostrado no ecrã começa em 45:00 na 2ª parte (convenção do
  // futebol) — currentMinutoNoJogo(), usado para gravar eventos/golos, não
  // soma isto e continua relativo ao início da própria parte (0, 1, 2...),
  // para o CSV/BD não mudarem.
  const displaySeconds = p2Running ? elapsedSeconds + 45 * 60 : elapsedSeconds;
  const mm = String(Math.floor(displaySeconds / 60)).padStart(2, '0');
  const ss = String(displaySeconds % 60).padStart(2, '0');
  timerEl.textContent = `${mm}:${ss}`;
}

// ---------- Orientação do campo ----------

function flipOrientacao(dir) {
  return dir === 'D-E' ? 'E-D' : 'D-E';
}

function updateOrientacaoUI() {
  const m = currentMatch;
  const btn = el('btn-orientacao');
  const base = m.orientacao_parte1 || 'E-D';
  const p2Active = !!(m.parte2_inicio || m.parte2_fim);
  const current = p2Active ? flipOrientacao(base) : base;

  btn.textContent = current === 'E-D' ? '→' : '←';
  btn.title = current === 'E-D'
    ? 'A equipa ataca da esquerda para a direita'
    : 'A equipa ataca da direita para a esquerda';

  const locked = !!m.parte1_inicio;
  btn.disabled = locked;
  btn.classList.toggle('locked', locked);
}

function wireOrientacao() {
  el('btn-orientacao').addEventListener('click', async () => {
    if (currentMatch.parte1_inicio) return;
    const novo = flipOrientacao(currentMatch.orientacao_parte1 || 'E-D');
    const { error } = await supabase.from('matches').update({ orientacao_parte1: novo }).eq('id', currentMatchId);
    if (error) { alert(error.message); return; }
    currentMatch.orientacao_parte1 = novo;
    updateOrientacaoUI();
  });
}

function updatePeriodoUI() {
  const m = currentMatch;
  const pill = el('periodo-pill');
  const status = el('periodo-status');
  const fmt = (ts) => ts ? new Date(ts).toLocaleTimeString('pt-PT') : null;

  const p1Running = !!(m.parte1_inicio && !m.parte1_fim);
  const p2Running = !!(m.parte2_inicio && !m.parte2_fim);

  updatePeriodoTimer();
  updateOrientacaoUI();
  el('registo-parte-indicator').textContent = currentParte() === 2 ? '2ª Parte' : '1ª Parte';

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
  const canEditWhileRunning = !locked && isPeriodoRunning();

  el('jogadores-locked-hint').hidden = !locked;
  el('jogadores-paused-hint').hidden = locked || isPeriodoRunning();
  el('registo-locked-hint').hidden = !locked;
  el('registo-paused-hint').hidden = locked || isPeriodoRunning();

  el('btn-convocar').disabled = locked;
  el('convocar-select').disabled = locked;
  el('convocar-status').disabled = locked;
  document.querySelectorAll('#players-body .btn-remove-player, #players-body [data-action="toggle-estado"]').forEach(node => {
    node.style.pointerEvents = locked ? 'none' : '';
    node.style.opacity = locked ? '0.5' : '';
  });
  // .disabled (não só pointer-events) porque é um <input> — só pointer-events
  // continuaria a deixar editar por teclado (tab + escrever) com o jogo terminado.
  document.querySelectorAll('#players-body .match-numero-input').forEach(node => {
    node.disabled = locked;
  });
  document.querySelectorAll('#players-body .stat-cell, #players-body [data-action="toggle-substituicao"]').forEach(node => {
    node.style.pointerEvents = canEditWhileRunning ? '' : 'none';
    node.style.opacity = canEditWhileRunning ? '' : '0.5';
  });
  el('btn-add-conceded').disabled = !canEditWhileRunning;

  document.querySelectorAll('#page .tracker .field-img').forEach(img => {
    img.style.pointerEvents = canEditWhileRunning ? '' : 'none';
    img.style.opacity = canEditWhileRunning ? '' : '0.5';
  });
  document.querySelectorAll('#page .tracker .actions button').forEach(btn => { btn.disabled = locked; });

  const registoTabBtn = document.querySelector('.tab-btn[data-tab="registo"]');
  registoTabBtn.hidden = locked;
  if (locked && registoTabBtn.classList.contains('active')) {
    document.querySelector('.tab-btn[data-tab="relatorios"]').click();
  }
}

function wirePeriodo() {
  el('btn-iniciar-parte1').addEventListener('click', async () => {
    const now = new Date().toISOString();
    const patch = { parte1_inicio: now };
    if (!currentMatch.orientacao_parte1) patch.orientacao_parte1 = 'E-D';
    const { error } = await supabase.from('matches').update(patch).eq('id', currentMatchId);
    if (error) { alert(error.message); return; }
    Object.assign(currentMatch, patch);
    updatePeriodoUI();
  });

  el('btn-finalizar-parte').addEventListener('click', async () => {
    const now = new Date().toISOString();
    const field = (currentMatch.parte2_inicio && !currentMatch.parte2_fim) ? 'parte2_fim' : 'parte1_fim';
    const { error } = await supabase.from('matches').update({ [field]: now }).eq('id', currentMatchId);
    if (error) { alert(error.message); return; }
    currentMatch[field] = now;
    updatePeriodoUI();
    if (field === 'parte2_fim') loadNormalizadoReport();
  });

  el('btn-iniciar-parte2').addEventListener('click', async () => {
    const now = new Date().toISOString();
    const { error } = await supabase.from('matches').update({ parte2_inicio: now }).eq('id', currentMatchId);
    if (error) { alert(error.message); return; }
    currentMatch.parte2_inicio = now;
    updatePeriodoUI();
    reloadAllTrackers();
  });

  el('btn-recomecar-jogo').addEventListener('click', async () => {
    if (!confirm('Recomeçar o jogo? Isto limpa o início/fim da 1ª e 2ª parte (os dados dos jogadores e do registo não são apagados).')) return;
    const reset = { parte1_inicio: null, parte1_fim: null, parte2_inicio: null, parte2_fim: null };
    const { error } = await supabase.from('matches').update(reset).eq('id', currentMatchId);
    if (error) { alert(error.message); return; }
    Object.assign(currentMatch, reset);
    updatePeriodoUI();
    reloadAllTrackers();
    el('normalizado-card').hidden = true;
  });
}

// ---------- Topo (equipa/jogo atual, sair, trocar de jogo/equipa) ----------

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
      if (btn.dataset.tab === 'relatorios') { loadReports(); loadNormalizadoReport(); }
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

const STAT_ACTIONS = new Set(['toggle-amarelo', 'toggle-amarelo2', 'toggle-vermelho', 'count-assistencias', 'count-golo', 'toggle-substituicao']);

function wireConvocatoria() {
  el('btn-add-conceded').addEventListener('click', () => {
    if (isLocked() || !isPeriodoRunning()) return;
    openGoalPopup({ mode: 'conceded' });
  });

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
    if (STAT_ACTIONS.has(cell.dataset.action) && !isPeriodoRunning()) return;
    const mp = matchPlayersCache.find(x => x.id === cell.dataset.id);
    if (!mp) return;
    const decrement = e.ctrlKey || e.metaKey;

    // Golo tem fluxo próprio (popup de escolha de eventos / remoção do
    // golo mais recente) — não passa pelo patch genérico abaixo.
    if (cell.dataset.action === 'count-golo') {
      if (decrement) await removeLastGoalForPlayer(mp);
      else await openGoalPopup({ mode: 'scored', mp });
      return;
    }

    // Substituição também tem fluxo próprio: ao marcar "Saiu" um titular,
    // abre logo o popup "Quem entra?" com os suplentes disponíveis, para
    // não teres de procurar o suplente certo na tabela à parte.
    if (cell.dataset.action === 'toggle-substituicao') {
      const target = mp.estado === 'Titular' ? 'Saiu' : 'Entrou';
      const newValue = mp.substituicao === target ? null : target;
      await setSubstituicao(mp, newValue);
      if (newValue === 'Saiu') {
        showEntrouPopup(e.clientX, e.clientY, async (subMpId) => {
          const subMp = matchPlayersCache.find(x => x.id === subMpId);
          if (subMp) await setSubstituicao(subMp, 'Entrou');
        });
      }
      return;
    }

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
      if (!isPeriodoRunning()) return;
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
    if (!isPeriodoRunning()) return;
    const mp = matchPlayersCache.find(x => x.id === cell.dataset.id);
    if (!mp) return;

    if (cell.dataset.action === 'count-golo') {
      await removeLastGoalForPlayer(mp);
      return;
    }

    mp.assistencias = Math.max(0, (mp.assistencias || 0) - 1);
    renderMatchPlayers();
    await Promise.all([
      supabase.from('match_players').update({ assistencias: mp.assistencias }).eq('id', mp.id),
      logPlayerActions(mp, { assistencias: mp.assistencias })
    ]);
  });

  // Número específico do jogo — editável sempre que a convocatória o for
  // (mesma janela do Estado/remover: até o jogo terminar, não só antes de
  // começar), para corrigir um jogador cedido ou com camisola diferente.
  el('players-body').addEventListener('change', async (e) => {
    const input = e.target.closest('.match-numero-input');
    if (!input) return;
    if (isLocked()) return;
    const mp = matchPlayersCache.find(x => x.id === input.dataset.id);
    if (!mp) return;
    const numero = input.value.trim();
    mp.numero = numero || null;
    const { error } = await supabase.from('match_players').update({ numero: numero || null }).eq('id', mp.id);
    if (error) { alert(error.message); return; }
  });
  el('players-body').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('match-numero-input')) e.target.blur();
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
  // applyLockState() já corre no init() (via updatePeriodoUI()), mas antes
  // desta função — nessa altura #players-body ainda está vazio, por isso o
  // estado visual de bloqueio (opacidade/disabled) nunca chegava a aplicar-se
  // às linhas, num jogo já terminado (a edição em si já ficava bloqueada
  // pelos isLocked() em cada handler, só o aspeto visual é que não refletia).
  applyLockState();
}

// O número específico do jogo (mp.numero) sobrepõe-se ao número de base
// do Plantel (mp.players.numero) só nesse jogo — ver migração
// supabase/migrations/019_match_players_numero.sql.
function matchPlayerNumero(mp) {
  return mp.numero || mp.players?.numero || '';
}

function sortedMatchPlayers() {
  return [...matchPlayersCache].sort((a, b) => {
    const na = parseInt(matchPlayerNumero(a), 10);
    const nb = parseInt(matchPlayerNumero(b), 10);
    if (isNaN(na) && isNaN(nb)) return 0;
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return na - nb;
  });
}

// Está em campo neste preciso momento: titular que ainda não saiu, ou
// suplente que já entrou. Usado tanto no badge "Em Campo" (renderMatchPlayers())
// como para filtrar quem aparece no popup "Quem fez?" (onFieldMatchPlayers()).
function isOnField(mp) {
  // Vermelho (direto ou por 2º amarelo, que já marca vermelho=1 sozinho —
  // ver toggle-amarelo/toggle-amarelo2) tira sempre o jogador de campo,
  // independentemente de Estado/Substituição.
  if (mp.vermelho) return false;
  return mp.estado === 'Titular' ? mp.substituicao !== 'Saiu' : mp.substituicao === 'Entrou';
}

function renderMatchPlayers() {
  const body = el('players-body');
  body.innerHTML = '';
  const sorted = sortedMatchPlayers();
  sorted.forEach(mp => {
    const estado = mp.estado || 'Suplente';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="wellness-edit-input match-numero-input" data-id="${mp.id}" value="${mp.numero || ''}" maxlength="3" placeholder="${mp.players?.numero || '—'}" title="Número deste jogo — em branco usa o número do Plantel (${mp.players?.numero || 'nenhum definido'})"></td>
      <td>${mp.players?.nome || ''}</td>
      <td><span class="badge-estado ${estado === 'Titular' ? 'titular' : ''}" data-action="toggle-estado" data-id="${mp.id}">${estado}</span></td>
      <td><span class="badge-oncampo ${isOnField(mp) ? 'on' : ''}" title="Calculado a partir do Estado e da Substituição — não é clicável.">${isOnField(mp) ? 'Em campo' : 'Banco'}</span></td>
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

// ---------- Jogador (liga, opcionalmente, cada clique do Registo de Jogo a um jogador) ----------

function playerLabel(mp) {
  const numero = matchPlayerNumero(mp);
  return `${numero ? numero + ' ' : ''}${mp.players?.nome || ''}`.trim();
}

function playerLabelById(playerId) {
  if (!playerId) return '';
  const mp = matchPlayersCache.find(x => x.player_id === playerId);
  return mp ? playerLabel(mp) : '';
}

function playerOptionsHtml(selectedId) {
  const options = sortedMatchPlayers().map(mp =>
    `<option value="${mp.player_id}" ${selectedId === mp.player_id ? 'selected' : ''}>${playerLabel(mp)}</option>`
  ).join('');
  return `<option value="" ${!selectedId ? 'selected' : ''}>—</option>${options}`;
}

// ---------- Golos (ligados a eventos do Registo de Jogo) ----------
//
// Cada golo é o seu próprio registo em "goals" (não só o número em
// match_players.golo, que continua a existir e é atualizado em paralelo) —
// permite ligar um ou mais eventos (ex: um cruzamento e o remate que
// resultou em golo) via "events.goal_id". Ver supabase/migrations/021_goals.sql.

async function loadGoals() {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('match_id', currentMatchId)
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return; }
  goalsCache = data || [];

  const { data: linked, error: linkedError } = await supabase
    .from('events')
    .select('*')
    .eq('match_id', currentMatchId)
    .not('goal_id', 'is', null);
  if (linkedError) { console.error(linkedError); return; }
  goalEventsCache = linked || [];

  renderGoalsList();
  renderConcededList();
  renderScore();
}

// Resultado (marcados x sofridos) — sempre calculado a partir de "goals",
// nunca guardado à parte, para nunca poder desalinhar do que está nas
// duas listas por baixo.
function renderScore() {
  el('score-marcados').textContent = goalsCache.filter(g => g.tipo !== 'sofrido').length;
  el('score-sofridos').textContent = goalsCache.filter(g => g.tipo === 'sofrido').length;
}

function eventLabel(e) {
  const cfg = trackerCfgById(e.tracker_id);
  const tipoLabel = cfg ? (e.tipo === 'X' ? cfg.xLabel : cfg.yLabel) : e.tipo;
  const title = cfg ? cfg.title : e.tracker_id;
  return { title, tipoLabel };
}

// Versão em texto simples de eventLabel(), para a secção de golos do CSV
// exportado (wireDownloadSession()) — sem HTML, como a cadeia mostrada em
// goalChainHtml().
function eventCsvLabel(e) {
  const { title, tipoLabel } = eventLabel(e);
  const jogador = e.player_id ? playerLabelById(e.player_id) : '';
  const minutoTxt = e.minuto != null ? `${e.minuto}' ` : '';
  return `${minutoTxt}${title} — ${tipoLabel}${jogador ? ' (' + jogador + ')' : ''}`;
}

function goalChainHtml(g) {
  const evs = goalEventsCache
    .filter(e => e.goal_id === g.id)
    .sort((a, b) => (a.minuto ?? 0) - (b.minuto ?? 0) || new Date(a.created_at) - new Date(b.created_at));
  return evs.length
    ? evs.map(e => {
        const { title, tipoLabel } = eventLabel(e);
        const jogador = e.player_id ? playerLabelById(e.player_id) : '';
        return `<span class="ev-tag tipo-${e.tipo}">${title} — ${tipoLabel}${jogador ? ' (' + jogador + ')' : ''}</span>`;
      }).join('<span class="arrow">→</span>')
    : '<span class="none">sem eventos associados</span>';
}

// O mais recente primeiro (pelo minuto do jogo; created_at como desempate,
// ex. dois golos sem minuto marcado) — mais fácil encontrar/escolher o
// golo que acabaste de marcar, sem teres de percorrer a lista toda.
function sortGoalsRecentFirst(goals) {
  return [...goals].sort((a, b) => {
    const am = a.minuto ?? -1;
    const bm = b.minuto ?? -1;
    if (bm !== am) return bm - am;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

function renderGoalsList() {
  const list = el('goals-list');
  list.innerHTML = '';
  const goals = sortGoalsRecentFirst(goalsCache.filter(g => g.tipo !== 'sofrido'));
  el('goals-empty').hidden = goals.length > 0;

  goals.forEach(g => {
    const mp = matchPlayersCache.find(x => x.player_id === g.player_id);
    const row = document.createElement('div');
    row.className = 'goal-row';
    row.innerHTML = `
      <div class="goal-min">${g.minuto != null ? g.minuto + "'" : '—'}</div>
      <div class="goal-main">
        <div class="goal-scorer">⚽ ${mp ? playerLabel(mp) : '—'}</div>
        <div class="goal-chain">${goalChainHtml(g)}</div>
      </div>
      <button class="action small" data-edit-goal="${g.id}">Editar eventos</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('[data-edit-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const goal = goalsCache.find(x => x.id === btn.dataset.editGoal);
      if (!goal) return;
      const mp = matchPlayersCache.find(x => x.player_id === goal.player_id);
      if (mp) openGoalPopup({ mode: 'scored', mp, existingGoal: goal });
    });
  });
}

// Golo sofrido: mesma lógica, sem "marcador" — a app não tem lista de
// jogadores do adversário, por isso não há um ⚽ por jogador para clicar.
// "+ Golo sofrido" abre o mesmo popup, e "Remover" apaga diretamente
// (não há linha de convocado onde fazer clique direito/Ctrl+clique).
function renderConcededList() {
  const list = el('conceded-list');
  list.innerHTML = '';
  const conceded = sortGoalsRecentFirst(goalsCache.filter(g => g.tipo === 'sofrido'));
  el('conceded-empty').hidden = conceded.length > 0;

  conceded.forEach(g => {
    const row = document.createElement('div');
    row.className = 'goal-row sofrido';
    row.innerHTML = `
      <div class="goal-min">${g.minuto != null ? g.minuto + "'" : '—'}</div>
      <div class="goal-main">
        <div class="goal-scorer">🥅 Golo sofrido</div>
        <div class="goal-chain">${goalChainHtml(g)}</div>
      </div>
      <div class="goal-actions">
        <button class="action small" data-edit-conceded="${g.id}">Editar eventos</button>
        <button class="action small danger-outline" data-remove-conceded="${g.id}">Remover</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('[data-edit-conceded]').forEach(btn => {
    btn.addEventListener('click', () => {
      const goal = goalsCache.find(x => x.id === btn.dataset.editConceded);
      if (goal) openGoalPopup({ mode: 'conceded', existingGoal: goal });
    });
  });
  list.querySelectorAll('[data-remove-conceded]').forEach(btn => {
    btn.addEventListener('click', () => removeConcededGoal(btn.dataset.removeConceded));
  });
}

async function removeConcededGoal(goalId) {
  const { error } = await supabase.from('goals').delete().eq('id', goalId);
  if (error) { alert(error.message); return; }
  await loadGoals();
  reloadAllTrackers();
}

let goalPopupOverlay = null;
let goalPopupSelected = new Set();
let goalPopupMode = 'scored';
let goalPopupTargetMp = null;
let goalPopupEditingGoal = null;

function closeGoalPopup() {
  if (goalPopupOverlay) { goalPopupOverlay.remove(); goalPopupOverlay = null; }
  goalPopupTargetMp = null;
  goalPopupEditingGoal = null;
  goalPopupSelected = new Set();
}

// Abre o popup de escolha de eventos — a marcar um golo novo (existingGoal
// omitido) ou a editar os eventos de um golo já registado. mode: 'scored'
// (com mp, o marcador) ou 'conceded' (golo sofrido, sem jogador).
async function openGoalPopup({ mode, mp, existingGoal }) {
  closeGoalPopup();
  goalPopupMode = mode;
  goalPopupTargetMp = mp || null;
  goalPopupEditingGoal = existingGoal || null;
  goalPopupSelected = existingGoal
    ? new Set(goalEventsCache.filter(e => e.goal_id === existingGoal.id).map(e => e.id))
    : new Set();

  const parte = existingGoal ? existingGoal.parte : currentParte();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('match_id', currentMatchId)
    .eq('parte', parte)
    .order('created_at', { ascending: false });
  if (error) { alert(error.message); return; }
  const candidates = data || [];

  const minuto = existingGoal ? existingGoal.minuto : currentMinutoNoJogo();
  const title = mode === 'conceded'
    ? `Golo sofrido${minuto != null ? ' — ' + minuto + "'" : ''}`
    : `Golo de ${playerLabel(mp)}${minuto != null ? ' — ' + minuto + "'" : ''}`;

  const chipsHtml = candidates.map(e => {
    const { title: trackerTitle, tipoLabel } = eventLabel(e);
    const jogador = e.player_id ? playerLabelById(e.player_id) : 'sem jogador atribuído';
    const eventMinuto = e.minuto != null ? `${e.minuto}'` : '—';
    return `
      <div class="goal-chip${goalPopupSelected.has(e.id) ? ' selected' : ''}" data-event-id="${e.id}">
        <span class="chip-check">✓</span>
        <span class="chip-min">${eventMinuto}</span>
        <span class="chip-body">
          <span class="chip-tracker tipo-${e.tipo}">${trackerTitle} — ${tipoLabel}</span><br>
          <span class="chip-player">${jogador}</span>
        </span>
      </div>
    `;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'goal-overlay';
  overlay.innerHTML = `
    <div class="goal-popup">
      <div>
        <div class="goal-popup-title">${title}</div>
        <div class="goal-popup-sub">Que eventos contribuíram para este golo? Opcional — podes confirmar sem escolher nenhum.</div>
      </div>
      <div class="goal-chip-list">${chipsHtml}</div>
      ${candidates.length ? '' : '<div class="goal-popup-empty">Ainda não há eventos registados nesta parte.</div>'}
      <div class="goal-popup-actions">
        <button class="action" data-action="goal-cancel">Cancelar</button>
        <button class="action" data-action="goal-confirm">${existingGoal ? 'Guardar' : (mode === 'conceded' ? 'Confirmar golo sofrido' : 'Confirmar golo')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  goalPopupOverlay = overlay;

  overlay.querySelectorAll('.goal-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.eventId;
      if (goalPopupSelected.has(id)) goalPopupSelected.delete(id);
      else goalPopupSelected.add(id);
      chip.classList.toggle('selected');
    });
  });
  overlay.querySelector('[data-action="goal-cancel"]').addEventListener('click', closeGoalPopup);
  overlay.querySelector('[data-action="goal-confirm"]').addEventListener('click', confirmGoal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeGoalPopup(); });
}

async function confirmGoal() {
  const mp = goalPopupTargetMp;
  const editing = goalPopupEditingGoal;
  const selectedIds = Array.from(goalPopupSelected);

  if (editing) {
    const previouslyLinked = goalEventsCache.filter(e => e.goal_id === editing.id).map(e => e.id);
    const toUnlink = previouslyLinked.filter(id => !goalPopupSelected.has(id));
    const toLink = selectedIds.filter(id => !previouslyLinked.includes(id));

    if (toUnlink.length) {
      const { error } = await supabase.from('events').update({ goal_id: null }).in('id', toUnlink);
      if (error) { alert(error.message); return; }
    }
    if (toLink.length) {
      const { error } = await supabase.from('events').update({ goal_id: editing.id }).in('id', toLink);
      if (error) { alert(error.message); return; }
    }
    closeGoalPopup();
    await loadGoals();
    reloadAllTrackers();
    return;
  }

  if (goalPopupMode === 'conceded') {
    const { data: goal, error } = await supabase.from('goals').insert({
      user_id: currentUser.id,
      team_id: currentTeamId,
      match_id: currentMatchId,
      tipo: 'sofrido',
      parte: currentParte(),
      minuto: currentMinutoNoJogo()
    }).select().single();
    if (error) { alert(error.message); return; }

    if (selectedIds.length) {
      const { error: linkError } = await supabase.from('events').update({ goal_id: goal.id }).in('id', selectedIds);
      if (linkError) { alert(linkError.message); return; }
    }

    closeGoalPopup();
    await loadGoals();
    reloadAllTrackers();
    return;
  }

  const { data: goal, error } = await supabase.from('goals').insert({
    user_id: currentUser.id,
    team_id: currentTeamId,
    match_id: currentMatchId,
    tipo: 'marcado',
    player_id: mp.player_id,
    parte: currentParte(),
    minuto: currentMinutoNoJogo()
  }).select().single();
  if (error) { alert(error.message); return; }

  if (selectedIds.length) {
    const { error: linkError } = await supabase.from('events').update({ goal_id: goal.id }).in('id', selectedIds);
    if (linkError) { alert(linkError.message); return; }
  }

  mp.golo = Math.max(0, (mp.golo || 0) + 1);
  renderMatchPlayers();
  await Promise.all([
    supabase.from('match_players').update({ golo: mp.golo }).eq('id', mp.id),
    logPlayerActions(mp, { golo: mp.golo })
  ]);

  closeGoalPopup();
  await loadGoals();
  reloadAllTrackers();
}

// Clique direito / Ctrl+clique no ⚽ — remove o golo mais recente desse
// jogador (e desliga os eventos que lhe estavam associados, via "on delete
// set null" em events.goal_id). Sem golo nenhum registado em "goals" (ex:
// contador ajustado antes desta funcionalidade existir), só desce o número.
async function removeLastGoalForPlayer(mp) {
  const goals = goalsCache
    .filter(g => g.player_id === mp.player_id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const last = goals[0];

  if (last) {
    const { error } = await supabase.from('goals').delete().eq('id', last.id);
    if (error) { alert(error.message); return; }
  }

  mp.golo = Math.max(0, (mp.golo || 0) - 1);
  renderMatchPlayers();
  await Promise.all([
    supabase.from('match_players').update({ golo: mp.golo }).eq('id', mp.id),
    logPlayerActions(mp, { golo: mp.golo })
  ]);

  if (last) {
    await loadGoals();
    reloadAllTrackers();
  }
}

let jogadorPopupEl = null;
let jogadorPopupOutsideHandler = null;

function closeJogadorPopup() {
  if (jogadorPopupEl) { jogadorPopupEl.remove(); jogadorPopupEl = null; }
  if (jogadorPopupOutsideHandler) {
    document.removeEventListener('pointerdown', jogadorPopupOutsideHandler, true);
    jogadorPopupOutsideHandler = null;
  }
}

// Quem está em campo neste momento: titulares que não saíram, mais
// suplentes que já entraram — mantém a lista do popup à volta de 11,
// em vez dos convocados todos (banco incluído).
function onFieldMatchPlayers() {
  const sorted = sortedMatchPlayers();
  const onField = sorted.filter(isOnField);
  return onField.length ? onField : sorted;
}

// Mostra, junto ao ponto clicado, um popup para (opcionalmente) escolher
// quem fez a ação; onPick(playerId) só é chamado se se tocar num jogador.
function showJogadorPopup(clientX, clientY, onPick) {
  closeJogadorPopup();
  const players = onFieldMatchPlayers();
  if (!players.length) return;

  const popup = document.createElement('div');
  popup.className = 'jogador-popup';
  const chips = players.map(mp =>
    `<button type="button" class="jogador-num-chip" data-player-id="${mp.player_id}" title="${playerLabel(mp)}" aria-label="${playerLabel(mp)}">${matchPlayerNumero(mp) || '?'}</button>`
  ).join('');
  popup.innerHTML = `<div class="jogador-popup-title">Quem fez?</div><div class="jogador-popup-chips">${chips}</div>`;
  document.body.appendChild(popup);

  const rect = popup.getBoundingClientRect();
  const left = Math.min(Math.max(8, clientX - rect.width / 2), window.innerWidth - rect.width - 8);
  const top = Math.min(Math.max(8, clientY + 16), window.innerHeight - rect.height - 8);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  popup.addEventListener('click', (e) => {
    const btn = e.target.closest('.jogador-num-chip');
    if (!btn) return;
    onPick(btn.dataset.playerId);
    closeJogadorPopup();
  });

  jogadorPopupEl = popup;
  jogadorPopupOutsideHandler = (e) => {
    if (!popup.contains(e.target)) closeJogadorPopup();
  };
  setTimeout(() => document.addEventListener('pointerdown', jogadorPopupOutsideHandler, true), 0);
}

// Grava a substituição de um jogador (usado tanto pelo clique direto no
// badge como pelo popup "Quem entra?" a seguir a marcar alguém "Saiu").
async function setSubstituicao(mp, value) {
  const patch = { substituicao: value };
  Object.assign(mp, patch);
  renderMatchPlayers();
  await Promise.all([
    supabase.from('match_players').update(patch).eq('id', mp.id),
    logPlayerActions(mp, patch)
  ]);
}

// Suplentes que ainda não entraram — candidatos a "quem entra" a seguir a
// um titular sair.
function availableSubstitutes() {
  return sortedMatchPlayers().filter(mp => mp.estado === 'Suplente' && mp.substituicao !== 'Entrou' && !mp.vermelho);
}

// Mesmo padrão do showJogadorPopup() acima, mas para escolher rapidamente
// quem entra depois de marcares um titular como "Saiu" — poupa ter de
// procurar o suplente certo na tabela e clicar no badge dele à parte.
function showEntrouPopup(clientX, clientY, onPick) {
  closeJogadorPopup();
  const players = availableSubstitutes();
  if (!players.length) return;

  const popup = document.createElement('div');
  popup.className = 'jogador-popup';
  const chips = players.map(mp =>
    `<button type="button" class="jogador-num-chip" data-mp-id="${mp.id}" title="${playerLabel(mp)}" aria-label="${playerLabel(mp)}">${matchPlayerNumero(mp) || '?'}</button>`
  ).join('');
  popup.innerHTML = `<div class="jogador-popup-title">Quem entra?</div><div class="jogador-popup-chips">${chips}</div>`;
  document.body.appendChild(popup);

  const rect = popup.getBoundingClientRect();
  const left = Math.min(Math.max(8, clientX - rect.width / 2), window.innerWidth - rect.width - 8);
  const top = Math.min(Math.max(8, clientY + 16), window.innerHeight - rect.height - 8);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  popup.addEventListener('click', (e) => {
    const btn = e.target.closest('.jogador-num-chip');
    if (!btn) return;
    onPick(btn.dataset.mpId);
    closeJogadorPopup();
  });

  jogadorPopupEl = popup;
  jogadorPopupOutsideHandler = (e) => {
    if (!popup.contains(e.target)) closeJogadorPopup();
  };
  setTimeout(() => document.addEventListener('pointerdown', jogadorPopupOutsideHandler, true), 0);
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
        <img src="../assets/campo.png" alt="Campo de futebol" class="field-img" draggable="false">
      </div>
      <div class="actions">
        <button class="action" data-action="undo">Desfazer último</button>
        <button class="action danger" data-action="clear">Limpar tudo</button>
      </div>
      <div class="log">
        <table>
          <thead>
            <tr><th>#</th><th>Tipo</th><th>X (%)</th><th>Y (%)</th><th>Minuto</th><th>Jogador</th></tr>
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
    marker.className = 'marker ' + click.tipo + (click.goal_id ? ' golo' : '');
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
      if (c.goal_id) tr.classList.add('log-row-golo');
      const minuto = c.minuto != null ? `${c.minuto}'` : '—';
      tr.innerHTML = `<td>${i + 1}</td><td class="tipo-${c.tipo}">${c.tipo}</td><td>${c.x_pct}</td><td>${c.y_pct}</td><td>${minuto}</td><td><select class="log-player-select" data-event-id="${c.id}">${playerOptionsHtml(c.player_id)}</select></td>`;
      logBody.appendChild(tr);
    });
    logBody.parentElement.parentElement.scrollTop = logBody.parentElement.parentElement.scrollHeight;
  }

  logBody.addEventListener('change', async (e) => {
    const select = e.target.closest('.log-player-select');
    if (!select) return;
    const eventId = select.dataset.eventId;
    const click = clicks.find(c => c.id === eventId);
    if (!click) return;
    const newPlayerId = select.value || null;
    click.player_id = newPlayerId;
    await supabase.from('events').update({ player_id: newPlayerId }).eq('id', eventId);
  });

  async function reload() {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('match_id', currentMatchId)
      .eq('tracker_id', cfg.id)
      .eq('parte', currentParte())
      .order('created_at', { ascending: true });
    if (error) { console.error(error); return; }
    clicks = data || [];
    renderAll();
  }

  async function addClick(x_pct, y_pct, clientX, clientY) {
    if (isLocked() || !isPeriodoRunning()) return;
    const row = {
      user_id: currentUser.id,
      team_id: currentTeamId,
      match_id: currentMatchId,
      tracker_id: cfg.id,
      parte: currentParte(),
      minuto: currentMinutoNoJogo(),
      tipo: mode,
      x_pct: Number(x_pct.toFixed(2)),
      y_pct: Number(y_pct.toFixed(2))
    };
    const { data, error } = await supabase.from('events').insert(row).select().single();
    if (error) { alert(error.message); return; }
    clicks.push(data);
    renderAll();

    if (clientX != null && clientY != null) {
      showJogadorPopup(clientX, clientY, async (playerId) => {
        data.player_id = playerId;
        renderAll();
        await supabase.from('events').update({ player_id: playerId }).eq('id', data.id);
      });
    }
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
    addClick(x_pct, y_pct, e.clientX, e.clientY);
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
    if (!confirm(`Apagar todos os pontos registados de "${cfg.title}" nesta parte do jogo?`)) return;
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

// ---------- Registo de Jogo normalizado (1ª + 2ª parte juntas, fim de jogo) ----------

let normalizadoBuilt = false;
let normalizadoPointsCache = {};

// Mapa de calor por zonas: usa zona_col/zona_row já calculados pela view
// events_normalizado (grelha 6×4, definida em SQL — ver
// supabase/migrations/013_events_zona.sql) em vez de recalcular no
// browser, para a definição de "zona" viver num único sítio.
const HEATMAP_COLS = 6;
const HEATMAP_ROWS = 4;

// Cada campo do registo normalizado passa a mostrar 3 mapas lado a lado:
// só a 1ª parte, só a 2ª parte, e a junção das duas. Como a view
// events_normalizado já roda os pontos da parte que atacou "ao contrário"
// (ver supabase/migrations/009_events_normalizado.sql), a equipa ataca
// sempre da esquerda para a direita nos 3 — daí a seta de orientação fixa
// (attackArrowHtml) ser sempre "→", igual nos 3 mapas.
const NORMALIZADO_PARTES = [
  { key: '1', label: '1ª Parte', filter: (p) => p.parte === 1 },
  { key: '2', label: '2ª Parte', filter: (p) => p.parte === 2 },
  { key: 'all', label: 'Ambas as Partes', filter: () => true },
];

// extraClass 'arrow-live-field' marca a seta do campo interativo, que tem
// de desaparecer na impressão junto com ".screen-field" (ver @media print
// em css/styles.css) — ao contrário das setas dos pares X/Y só de
// impressão, que já não têm essa marca e por isso ficam sempre visíveis no
// PDF. NÃO reutilizar a classe "screen-field" aqui: partBlock.querySelector
// ('.screen-field') (usado para saber onde desenhar os pontos) apanharia
// esta seta em vez do campo, porque vem antes dele no HTML — os pontos
// ficavam então "soltos" pela página inteira (a seta não é position:
// relative, ao contrário de ".field-wrap").
function attackArrowHtml(extraClass) {
  const cls = extraClass ? `attack-arrow ${extraClass}` : 'attack-arrow';
  return `<div class="${cls}" title="Mapa normalizado: a equipa ataca sempre da esquerda para a direita">Ataque →</div>`;
}

function buildHeatGrid(points) {
  const counts = Array.from({ length: HEATMAP_ROWS }, () => Array(HEATMAP_COLS).fill(0));
  points.forEach(p => { counts[p.zona_row][p.zona_col]++; });
  return counts;
}

function renderHeatGrid(container, counts) {
  container.innerHTML = '';
  const max = Math.max(1, ...counts.flat());
  counts.forEach((rowArr, row) => {
    rowArr.forEach((count, col) => {
      const cell = document.createElement('div');
      cell.className = 'heat-cell';
      cell.style.left = `${(col / HEATMAP_COLS) * 100}%`;
      cell.style.top = `${(row / HEATMAP_ROWS) * 100}%`;
      cell.style.width = `${100 / HEATMAP_COLS}%`;
      cell.style.height = `${100 / HEATMAP_ROWS}%`;
      if (count > 0) {
        const intensity = count / max;
        cell.style.background = `rgba(229, 57, 53, ${(0.15 + intensity * 0.65).toFixed(2)})`;
        cell.title = `${count} ponto${count === 1 ? '' : 's'}`;
        cell.textContent = count;
      }
      container.appendChild(cell);
    });
  });
}

// Markup de um dos 3 mapas (1ª parte / 2ª parte / ambas) de um campo:
// vista interativa (screen-field, com toggle Pontos/Mapa de Calor) +
// par X/Y só para impressão (print-heat-pair, ver prepareReportForPrint).
function buildPartBlockHtml(cfg, partKey, partLabel) {
  return `
    <div class="tracker-part" data-parte="${partKey}">
      <h3 class="part-title">${partLabel}</h3>
      <div class="toolbar view-toolbar">
        <button class="action view-btn active" data-view="pontos">Pontos</button>
        <button class="action view-btn" data-view="calor">Mapa de Calor</button>
      </div>
      <div class="toolbar heat-tipo-toolbar" hidden>
        <button class="action heat-tipo-btn active" data-tipo="X">${cfg.xLabel}</button>
        <button class="action heat-tipo-btn" data-tipo="Y">${cfg.yLabel}</button>
      </div>
      <div class="counters">
        <div class="counter x"><span class="num" data-count="X">0</span>${cfg.xLabel}</div>
        <div class="counter y"><span class="num" data-count="Y">0</span>${cfg.yLabel}</div>
      </div>
      ${attackArrowHtml('arrow-live-field')}
      <div class="field-wrap screen-field">
        <img src="../assets/campo.png" alt="Campo de futebol" class="field-img" draggable="false">
        <div class="heat-grid" hidden></div>
      </div>
      <div class="print-heat-pair">
        <div class="print-heat-col">
          <p class="print-heat-label">${cfg.xLabel}</p>
          ${attackArrowHtml()}
          <div class="field-wrap">
            <img src="../assets/campo.png" alt="Campo de futebol" class="field-img" draggable="false">
            <div class="heat-grid print-heat-grid" data-tipo="X"></div>
          </div>
        </div>
        <div class="print-heat-col">
          <p class="print-heat-label">${cfg.yLabel}</p>
          ${attackArrowHtml()}
          <div class="field-wrap">
            <img src="../assets/campo.png" alt="Campo de futebol" class="field-img" draggable="false">
            <div class="heat-grid print-heat-grid" data-tipo="Y"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Recalcula e mostra o mapa de calor de uma das 3 partes de um campo,
// filtrado ao tipo (X/Y) atualmente selecionado nesse bloco — cantos "A
// Favor" e "Contra", por exemplo, não podem ser misturados no mesmo mapa.
function renderPartHeat(partBlock, cfg) {
  const partDef = NORMALIZADO_PARTES.find(p => p.key === partBlock.dataset.parte);
  const tipo = partBlock.dataset.heatTipo || 'X';
  const points = (normalizadoPointsCache[cfg.id] || []).filter(partDef.filter).filter(p => p.tipo === tipo);
  renderHeatGrid(partBlock.querySelector('.field-wrap.screen-field .heat-grid'), buildHeatGrid(points));
}

function buildNormalizadoSections() {
  const page = el('normalizado-page');
  page.innerHTML = '';
  TRACKERS.forEach(cfg => {
    const section = document.createElement('section');
    section.className = 'tracker';
    section.dataset.tracker = cfg.id;
    section.innerHTML = `
      <h2 class="tracker-title">${cfg.title}</h2>
      <div class="tracker-parts">
        ${NORMALIZADO_PARTES.map(part => buildPartBlockHtml(cfg, part.key, part.label)).join('')}
      </div>
      <div class="log">
        <table>
          <thead>
            <tr><th>#</th><th>Parte</th><th>Tipo</th><th>Minuto</th><th>Jogador</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;
    page.appendChild(section);

    section.querySelectorAll('.tracker-part').forEach(partBlock => {
      partBlock.dataset.heatTipo = 'X';

      partBlock.querySelector('.view-toolbar').addEventListener('click', (e) => {
        const btn = e.target.closest('.view-btn');
        if (!btn) return;
        partBlock.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
        const showHeat = btn.dataset.view === 'calor';
        partBlock.querySelectorAll('.marker').forEach(m => { m.style.display = showHeat ? 'none' : ''; });
        partBlock.querySelector('.field-wrap.screen-field .heat-grid').hidden = !showHeat;
        partBlock.querySelector('.heat-tipo-toolbar').hidden = !showHeat;
        if (showHeat) renderPartHeat(partBlock, cfg);
      });

      partBlock.querySelector('.heat-tipo-toolbar').addEventListener('click', (e) => {
        const btn = e.target.closest('.heat-tipo-btn');
        if (!btn) return;
        partBlock.querySelectorAll('.heat-tipo-btn').forEach(b => b.classList.toggle('active', b === btn));
        partBlock.dataset.heatTipo = btn.dataset.tipo;
        renderPartHeat(partBlock, cfg);
      });
    });

    section.querySelector('tbody').addEventListener('change', async (e) => {
      const select = e.target.closest('.log-player-select');
      if (!select) return;
      const eventId = select.dataset.eventId;
      const newPlayerId = select.value || null;
      await supabase.from('events').update({ player_id: newPlayerId }).eq('id', eventId);
    });
  });
  normalizadoBuilt = true;
}

async function loadNormalizadoReport() {
  const card = el('normalizado-card');
  if (!isLocked()) { card.hidden = true; return; }
  card.hidden = false;
  if (!normalizadoBuilt) buildNormalizadoSections();

  const { data, error } = await supabase
    .from('events_normalizado')
    .select('*')
    .eq('match_id', currentMatchId)
    .order('created_at', { ascending: true });
  el('normalizado-error').hidden = !error;
  if (error) { console.error(error); return; }

  normalizadoPointsCache = {};

  TRACKERS.forEach(cfg => {
    const section = document.querySelector(`#normalizado-page section[data-tracker="${cfg.id}"]`);
    const points = (data || []).filter(p => p.tracker_id === cfg.id);
    normalizadoPointsCache[cfg.id] = points;

    NORMALIZADO_PARTES.forEach(part => {
      const partBlock = section.querySelector(`.tracker-part[data-parte="${part.key}"]`);
      const fieldWrap = partBlock.querySelector('.field-wrap.screen-field');
      const showHeat = partBlock.querySelector('.view-btn[data-view="calor"]').classList.contains('active');
      fieldWrap.querySelectorAll('.marker').forEach(m => m.remove());
      const partPoints = points.filter(part.filter);
      partPoints.forEach(p => {
        const marker = document.createElement('div');
        marker.className = 'marker ' + p.tipo + (p.goal_id ? ' golo' : '');
        marker.style.left = p.x_pct_normalizado + '%';
        marker.style.top = p.y_pct_normalizado + '%';
        marker.style.display = showHeat ? 'none' : '';
        marker.textContent = p.tipo;
        fieldWrap.appendChild(marker);
      });
      partBlock.querySelector('[data-count="X"]').textContent = partPoints.filter(p => p.tipo === 'X').length;
      partBlock.querySelector('[data-count="Y"]').textContent = partPoints.filter(p => p.tipo === 'Y').length;
      if (showHeat) renderPartHeat(partBlock, cfg);
    });

    const logBody = section.querySelector('tbody');
    logBody.innerHTML = '';
    points.forEach((p, i) => {
      const tr = document.createElement('tr');
      const minuto = p.minuto != null ? `${p.minuto}'` : '—';
      tr.innerHTML = `<td>${i + 1}</td><td>${p.parte}ª</td><td class="tipo-${p.tipo}">${p.tipo}</td><td>${minuto}</td><td><select class="log-player-select" data-event-id="${p.id}">${playerOptionsHtml(p.player_id)}</select></td>`;
      logBody.appendChild(tr);
    });
  });
}

// ---------- Descarregar jogo atual (CSV) ----------

function wireDownloadSession() {
  el('btn-download-session').addEventListener('click', async () => {
    const lines = [];

    lines.push('=== JOGADORES ===');
    lines.push(['Número', 'Nome', 'Estado', 'Amarelos', 'Vermelho', 'Assistências', 'Golos', 'Substituição'].join(','));
    matchPlayersCache.forEach(mp => {
      lines.push([
        csvField(matchPlayerNumero(mp)),
        csvField(mp.players?.nome || ''),
        csvField(mp.estado || 'Suplente'),
        (mp.amarelo || 0) + (mp.amarelo2 || 0),
        mp.vermelho || 0,
        mp.assistencias || 0,
        mp.golo || 0,
        csvField(mp.substituicao ?? '')
      ].join(','));
    });

    // Golos e a que eventos cada um está ligado (events.goal_id) — usado
    // aqui em baixo nas secções GOLOS/GOLOS SOFRIDOS, e também para
    // preencher a coluna "Golo" de cada campo do Registo de Jogo.
    const { data: goalsData } = await supabase
      .from('goals')
      .select('*')
      .eq('match_id', currentMatchId)
      .order('minuto', { ascending: true });
    const goals = goalsData || [];

    const { data: linkedEventsData } = await supabase
      .from('events')
      .select('*')
      .eq('match_id', currentMatchId)
      .not('goal_id', 'is', null);
    const linkedEvents = linkedEventsData || [];

    function eventsForGoal(goalId) {
      return linkedEvents
        .filter(e => e.goal_id === goalId)
        .sort((a, b) => (a.minuto ?? 0) - (b.minuto ?? 0) || new Date(a.created_at) - new Date(b.created_at));
    }

    const goalDescByEventId = new Map();
    goals.forEach(g => {
      const mp = matchPlayersCache.find(x => x.player_id === g.player_id);
      const minutoTxt = g.minuto != null ? ` (${g.minuto}')` : '';
      const desc = g.tipo === 'sofrido' ? `Golo sofrido${minutoTxt}` : `Golo${minutoTxt}${mp ? ' - ' + playerLabel(mp) : ''}`;
      eventsForGoal(g.id).forEach(e => goalDescByEventId.set(e.id, desc));
    });

    lines.push('');
    lines.push('=== GOLOS ===');
    lines.push(['Parte', 'Minuto', 'Marcador', 'Eventos'].join(','));
    goals.filter(g => g.tipo !== 'sofrido').forEach(g => {
      const mp = matchPlayersCache.find(x => x.player_id === g.player_id);
      const chain = eventsForGoal(g.id).map(eventCsvLabel).join(' -> ');
      lines.push([g.parte ?? '', g.minuto ?? '', csvField(mp ? playerLabel(mp) : ''), csvField(chain)].join(','));
    });

    lines.push('');
    lines.push('=== GOLOS SOFRIDOS ===');
    lines.push(['Parte', 'Minuto', 'Eventos'].join(','));
    goals.filter(g => g.tipo === 'sofrido').forEach(g => {
      const chain = eventsForGoal(g.id).map(eventCsvLabel).join(' -> ');
      lines.push([g.parte ?? '', g.minuto ?? '', csvField(chain)].join(','));
    });

    for (const cfg of TRACKERS) {
      lines.push('');
      lines.push(`=== ${cfg.title.toUpperCase()} ===`);
      lines.push(['Parte', 'Minuto', 'Tipo', 'X (%)', 'Y (%)', 'Hora', 'Jogador', 'Golo'].join(','));
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('match_id', currentMatchId)
        .eq('tracker_id', cfg.id)
        .order('created_at', { ascending: true });
      (data || []).forEach(c => {
        const hora = new Date(c.created_at).toLocaleTimeString('pt-PT');
        lines.push([c.parte, c.minuto ?? '', c.tipo, c.x_pct, c.y_pct, csvField(hora), csvField(playerLabelById(c.player_id)), csvField(goalDescByEventId.get(c.id) || '')].join(','));
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

// ---------- Exportar relatório (PDF via impressão do browser) ----------

// Antes de imprimir, preenche os dois mapas de calor (X e Y) de cada uma
// das 3 partes (1ª, 2ª, Ambas) de cada campo do registo normalizado —
// independente do que estiver escolhido no ecrã, porque misturar tipos
// (ex: Ganhos e Perdas) no mesmo mapa não faz sentido, mas o PDF deve
// mostrar sempre os dois lado a lado, para as 3 partes.
function prepareReportForPrint() {
  document.querySelectorAll('#normalizado-page section.tracker').forEach(section => {
    const points = normalizadoPointsCache[section.dataset.tracker] || [];
    section.querySelectorAll('.tracker-part').forEach(partBlock => {
      const partDef = NORMALIZADO_PARTES.find(p => p.key === partBlock.dataset.parte);
      const partPoints = points.filter(partDef.filter);
      ['X', 'Y'].forEach(tipo => {
        const grid = partBlock.querySelector(`.print-heat-grid[data-tipo="${tipo}"]`);
        if (!grid) return;
        renderHeatGrid(grid, buildHeatGrid(partPoints.filter(p => p.tipo === tipo)));
      });
    });
  });
}

function wirePrintReport() {
  el('btn-print-report').addEventListener('click', () => {
    prepareReportForPrint();
    window.print();
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
  updatePrintHeader();
  wireTopBar();
  wireTabs();
  wirePeriodo();
  wireOrientacao();
  updatePeriodoUI();
  startPeriodoTimer();

  wireConvocatoria();
  buildTrackerSections();
  wireDownloadSession();
  wirePrintReport();
  applyLockState();

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession) window.location.href = 'login.html';
  });

  await loadRoster();
  await loadMatchPlayers();
  await loadGoals();
  reloadAllTrackers();
}

init();
