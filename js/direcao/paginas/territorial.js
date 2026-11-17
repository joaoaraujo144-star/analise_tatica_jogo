/**
 * Análise de Jogo — js/direcao/paginas/territorial.js
 * Página 3 do Dashboard Executivo — Análise Territorial: onde a equipa
 * tem mais atividade, risco ou produção. Campo com densidade (ou pontos)
 * dos eventos registados, distribuição por terço e corredor, os 4 mapas
 * principais (ganhos, perdas, remates, cruzamentos), comparação entre
 * períodos e verificação da orientação de ataque de cada jogo.
 *
 * Filtros próprios da página (somam-se aos globais): evento, lado (a
 * favor / contra), jogo, jogador e momento do jogo. O período
 * competitivo vem dos filtros globais (atual vs. anterior).
 *
 * Versão: 1.2 (2026-11-17)
 *
 * Histórico:
 *   1.2 — lista de jogadores por posição (../../posicoes.js).
 *   1.1 — desenho do campo passou para ../campo.js (partilhado com a
 *         Performance Individual).
 *   1.0 — criação (fase 4).
 */

import { TERCOS, CORREDORES } from '../metricas.js';
import {
  MOMENTOS, filtrarEventos, distribuicaoZonas, compararZonas, verificarOrientacao,
} from '../territorial.js';
import { esc, num, dataCurta, ND } from '../ui.js';
import { rgbDe, campoHtml, legendaIntensidade } from '../campo.js';
import { compararJogadores } from '../../posicoes.js';

const EVENTOS = {
  perdas: { label: 'Ganhos / perdas de bola', X: 'Ganhos de bola', Y: 'Perdas de bola' },
  remates: { label: 'Remates', X: 'Remates feitos', Y: 'Remates sofridos' },
  cruzamentos: { label: 'Cruzamentos', X: 'Cruzamentos feitos', Y: 'Cruzamentos sofridos' },
  cantos: { label: 'Cantos', X: 'Cantos conquistados', Y: 'Cantos concedidos' },
  faltas: { label: 'Faltas', X: 'Faltas cometidas', Y: 'Faltas sofridas' },
};
const PRINCIPAIS = [['perdas', 'X'], ['perdas', 'Y'], ['remates', 'X'], ['cruzamentos', 'X']];

const TERCO_LABEL = { defensivo: 'Defensivo', intermedio: 'Intermédio', ofensivo: 'Ofensivo' };
const CORREDOR_LABEL = { esquerdo: 'Esquerdo', central: 'Central', direito: 'Direito' };

const estadoPagina = { tracker: 'perdas', tipo: 'Y', jogo: '', jogador: '', momento: 'todo', modo: 'densidade' };

// ---------- Cálculo ----------

function jogadoresDe(convocados) {
  const m = new Map();
  convocados.forEach(c => { if (c.players) m.set(c.players.id, c.players); });
  return [...m.values()].sort(compararJogadores);
}

function baseFiltro(extra = {}) {
  return {
    tracker: estadoPagina.tracker,
    tipo: estadoPagina.tipo,
    playerId: estadoPagina.jogador || null,
    momento: estadoPagina.momento,
    ...extra,
  };
}

// ---------- Blocos ----------

function selectHtml(id, opcoes, valor) {
  return `<select id="${id}">${opcoes.map(([v, l]) => `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}

function controlosHtml(ctx, jogadores) {
  const ev = EVENTOS[estadoPagina.tracker];
  const jogos = [['', `Todos (${ctx.atual.length})`], ...ctx.atual.slice().reverse().map(j => [j.id, `${dataCurta(j.data)} · ${j.adversario}`])];
  const jogs = [['', 'Todos'], ...jogadores.map(p => [p.id, `${p.numero ?? ''} ${p.nome}`.trim()])];
  return `
    <div class="dx-filtros dx-filtros-pagina">
      <div class="dx-filtro"><label for="tr-evento">Evento</label>${selectHtml('tr-evento', Object.entries(EVENTOS).map(([k, e]) => [k, e.label]), estadoPagina.tracker)}</div>
      <div class="dx-filtro"><label for="tr-lado">Equipa</label>${selectHtml('tr-lado', [['X', `${ev.X} (a favor)`], ['Y', `${ev.Y} (contra)`]], estadoPagina.tipo)}</div>
      <div class="dx-filtro"><label for="tr-jogo">Jogo</label>${selectHtml('tr-jogo', jogos, estadoPagina.jogo)}</div>
      <div class="dx-filtro"><label for="tr-jogador">Jogador</label>${selectHtml('tr-jogador', jogs, estadoPagina.jogador)}</div>
      <div class="dx-filtro"><label for="tr-momento">Intervalo temporal</label>${selectHtml('tr-momento', MOMENTOS, estadoPagina.momento)}</div>
    </div>`;
}

