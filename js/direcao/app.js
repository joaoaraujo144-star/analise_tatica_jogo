/**
 * Análise de Jogo — js/direcao/app.js
 * Esqueleto do Dashboard Executivo (pages/direcao.html): sessão,
 * escolha de equipa, filtros globais e navegação entre as 6 páginas.
 * Cada página é um { titulo, render(ctx), depois?(ctx), precisaDetalhe?, carregarExtra? }
 * em PAGINAS (precisaDetalhe: carrega eventos/golos/convocados/tempos
 * dos jogos antes de desenhar; depois: corre já com o HTML no DOM, para
 * os gráficos; carregarExtra: dados da equipa que não dependem dos
 * filtros, com cache).
 *
 * Versão: 1.7 (2026-11-17)
 *
 * Histórico:
 *   1.7 — Exportar para PowerPoint (apresentacao.js + PptxGenJS do CDN,
 *         carregado só ao exportar), com os filtros atuais.
 *   1.6 — Alertas (fase 7); configuração dos indicadores
 *         (kpi_targets) lida por equipa e passada a todas as páginas
 *         (ctx.config, ctx.indicadores); resumo de qualidade dos dados
 *         passou para a página de alertas.
 *   1.5 — Gestão do Plantel (fase 6); hook carregarExtra(equipaId) para
 *         dados de página que não dependem dos filtros, com cache.
 *   1.4 — Performance Individual (fase 5).
 *   1.3 — Análise Territorial (fase 4).
 *   1.2 — Performance Coletiva (fase 3).
 *   1.1 — Executive Overview (fase 2); carregamento do detalhe com cache
 *         e proteção contra respostas fora de ordem; hook depois().
 *   1.0 — Esqueleto, filtros e navegação (fase 1).
 */

import { supabase } from '../supabase-client.js';
import { carregarEquipas, carregarJogos, carregarDetalhe, carregarTargets, carregarPlantel, carregarMinimos } from './dados.js';
import { JANELAS, filtrosIniciais, aplicarFiltros, opcoesFiltros } from './filtros.js';
import { epocaDe } from './metricas.js';
import { esc } from './ui.js';
import { destruirGraficos } from './graficos.js';
import { overview } from './paginas/overview.js';
import { coletiva } from './paginas/coletiva.js';
import { territorial } from './paginas/territorial.js';
import { individual } from './paginas/individual.js';
import { plantel } from './paginas/plantel.js';
import { alertas } from './paginas/alertas.js';
import { configuracao, indicadoresConfigurados } from './alertas.js';
import { SLIDES, prepararDados, construirApresentacao, nomeFicheiro } from './apresentacao.js';

const el = (id) => document.getElementById(id);

const estado = {
  equipas: [],
  equipaId: null,
  jogos: [],          // v_jogo_resumo da equipa (terminados, sem pré-época)
  filtros: filtrosIniciais(),
  pagina: 'overview',
  targets: [],        // kpi_targets da equipa (direção favorável e alertas)
  avisoTargets: null, // erro ao ler kpi_targets → usa os valores por omissão
};

// Direção favorável e alertas: os configurados em kpi_targets, ou os por
// omissão. Vale para todas as páginas (tendências e alertas).
async function lerTargets() {
  try {
    estado.targets = await carregarTargets(estado.equipaId);
    estado.avisoTargets = null;
  } catch (err) {
    console.warn('kpi_targets indisponível — a usar valores por omissão', err);
    estado.targets = [];
    estado.avisoTargets = err.message || String(err);
  }
}

// ---------- Páginas ----------

const PAGINAS = { overview, coletiva, territorial, individual, plantel, alertas };

// ---------- Render ----------

function preencherSelect(sel, opcoes, valor, primeira) {
  sel.innerHTML = (primeira ? `<option value="">${primeira}</option>` : '')
    + opcoes.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  sel.value = valor;
}

function renderFiltros() {
  const o = opcoesFiltros(estado.jogos);
  const f = estado.filtros;
  preencherSelect(el('f-epoca'), o.epocas.map(e => ({ value: e, label: e })), f.epoca, 'Todas');
  preencherSelect(el('f-competicao'), o.competicoes.map(c => ({ value: c, label: c })), f.competicao, 'Todas');
  preencherSelect(el('f-adversario'), o.adversarios.map(a => ({ value: a, label: a })), f.adversario, 'Todos');
  preencherSelect(el('f-janela'), JANELAS, f.janela);
  el('f-local').value = f.local;
  el('f-desde').value = f.desde;
  el('f-ate').value = f.ate;
  const intervalo = f.janela === 'intervalo';
  el('f-intervalo-desde').hidden = !intervalo;
  el('f-intervalo-ate').hidden = !intervalo;
}

