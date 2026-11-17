/**
 * Análise de Jogo — js/direcao/paginas/individual.js
 * Página 4 do Dashboard Executivo — Performance Individual: rendimento e
 * evolução dos jogadores.
 *
 * Princípios (pedidos explicitamente):
 *  - sem rankings globais: a tabela está agrupada por posição, e só se
 *    ordena dentro de cada posição;
 *  - sem juízo automático: não há cores de "melhor/pior" nas ações — mais
 *    perdas pode ser só mais bola (ler com o rácio, a posição e as zonas);
 *  - totais individuais são um mínimo: só contam eventos com jogador
 *    atribuído (a cobertura aparece no topo);
 *  - por 90 só com minutos fiáveis e pelo menos MIN_MINUTOS_90.
 *
 * Versão: 1.1 (2026-11-17)
 *
 * Histórico:
 *   1.1 — ordem das posições de ../../posicoes.js; listas de jogadores por posição.
 *   1.0 — versão anterior.
 */

import { ACOES, MIN_MINUTOS_90, estatisticasJogador, cobertura, jogadoresDoPeriodo } from '../individual.js';
import { contagemValida, TERCOS } from '../metricas.js';
import { esc, num, dataCurta, ND } from '../ui.js';
import { COR, OPCOES_BASE, linha, criarGrafico } from '../graficos.js';
import { RGB, rgbDe, campoHtml } from '../campo.js';
import { ORDEM_POSICOES as POSICOES } from '../../posicoes.js';

const POSICAO_LABEL = {
  GR: 'Guarda-redes', DD: 'Lateral direito', DC: 'Defesa central', DE: 'Lateral esquerdo',
  MDC: 'Médio defensivo', MC: 'Médio centro', MO: 'Médio ofensivo', ED: 'Extremo direito',
  EE: 'Extremo esquerdo', PL: 'Ponta de lança',
};
const ULTIMOS = 6;

const estadoPagina = { posicao: '', vista: 'totais', jogador: '', comparar: '', acaoEvolucao: 'ganhos', acaoMapa: 'perdas' };

const nomeJogador = (p) => `${p.numero ? `${p.numero} ` : ''}${p.nome}`;

function selectHtml(id, opcoes, valor) {
  return `<select id="${id}">${opcoes.map(([v, l]) => `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}

// ---------- Cálculo ----------

function calcular(ctx) {
  const jogadores = jogadoresDoPeriodo(ctx.detalhe.convocados, ctx.atual);
  const stats = new Map(jogadores.map(p => [p.id, estatisticasJogador(p.id, ctx.atual, ctx.detalhe)]));
  return { jogadores, stats, cob: cobertura(ctx.detalhe.eventos, ctx.atual) };
}

// ---------- Topo ----------

function controlosHtml(c) {
  const posicoes = [['', 'Todas'], ...POSICOES.filter(p => c.jogadores.some(j => j.posicao === p)).map(p => [p, `${p} — ${POSICAO_LABEL[p]}`])];
  if (c.jogadores.some(j => !j.posicao)) posicoes.push(['_sem', 'Sem posição']);
  const lista = [['', '—'], ...c.jogadores.map(p => [p.id, `${nomeJogador(p)}${p.posicao ? ` (${p.posicao})` : ''}`])];
  return `
    <div class="dx-filtros dx-filtros-pagina">
      <div class="dx-filtro"><label for="in-posicao">Posição</label>${selectHtml('in-posicao', posicoes, estadoPagina.posicao)}</div>
      <div class="dx-filtro"><label for="in-vista">Valores</label>${selectHtml('in-vista', [['totais', 'Totais'], ['p90', 'Por 90 minutos']], estadoPagina.vista)}</div>
      <div class="dx-filtro"><label for="in-jogador">Jogador</label>${selectHtml('in-jogador', lista, estadoPagina.jogador)}</div>
      <div class="dx-filtro"><label for="in-comparar">Comparar com</label>${selectHtml('in-comparar', lista.filter(([v]) => v !== estadoPagina.jogador), estadoPagina.comparar)}</div>
    </div>`;
}

function coberturaHtml(cob) {
  const pills = ACOES.map(a => {
    const x = cob[a.id];
    return `<span class="dx-pill" title="${x.comJogador} de ${x.total} eventos com jogador">${a.label}: ${x.pct == null ? 'sem eventos' : `${num(x.pct, 0)}%`}</span>`;
  }).join(' ');
  return `
    <div class="dx-card" style="margin-bottom:15px">
      <h2 class="dx-section-title">Eventos com jogador atribuído</h2>
      <p class="dx-mini">Só estes contam para os valores individuais — com cobertura baixa, os totais de cada jogador ficam por baixo do real.</p>
      <div class="dx-pills">${pills}</div>
    </div>`;
}