function barrasZonas(d, rgb) {
  const linhas = (lista, chave, labels) => lista.map(z => {
    const v = d[chave][z], p = d[`${chave}Pct`][z];
    return `
      <div class="dx-zbar">
        <span class="dx-zbar-nome">${labels[z]}</span>
        <span class="dx-zbar-pista"><span style="width:${p ?? 0}%;background:rgb(${rgb})"></span></span>
        <span class="dx-zbar-val">${v} · ${p == null ? ND : `${num(p, 0)}%`}</span>
      </div>`;
  }).join('');
  return `
    <h3 class="dx-subtitulo">Por terço <span class="dx-mini">(defensivo → ofensivo)</span></h3>
    ${linhas(TERCOS, 'terco', TERCO_LABEL)}
    <h3 class="dx-subtitulo">Por corredor <span class="dx-mini">(do ponto de vista da equipa)</span></h3>
    ${linhas(CORREDORES, 'corredor', CORREDOR_LABEL)}`;
}

function mapaPrincipalHtml(ctx, eventosSel, notaJogador) {
  const rgb = rgbDe(estadoPagina.tracker, estadoPagina.tipo);
  const nome = EVENTOS[estadoPagina.tracker][estadoPagina.tipo];
  const d = distribuicaoZonas(eventosSel);
  const jogo = ctx.atual.find(j => j.id === estadoPagina.jogo);
  const ambito = jogo ? `vs. ${esc(jogo.adversario)} (${dataCurta(jogo.data)})` : `${ctx.atual.length} jogo(s) do período`;
  const botoes = [['densidade', 'Densidade'], ['pontos', 'Pontos']].map(([m, l]) => `<button type="button" class="dx-toggle${estadoPagina.modo === m ? ' active' : ''}" data-modo="${m}">${l}</button>`).join('');
  return `
    <div class="dx-grid">
      <div class="dx-card">
        <div class="dx-cardhead">
          <div>
            <h2 class="dx-section-title">${esc(nome)} — ${eventosSel.length} evento(s)</h2>
            <p class="dx-mini">${ambito}. Densidade dos eventos registados, não ocupação do terreno.${notaJogador}</p>
          </div>
          <div class="dx-toggles">${botoes}</div>
        </div>
        ${eventosSel.length ? campoHtml(eventosSel, { rgb, modo: estadoPagina.modo }) : '<div class="dx-estado">Sem eventos com estes filtros.</div>'}
        ${eventosSel.length && estadoPagina.modo === 'densidade' ? legendaIntensidade(rgb) : ''}
      </div>
      <div class="dx-card">
        <h2 class="dx-section-title">Distribuição</h2>
        <p class="dx-mini">Mesmos filtros do mapa.</p>
        ${d.total ? barrasZonas(d, rgb) : '<p class="dx-mini">Sem eventos com estes filtros.</p>'}
      </div>
    </div>`;
}

function principaisHtml(ctx) {
  const matchIds = estadoPagina.jogo ? new Set([estadoPagina.jogo]) : null;
  const mapas = PRINCIPAIS.map(([tracker, tipo]) => {
    const evs = filtrarEventos(ctx.detalhe.eventos, baseFiltro({ tracker, tipo, matchIds: matchIds || new Set(ctx.atual.map(j => j.id)) }));
    const ativo = tracker === estadoPagina.tracker && tipo === estadoPagina.tipo;
    return `
      <button type="button" class="dx-mapa-mini${ativo ? ' active' : ''}" data-tracker="${tracker}" data-tipo="${tipo}">
        <span class="dx-mapa-mini-tit">${EVENTOS[tracker][tipo]} <span class="dx-mini">${evs.length}</span></span>
        ${campoHtml(evs, { rgb: rgbDe(tracker, tipo), mini: true, cols: 6, rows: 4 })}
      </button>`;
  }).join('');
  return `
    <div class="dx-card" style="margin-top:15px">
      <h2 class="dx-section-title">Mapas principais</h2>
      <p class="dx-mini">Com o jogo, jogador e intervalo escolhidos acima. Clica num mapa para o abrir em grande.</p>
      <div class="dx-mapas-mini">${mapas}</div>
    </div>`;
}