function formatarData(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Detalhe (eventos, golos, convocados, tempos) dos jogos do período
// atual + anterior. Guardado por conjunto de ids, para não voltar a ir
// à base de dados ao mudar de página com os mesmos filtros; o token
// descarta respostas que chegam depois de o utilizador já ter mudado
// de filtro outra vez.
let cacheDetalhe = { chave: null, dados: null };
let tokenRender = 0;

async function obterDetalhe(jogos) {
  const ids = jogos.map(j => j.id).sort();
  const chave = ids.join(',');
  if (cacheDetalhe.chave === chave) return cacheDetalhe.dados;
  const dados = await carregarDetalhe(ids);
  cacheDetalhe = { chave, dados };
  return dados;
}

// Dados próprios de uma página que não dependem dos filtros (ex: plantel
// e mínimos por posição) — carregados uma vez por página e equipa;
// ctx.invalidarExtra() força novo carregamento depois de gravar.
const cacheExtra = new Map();

async function renderPagina() {
  const token = ++tokenRender;
  destruirGraficos();
  const { atual, anterior } = aplicarFiltros(estado.jogos, estado.filtros);
  const equipa = estado.equipas.find(e => e.id === estado.equipaId);
  const pagina = PAGINAS[estado.pagina];

  el('titulo-pagina').textContent = pagina.titulo;
  el('subtitulo').textContent = equipa
    ? `${equipa.nome}${atual.length ? ` · ${formatarData(atual[0].data)} — ${formatarData(atual[atual.length - 1].data)}` : ''}`
    : '';
  el('filtros-resumo').textContent = `${atual.length} jogo(s) no período` + (anterior.length ? ` · ${anterior.length} no período anterior` : ' · sem jogos anteriores para comparar') + ' · pré-época excluída';

  if (!estado.jogos.length) {
    el('conteudo').innerHTML = `<div class="dx-estado"><strong>Sem jogos terminados</strong>Esta equipa ainda não tem jogos terminados fora da pré-época.</div>`;
    return;
  }
  if (!atual.length) {
    el('conteudo').innerHTML = `<div class="dx-estado"><strong>Nenhum jogo com estes filtros</strong>Alarga o período ou retira algum filtro.</div>`;
    return;
  }
  const chaveExtra = `${estado.pagina}|${estado.equipaId}`;
  const ctx = {
    equipa, atual, anterior, filtros: estado.filtros, redesenhar: renderPagina,
    invalidarExtra: () => cacheExtra.delete(chaveExtra),
    recarregarConfig: lerTargets,
    avisoTargets: estado.avisoTargets,
  };
  ctx.config = configuracao(estado.targets);
  ctx.indicadores = indicadoresConfigurados(ctx.config);
  if (pagina.precisaDetalhe || pagina.carregarExtra) {
    el('conteudo').classList.add('dx-carregar');
    try {
      if (pagina.precisaDetalhe) ctx.detalhe = await obterDetalhe([...atual, ...anterior]);
      if (pagina.carregarExtra) {
        if (!cacheExtra.has(chaveExtra)) cacheExtra.set(chaveExtra, await pagina.carregarExtra(estado.equipaId));
        ctx.extra = cacheExtra.get(chaveExtra);
      }
    } catch (err) {
      console.error(err);
      if (token === tokenRender) mostrarErro('Não foi possível carregar os dados', err.message || String(err));
      return;
    } finally {
      if (token === tokenRender) el('conteudo').classList.remove('dx-carregar');
    }
    if (token !== tokenRender) return;
  }
  el('conteudo').innerHTML = pagina.render(ctx);
  pagina.depois?.(ctx);
}

function mostrarErro(titulo, detalhe) {
  el('conteudo').innerHTML = `<div class="dx-estado erro"><strong>${esc(titulo)}</strong>${esc(detalhe)}</div>`;
}

// ---------- Carregamento ----------

async function escolherEquipa(teamId) {
  estado.equipaId = teamId;
  estado.filtros = filtrosIniciais();
  el('conteudo').classList.add('dx-carregar');
  try {
    estado.jogos = await carregarJogos(teamId);
    await lerTargets();
    // Época por omissão: a mais recente com jogos (o pedido é sobre a
    // época atual; as outras continuam na dropdown).
    if (estado.jogos.length) estado.filtros.epoca = epocaDe(estado.jogos[estado.jogos.length - 1].data);
    renderFiltros();
    renderPagina();
  } catch (err) {
    console.error(err);
    // A view v_jogo_resumo só existe depois da migração 035.
    mostrarErro('Não foi possível carregar os jogos', err.message?.includes('v_jogo_resumo')
      ? 'Falta correr a migração supabase/migrations/035_direcao_desportiva.sql no SQL Editor do Supabase.'
      : err.message || String(err));
  } finally {
    el('conteudo').classList.remove('dx-carregar');
  }
}

// ---------- Exportar para PowerPoint ----------

// PptxGenJS só é carregado (do CDN) quando é preciso — não pesa nas
// páginas normais. Define o global window.PptxGenJS.
const PPTXGENJS_URL = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
let pptxPromessa = null;
function carregarPptxGenJS() {
  if (window.PptxGenJS) return Promise.resolve();
  if (!pptxPromessa) {
    pptxPromessa = new Promise((ok, falha) => {
      const sc = document.createElement('script');
      sc.src = PPTXGENJS_URL;
      sc.onload = ok;
      sc.onerror = () => { pptxPromessa = null; falha(new Error('Não foi possível carregar a biblioteca de PowerPoint (sem ligação à internet?).')); };
      document.head.appendChild(sc);
    });
  }
  return pptxPromessa;
}

// Logótipo da equipa (bucket público team-logos) em base64 para o PPTX;
// se falhar, a apresentação sai sem logótipo (iniciais na capa).
async function logoEmBase64(url) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!/^image\/(png|jpe?g|gif)$/.test(blob.type)) return null;
    const dataUrl = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
    return String(dataUrl).replace(/^data:/, '');
  } catch {
    return null;
  }
}