// ---------- Tabela ----------

function tercosMini(zonas) {
  const total = TERCOS.reduce((n, t) => n + zonas[t], 0);
  if (!total) return ND;
  const tons = { defensivo: 0.35, intermedio: 0.6, ofensivo: 0.9 };
  const partes = TERCOS.map(t => `<span style="width:${(zonas[t] / total) * 100}%;background:rgba(${RGB.favor}, ${tons[t]})"></span>`).join('');
  const titulo = TERCOS.map(t => `${t}: ${zonas[t]} (${Math.round((zonas[t] / total) * 100)}%)`).join(' · ');
  return `<span class="dx-tercos-mini" title="${titulo}">${partes}</span>`;
}

function evolucaoMini(s) {
  const ultimos = s.porJogo.slice(-ULTIMOS);
  const n = (p) => (p.jogou ? Object.values(p.acoes).reduce((a, b) => a + b, 0) : null);
  const max = Math.max(1, ...ultimos.map(p => n(p) || 0));
  const barras = ultimos.map(p => {
    const v = n(p);
    const tit = `${dataCurta(p.jogo.data)} ${p.jogo.adversario}: ${v == null ? 'não jogou' : `${v} ações, ${p.minutos ?? '?'} min`}`;
    return v == null
      ? `<span class="dx-spark-nd" title="${esc(tit)}"></span>`
      : `<span class="dx-spark" style="height:${Math.max(8, (v / max) * 100)}%" title="${esc(tit)}"></span>`;
  }).join('');
  return `<span class="dx-sparks">${barras}</span>`;
}

function valorAcao(s, id) {
  if (estadoPagina.vista === 'p90') return num(s.por90[id]);
  return String(s.total[id]);
}