function comparacaoHtml(ctx) {
  const nome = EVENTOS[estadoPagina.tracker][estadoPagina.tipo];
  if (estadoPagina.jogo) {
    return `<div class="dx-card" style="margin-top:15px"><h2 class="dx-section-title">Comparação territorial entre períodos</h2><p class="dx-mini">Escolhe "Todos" os jogos para comparar o período atual com o anterior.</p></div>`;
  }
  if (!ctx.anterior.length) {
    return `<div class="dx-card" style="margin-top:15px"><h2 class="dx-section-title">Comparação territorial entre períodos</h2><p class="dx-mini">Sem período anterior com estes filtros — usa "Últimos N jogos" nos filtros globais.</p></div>`;
  }
  const rgb = rgbDe(estadoPagina.tracker, estadoPagina.tipo);
  const ids = (js) => new Set(js.map(j => j.id));
  const evA = filtrarEventos(ctx.detalhe.eventos, baseFiltro({ matchIds: ids(ctx.atual) }));
  const evB = filtrarEventos(ctx.detalhe.eventos, baseFiltro({ matchIds: ids(ctx.anterior) }));
  const c = compararZonas(distribuicaoZonas(evA), ctx.atual.length, distribuicaoZonas(evB), ctx.anterior.length);
  const pp = (v) => (v == null ? ND : `${v > 0 ? '+' : ''}${num(v, 0)} pp`);
  const tabela = (linhas, labels, titulo) => `
    <tr class="dx-tr-grupo"><td colspan="6">${titulo}</td></tr>
    ${linhas.map(l => `<tr><td>${labels[l.zona]}</td><td>${num(l.anteriorPorJogo)}</td><td>${num(l.atualPorJogo)}</td><td>${l.quotaAnterior == null ? ND : `${num(l.quotaAnterior, 0)}%`}</td><td>${l.quotaAtual == null ? ND : `${num(l.quotaAtual, 0)}%`}</td><td>${pp(l.difPp)}</td></tr>`).join('')}`;
  return `
    <div class="dx-card" style="margin-top:15px">
      <h2 class="dx-section-title">Comparação territorial entre períodos — ${esc(nome)}</h2>
      <p class="dx-mini">Período anterior (${ctx.anterior.length} jogos, ${evB.length} eventos) vs. atual (${ctx.atual.length} jogos, ${evA.length} eventos). A quota mostra onde acontecem as ações, independentemente do volume; a média por jogo mostra o volume.</p>
      <div class="dx-grid-even">
        <div><h3 class="dx-subtitulo">Anterior</h3>${campoHtml(evB, { rgb, cols: 6, rows: 4 })}</div>
        <div><h3 class="dx-subtitulo">Atual</h3>${campoHtml(evA, { rgb, cols: 6, rows: 4 })}</div>
      </div>
      <div class="dx-table-scroll" style="margin-top:14px">
        <table class="dx-table">
          <thead><tr><th>Zona</th><th>Anterior / jogo</th><th>Atual / jogo</th><th>Quota anterior</th><th>Quota atual</th><th>Variação da quota</th></tr></thead>
          <tbody>${tabela(c.terco, TERCO_LABEL, 'Terços')}${tabela(c.corredor, CORREDOR_LABEL, 'Corredores')}</tbody>
        </table>
      </div>
    </div>`;
}