const CHAVE_SLIDES = 'direcao_slides_exportar';
function lerSelecaoGuardada() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_SLIDES));
    return Array.isArray(v) ? v : null;
  } catch { return null; }
}

async function exportarPowerPoint(selecao) {
  const equipa = estado.equipas.find(e => e.id === estado.equipaId);
  const { atual, anterior } = aplicarFiltros(estado.jogos, estado.filtros);
  if (!atual.length) throw new Error('Não há jogos com os filtros escolhidos.');
  const [, detalhe, plantel, minimos, logo] = await Promise.all([
    carregarPptxGenJS(),
    obterDetalhe([...atual, ...anterior]),
    carregarPlantel(equipa.id),
    carregarMinimos(equipa.id).catch(() => []),
    logoEmBase64(equipa.logo_url),
  ]);
  const config = configuracao(estado.targets);
  const dados = prepararDados({
    equipa, filtros: estado.filtros, atual, anterior, detalhe, plantel, minimos,
    config, indicadores: indicadoresConfigurados(config),
  });
  if (logo) dados.logo = logo;
  const pptx = new window.PptxGenJS();
  construirApresentacao(pptx, dados, { selecao });
  await pptx.writeFile({ fileName: nomeFicheiro(dados) });
}

function ligarExportacao() {
  const dlg = el('dlg-exportar');
  const estadoTxt = el('exportar-estado');
  el('btn-exportar').addEventListener('click', () => {
    const guardada = lerSelecaoGuardada();
    el('lista-slides').innerHTML = SLIDES.map(x => `
      <label><input type="checkbox" value="${x.id}" ${!guardada || guardada.includes(x.id) ? 'checked' : ''}> ${esc(x.titulo)}</label>`).join('');
    estadoTxt.textContent = '';
    el('btn-exportar-gerar').disabled = false;
    dlg.showModal();
  });
  el('btn-exportar-cancelar').addEventListener('click', () => dlg.close());
  el('form-exportar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const selecao = [...el('lista-slides').querySelectorAll('input:checked')].map(i => i.value);
    if (!selecao.length) { estadoTxt.textContent = 'Escolhe pelo menos um slide.'; return; }
    try { localStorage.setItem(CHAVE_SLIDES, JSON.stringify(selecao)); } catch { /* sem localStorage */ }
    el('btn-exportar-gerar').disabled = true;
    estadoTxt.textContent = 'A preparar a apresentação…';
    try {
      await exportarPowerPoint(selecao);
      dlg.close();
    } catch (err) {
      console.error(err);
      estadoTxt.textContent = `Não foi possível gerar: ${err.message || err}`;
    } finally {
      el('btn-exportar-gerar').disabled = false;
    }
  });
}

function ligarEventos() {
  ligarExportacao();
  el('f-equipa').addEventListener('change', (e) => escolherEquipa(e.target.value));

  const campos = { 'f-epoca': 'epoca', 'f-competicao': 'competicao', 'f-janela': 'janela', 'f-local': 'local', 'f-adversario': 'adversario', 'f-desde': 'desde', 'f-ate': 'ate' };
  Object.entries(campos).forEach(([id, chave]) => {
    el(id).addEventListener('change', (e) => {
      estado.filtros[chave] = e.target.value;
      renderFiltros();
      renderPagina();
    });
  });

  el('nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-pagina]');
    if (!btn) return;
    estado.pagina = btn.dataset.pagina;
    el('nav').querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    renderPagina();
  });

  el('btn-voltar').addEventListener('click', () => { window.location.href = 'dashboard.html'; });
  el('btn-sair').addEventListener('click', async () => {
    localStorage.removeItem('current_team_id');
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}

(async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  ligarEventos();
  try {
    estado.equipas = await carregarEquipas();
  } catch (err) {
    mostrarErro('Não foi possível carregar as equipas', err.message || String(err));
    return;
  }
  if (!estado.equipas.length) {
    el('conteudo').innerHTML = `<div class="dx-estado"><strong>Sem equipas</strong>Ainda não pertences a nenhuma equipa.</div>`;
    return;
  }
  // Abre na equipa que estava aberta no dashboard, se houver.
  const atual = localStorage.getItem('current_team_id');
  const inicial = estado.equipas.some(e => e.id === atual) ? atual : estado.equipas[0].id;
  preencherSelect(el('f-equipa'), estado.equipas.map(e => ({ value: e.id, label: e.nome })), inicial);
  await escolherEquipa(inicial);
})();