function tabelaHtml(c) {
  const grupos = [...POSICOES, '_sem']
    .filter(g => !estadoPagina.posicao || estadoPagina.posicao === g)
    .map(g => [g, c.jogadores.filter(p => (g === '_sem' ? !p.posicao : p.posicao === g))])
    .filter(([, js]) => js.length);
  const cab = `<th>Jogador</th><th>Jogos (tit.)</th><th>Minutos</th><th>Jogos c/ eventos</th>${ACOES.map(a => `<th>${a.curto}</th>`).join('')}<th>Rácio G/P</th><th>Terços</th><th>Últimos ${ULTIMOS} jogos</th>`;
  const linhas = grupos.map(([g, js]) => {
    const ordenados = js.slice().sort((a, b) => c.stats.get(b.id).minutos - c.stats.get(a.id).minutos);
    return `
      <tr class="dx-tr-grupo"><td colspan="${ACOES.length + 7}">${g === '_sem' ? 'Sem posição' : `${g} — ${POSICAO_LABEL[g]}`}</td></tr>
      ${ordenados.map(p => {
        const s = c.stats.get(p.id);
        const ativo = p.id === estadoPagina.jogador ? ' class="ativo"' : '';
        return `<tr data-jogador="${p.id}"${ativo}>
          <td>${esc(nomeJogador(p))}</td>
          <td>${s.jogos} (${s.titularidades})</td>
          <td>${s.minutos}${s.minutosEmFalta ? '<span class="dx-warn-txt" title="Há jogos com minutos desconhecidos (tempos ou substituição sem minuto)">*</span>' : ''}</td>
          <td>${s.jogosComEventos}</td>
          ${ACOES.map(a => `<td>${valorAcao(s, a.id)}</td>`).join('')}
          <td>${num(s.racio, 2)}</td>
          <td>${tercosMini(s.zonas)}</td>
          <td>${evolucaoMini(s)}</td>
        </tr>`;
      }).join('')}`;
  }).join('');
  return `
    <div class="dx-card">
      <h2 class="dx-section-title">Jogadores por posição</h2>
      <p class="dx-mini">Agrupados por posição, por minutos dentro de cada uma — sem ranking entre funções diferentes. ${estadoPagina.vista === 'p90' ? `Por 90: só jogos com codificação completa e minutos conhecidos, e n/d abaixo de ${MIN_MINUTOS_90} minutos.` : 'Totais do período.'} * = minutos incompletos. Clica num jogador para ver o detalhe.</p>
      <div class="dx-table-scroll">
        <table class="dx-table dx-table-click">
          <thead><tr>${cab}</tr></thead>
          <tbody>${linhas || `<tr><td colspan="${ACOES.length + 7}">Sem jogadores convocados no período.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

// ---------- Detalhe ----------

function kpi(label, valor, sub = '') {
  return `<article class="dx-card"><div class="dx-kpi-label">${label}</div><div class="dx-kpi-big">${valor}</div>${sub ? `<div class="dx-kpi-sub">${sub}</div>` : ''}</article>`;
}

function comparacaoHtml(ctx, p, s, sAnt, pB, sB) {
  const cols = [['Atual', s]];
  if (sAnt) cols.push([`Anterior (${ctx.anterior.length} jogos)`, sAnt]);
  if (sB) cols.push([`${esc(nomeJogador(pB))} — atual`, sB]);
  const cab = `<th>Ação</th>${cols.map(([l]) => `<th>${l} · total</th><th>${l} · /90</th>`).join('')}`;
  const corpo = ACOES.map(a => `<tr><td>${a.label}</td>${cols.map(([, x]) => `<td>${x.total[a.id]}</td><td>${num(x.por90[a.id])}</td>`).join('')}</tr>`).join('')
    + `<tr><td>Rácio ganhos/perdas</td>${cols.map(([, x]) => `<td colspan="2">${num(x.racio, 2)}</td>`).join('')}</tr>`
    + `<tr><td>Minutos (base do /90)</td>${cols.map(([, x]) => `<td colspan="2">${x.minutos} (${x.minutosBase90})</td>`).join('')}</tr>`;
  const avisoPos = sB && pB.posicao !== p.posicao
    ? `<div class="dx-insight warning">Posições diferentes (${esc(p.posicao || 'sem posição')} vs. ${esc(pB.posicao || 'sem posição')}) — as ações esperadas de cada função são diferentes, compara com cautela.</div>`
    : '';
  const semAnt = !sAnt ? '<p class="dx-mini">Sem período anterior com estes filtros — usa "Últimos N jogos" para comparar períodos.</p>' : '';
  return `
    <div class="dx-card" style="margin-top:15px">
      <h2 class="dx-section-title">Comparação</h2>
      <p class="dx-mini">Sem cores de melhor/pior: mais perdas pode ser só mais bola — ler com o rácio, a posição e as zonas.</p>
      ${avisoPos}${semAnt}
      <div class="dx-table-scroll"><table class="dx-table"><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table></div>
    </div>`;
}

function porJogoHtml(s) {
  const corpo = s.porJogo.slice().reverse().map(p => `
    <tr>
      <td>${dataCurta(p.jogo.data)}</td><td>${esc(p.jogo.adversario)}</td>
      <td>${!p.convocado ? 'Não convocado' : !p.jogou ? 'Não jogou' : p.titular ? 'Titular' : 'Entrou'}</td>
      <td>${p.jogou ? (p.minutos ?? ND) : '—'}</td>
      ${ACOES.map(a => `<td>${p.jogou ? (contagemValida(p.acoes[a.id], p.jogo.codificacao) ?? ND) : '—'}</td>`).join('')}
    </tr>`).join('');
  return `
    <div class="dx-card" style="margin-top:15px">
      <h2 class="dx-section-title">Jogo a jogo</h2>
      <div class="dx-table-scroll">
        <table class="dx-table">
          <thead><tr><th>Data</th><th>Adversário</th><th>Participação</th><th>Minutos</th>${ACOES.map(a => `<th>${a.curto}</th>`).join('')}</tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
    </div>`;
}

function detalheHtml(ctx, c) {
  const p = c.jogadores.find(j => j.id === estadoPagina.jogador);
  if (!p) {
    return '<div class="dx-estado" style="margin-top:15px"><strong>Escolhe um jogador</strong>Na lista acima ou na tabela, para ver a evolução, o mapa de ações e as comparações.</div>';
  }
  const s = c.stats.get(p.id);
  const sAnt = ctx.anterior.length ? estatisticasJogador(p.id, ctx.anterior, ctx.detalhe) : null;
  const pB = c.jogadores.find(j => j.id === estadoPagina.comparar);
  const sB = pB ? c.stats.get(pB.id) : null;
  ctx.individual = { p, s, pB, sB };
  const acoesSel = ACOES.map(a => [a.id, a.label]);
  const acaoMapa = ACOES.find(a => a.id === estadoPagina.acaoMapa);
  const evMapa = s.eventos.filter(e => e.tracker_id === acaoMapa.tracker && e.tipo === acaoMapa.tipo);
  return `
    <h2 class="dx-detalhe-titulo">${esc(nomeJogador(p))} <span class="dx-mini">${p.posicao ? `${p.posicao} — ${POSICAO_LABEL[p.posicao] || ''}` : 'sem posição'}</span></h2>
    <section class="dx-kpis">
      ${kpi('Jogos', s.jogos, `${s.titularidades} titular · ${s.convocatorias} convocatórias`)}
      ${kpi('Minutos', s.minutos, s.minutosEmFalta ? 'há jogos com minutos desconhecidos' : '')}
      ${kpi('Jogos com eventos registados', s.jogosComEventos)}
      ${kpi('Rácio ganhos/perdas', num(s.racio, 2), `${s.total.ganhos} ganhos · ${s.total.perdas} perdas`)}
    </section>
    <div class="dx-grid">
      <div class="dx-card">
        <div class="dx-cardhead">
          <div>
            <h2 class="dx-section-title">Evolução individual</h2>
            <p class="dx-mini">Por jogo. Falhas = não jogou, ou jogo com codificação parcial sem registos.</p>
          </div>
          ${selectHtml('in-acao-evolucao', acoesSel, estadoPagina.acaoEvolucao)}
        </div>
        <div style="height:250px"><canvas id="in-grafico"></canvas></div>
      </div>
      <div class="dx-card">
        <div class="dx-cardhead">
          <div>
            <h2 class="dx-section-title">Mapa de ações</h2>
            <p class="dx-mini">${evMapa.length} evento(s) no período · ataque →</p>
          </div>
          ${selectHtml('in-acao-mapa', acoesSel, estadoPagina.acaoMapa)}
        </div>
        ${evMapa.length ? campoHtml(evMapa, { rgb: rgbDe(acaoMapa.tracker, acaoMapa.tipo), modo: 'pontos' }) : '<p class="dx-mini">Sem eventos deste tipo atribuídos a este jogador.</p>'}
      </div>
    </div>
    ${comparacaoHtml(ctx, p, s, sAnt, pB, sB)}
    ${porJogoHtml(s)}`;
}

// ---------- Página ----------

export const individual = {
  titulo: 'Performance Individual',
  precisaDetalhe: true,
  render(ctx) {
    const c = calcular(ctx);
    if (estadoPagina.jogador && !c.stats.has(estadoPagina.jogador)) estadoPagina.jogador = '';
    if (estadoPagina.comparar && (!c.stats.has(estadoPagina.comparar) || estadoPagina.comparar === estadoPagina.jogador)) estadoPagina.comparar = '';
    if (estadoPagina.posicao && estadoPagina.posicao !== '_sem' && !c.jogadores.some(j => j.posicao === estadoPagina.posicao)) estadoPagina.posicao = '';
    ctx.individual = null;
    return `
      ${controlosHtml(c)}
      ${coberturaHtml(c.cob)}
      ${tabelaHtml(c)}
      <div id="in-detalhe" style="margin-top:20px">${detalheHtml(ctx, c)}</div>`;
  },
  depois(ctx) {
    const mudar = (id, chave) => document.getElementById(id)?.addEventListener('change', (e) => {
      estadoPagina[chave] = e.target.value;
      ctx.redesenhar();
    });
    mudar('in-posicao', 'posicao');
    mudar('in-vista', 'vista');
    mudar('in-jogador', 'jogador');
    mudar('in-comparar', 'comparar');
    mudar('in-acao-evolucao', 'acaoEvolucao');
    mudar('in-acao-mapa', 'acaoMapa');
    document.querySelectorAll('tr[data-jogador]').forEach(tr => tr.addEventListener('click', () => {
      estadoPagina.jogador = tr.dataset.jogador;
      ctx.redesenhar().then(() => document.getElementById('in-detalhe')?.scrollIntoView({ behavior: 'smooth' }));
    }));

    const ind = ctx.individual;
    if (!ind) return;
    const acao = ACOES.find(a => a.id === estadoPagina.acaoEvolucao);
    const serie = (s) => s.porJogo.map(p => (p.jogou ? contagemValida(p.acoes[acao.id], p.jogo.codificacao) : null));
    const datasets = [linha(nomeJogador(ind.p), serie(ind.s), COR.favor)];
    if (ind.sB) datasets.push(linha(nomeJogador(ind.pB), serie(ind.sB), COR.amarelo));
    criarGrafico(document.getElementById('in-grafico'), {
      type: 'line',
      data: { labels: ctx.atual.map(j => [j.adversario, dataCurta(j.data)]), datasets },
      options: OPCOES_BASE,
    });
  },
};