function orientacaoHtml(ctx) {
  const jogos = [...ctx.anterior, ...ctx.atual];
  const porId = new Map(jogos.map(j => [j.id, j]));
  const r = verificarOrientacao(ctx.detalhe.eventos.filter(e => porId.has(e.match_id)));
  const suspeitos = r.filter(g => g.estado === 'suspeito');
  const ok = r.filter(g => g.estado === 'ok').length;
  const insuf = r.filter(g => g.estado === 'insuficiente').length;
  // O botão do jogo troca a orientação das duas partes ao mesmo tempo (a
  // 2ª é sempre o oposto da 1ª) — só resolve quando as duas estão
  // suspeitas. Uma parte só suspeita = registo inconsistente nessa parte.
  const okPorJogo = new Set(r.filter(g => g.estado === 'ok').map(g => g.match_id));
  const lista = suspeitos.map(g => {
    const j = porId.get(g.match_id);
    const leitura = okPorJogo.has(g.match_id)
      ? 'Só esta parte: a outra confirma a orientação, por isso o botão do jogo (que troca as duas) não resolve — rever os registos desta parte.'
      : 'Orientação provavelmente trocada no jogo — confirmar em vídeo e usar o botão de trocar a orientação.';
    return `<tr><td>${dataCurta(j.data)}</td><td>${esc(j.adversario)}</td><td>${g.parte}ª parte</td><td>${g.eventos}</td><td>${num(g.indice, 0)}</td><td class="dx-td-texto">${leitura}</td><td><button type="button" class="dx-btn-link" data-abrir-jogo="${j.id}">Abrir jogo</button></td></tr>`;
  }).join('');
  return `
    <div class="dx-card" style="margin-top:15px">
      <h2 class="dx-section-title">Verificação da orientação de ataque</h2>
      <p class="dx-mini">Para cada parte de cada jogo (atual + anterior), as ações ofensivas a favor (remates, cruzamentos, cantos) devem cair sobretudo no meio-campo de ataque e as contra no nosso. Índice 0–100: acima de 50 confirma a orientação registada no jogo. Com menos de 4 ações não há evidência suficiente.</p>
      <p style="margin:10px 0">${ok} parte(s) confirmada(s) · ${suspeitos.length ? `<span class="dx-warn-txt">${suspeitos.length} suspeita(s)</span>` : '0 suspeitas'} · ${insuf} sem dados suficientes</p>
      ${suspeitos.length ? `
        <div class="dx-insight warning">Nestas partes as ações aparecem do lado contrário ao esperado — os mapas e as zonas destes jogos ficam distorcidos até ser corrigido.</div>
        <div class="dx-table-scroll" style="margin-top:10px">
          <table class="dx-table">
            <thead><tr><th>Data</th><th>Adversário</th><th>Parte</th><th>Ações</th><th>Índice</th><th>Leitura</th><th></th></tr></thead>
            <tbody>${lista}</tbody>
          </table>
        </div>` : ''}
    </div>`;
}

// ---------- Página ----------

export const territorial = {
  titulo: 'Análise Territorial',
  precisaDetalhe: true,
  render(ctx) {
    // Os filtros globais podem ter tirado do período o jogo ou o jogador escolhidos.
    if (estadoPagina.jogo && !ctx.atual.some(j => j.id === estadoPagina.jogo)) estadoPagina.jogo = '';
    const jogadores = jogadoresDe(ctx.detalhe.convocados.filter(c => ctx.atual.some(j => j.id === c.match_id)));
    if (estadoPagina.jogador && !jogadores.some(p => p.id === estadoPagina.jogador)) estadoPagina.jogador = '';

    const matchIds = new Set(estadoPagina.jogo ? [estadoPagina.jogo] : ctx.atual.map(j => j.id));
    const eventosSel = filtrarEventos(ctx.detalhe.eventos, baseFiltro({ matchIds }));
    let notaJogador = '';
    if (estadoPagina.jogador) {
      const doTipo = filtrarEventos(ctx.detalhe.eventos, baseFiltro({ matchIds, playerId: null }));
      const comJogador = doTipo.filter(e => e.player_id).length;
      notaJogador = ` Só eventos atribuídos a jogadores: ${comJogador} de ${doTipo.length} deste tipo têm jogador.`;
    }
    return `
      ${controlosHtml(ctx, jogadores)}
      ${mapaPrincipalHtml(ctx, eventosSel, notaJogador)}
      ${principaisHtml(ctx)}
      ${comparacaoHtml(ctx)}
      ${orientacaoHtml(ctx)}`;
  },
  depois(ctx) {
    const mudar = (id, chave, depois) => document.getElementById(id)?.addEventListener('change', (e) => {
      estadoPagina[chave] = e.target.value;
      depois?.();
      ctx.redesenhar();
    });
    mudar('tr-evento', 'tracker');
    mudar('tr-lado', 'tipo');
    mudar('tr-jogo', 'jogo');
    mudar('tr-jogador', 'jogador');
    mudar('tr-momento', 'momento');
    const conteudo = document.getElementById('conteudo');
    conteudo.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
      estadoPagina.modo = b.dataset.modo;
      ctx.redesenhar();
    }));
    conteudo.querySelectorAll('.dx-mapa-mini').forEach(b => b.addEventListener('click', () => {
      estadoPagina.tracker = b.dataset.tracker;
      estadoPagina.tipo = b.dataset.tipo;
      ctx.redesenhar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    conteudo.querySelectorAll('[data-abrir-jogo]').forEach(b => b.addEventListener('click', () => {
      localStorage.setItem('current_team_id', ctx.equipa.id);
      localStorage.setItem('current_match_id', b.dataset.abrirJogo);
      window.location.href = 'match.html';
    }));
  },
};
