/**
 * Análise de Jogo — js/direcao/paginas/coletiva.js
 * Página 2 do Dashboard Executivo — Performance Coletiva: evolução do
 * rendimento ofensivo e defensivo. Produção ofensiva, comportamento
 * defensivo, equilíbrio a favor vs. contra (sempre os dois valores
 * reais, o saldo só ao lado — nunca sozinho), evolução por jogo,
 * distribuição por blocos de 15 min, casa vs. fora e comparação entre
 * jogos.
 *
 * Zonas (terço/corredor) no referencial da equipa: coordenadas já
 * normalizadas em events_normalizado, a equipa ataca sempre para a
 * direita — um remate sofrido aparece no nosso terço defensivo.
 *
 * Versão: 1.2 (2026-11-17)
 *
 * Histórico:
 *   1.2 — KPIs sem linha de comparação quando não há período anterior.
 *   1.1 — direção favorável configurada (ctx.indicadores, fase 7).
 *   1.0 — criação (fase 3).
 */

import {
  contadorEventos, contadorPor, calcularPeriodo, compararIndicadores,
  valoresPorJogo, distribuicaoBlocos, matrizZonas, resultadoJogo,
  BLOCOS_15, TERCOS, CORREDORES,
} from '../metricas.js';
import { esc, num, sinal, pct, dataCurta, tendenciaBadge, deltaKpi, ND } from '../ui.js';
import { COR, OPCOES_BASE, linha, barra, criarGrafico } from '../graficos.js';

const GRUPOS = {
  ofensivo: ['remates_f_90', 'cruzamentos_f_90', 'cantos_f_90', 'ganhos_terco_of_90'],
  defensivo: ['remates_c_90', 'cruzamentos_c_90', 'cantos_c_90', 'ganhos_90', 'perdas_90', 'perdas_terco_def_90'],
  equilibrio: ['saldo_remates_jogo', 'saldo_cruzamentos_jogo', 'saldo_cantos_jogo', 'racio_gp'],
};

// Séries a favor (verde) / contra (laranja). terco: conta só os eventos
// desse terço (referencial da equipa).
const SERIES = {
  remates: { label: 'Remates', a: ['Feitos', 'remates', 'X'], b: ['Sofridos', 'remates', 'Y'] },
  cruzamentos: { label: 'Cruzamentos', a: ['Feitos', 'cruzamentos', 'X'], b: ['Sofridos', 'cruzamentos', 'Y'] },
  cantos: { label: 'Cantos', a: ['Conquistados', 'cantos', 'X'], b: ['Concedidos', 'cantos', 'Y'] },
  bolas: { label: 'Ganhos / perdas de bola', a: ['Ganhos', 'perdas', 'X'], b: ['Perdas', 'perdas', 'Y'] },
  zonas: { label: 'Recuperações t. ofensivo / perdas t. defensivo', a: ['Recuperações no terço ofensivo', 'perdas', 'X', 'ofensivo'], b: ['Perdas no terço defensivo', 'perdas', 'Y', 'defensivo'] },
};
const SERIES_BLOCOS = ['remates', 'cruzamentos', 'cantos', 'bolas'];

const estadoPagina = { evolucao: 'remates', blocos: 'remates', zona: 'remates-X' };

function calcular(ctx) {
  const { eventos } = ctx.detalhe;
  const contar = contadorEventos(eventos);
  const contarTerco = contadorPor(eventos, e => e.terco);
  const periodo = (jogos) => calcularPeriodo(jogos, contar, contarTerco);
  const pA = periodo(ctx.atual);
  const pB = ctx.anterior.length ? periodo(ctx.anterior) : null;
  // Direção favorável configurada (página Alertas) — ctx.indicadores.
  const porIdInd = new Map(ctx.indicadores.map(i => [i.id, i]));
  const comparar = (ids) => compararIndicadores(pA, pB, ids.map(id => porIdInd.get(id)));
  const casa = ctx.atual.filter(j => j.local === 'casa');
  const fora = ctx.atual.filter(j => j.local === 'fora');
  return {
    eventos, contar, contarTerco, pA, pB,
    porId: Object.fromEntries(comparar(Object.values(GRUPOS).flat()).map(l => [l.ind.id, l])),
    grupos: Object.fromEntries(Object.entries(GRUPOS).map(([k, inds]) => [k, comparar(inds)])),
    casa, fora,
    pCasa: casa.length ? periodo(casa) : null,
    pFora: fora.length ? periodo(fora) : null,
  };
}

// Contagem por jogo de uma definição de série (com ou sem terço).
function valores(ctx, c, def) {
  const [, tracker, tipo, terco] = def;
  const contar = terco ? (id, tr, tp) => c.contarTerco(id, tr, tp, terco) : c.contar;
  return valoresPorJogo(ctx.atual, contar, tracker, tipo);
}

function rotulosJogos(jogos) {
  return jogos.map(j => [
    j.adversario,
    [dataCurta(j.data), j.local ? (j.local === 'casa' ? 'C' : 'F') : null, resultadoJogo(j)].filter(Boolean).join(' · '),
  ]);
}

function selectHtml(id, opcoes, valor) {
  return `<select id="${id}">${opcoes.map(([v, l]) => `<option value="${v}" ${v === valor ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}

// ---------- Blocos ----------

function kpi(label, l, temAnterior) {
  return `<article class="dx-card"><div class="dx-kpi-label">${label}</div><div class="dx-kpi-big">${num(l.atual, l.ind.casas)}</div>${deltaKpi(l, temAnterior)}</article>`;
}

function kpisHtml({ porId, pB }) {
  const t = !!pB;
  return `
    <section class="dx-kpis">
      ${kpi('Remates feitos / 90', porId.remates_f_90, t)}
      ${kpi('Remates sofridos / 90', porId.remates_c_90, t)}
      ${kpi('Recuperações no terço ofensivo / 90', porId.ganhos_terco_of_90, t)}
      ${kpi('Perdas no terço defensivo / 90', porId.perdas_terco_def_90, t)}
    </section>`;
}

function tabelaGrupo(linhas, temAnterior) {
  const cab = temAnterior
    ? '<th>Indicador</th><th>Anterior</th><th>Atual</th><th>Variação</th><th>Tendência</th>'
    : '<th>Indicador</th><th>Atual</th>';
  const corpo = linhas.map(l => {
    const variacao = l.ind.soAbsoluto ? sinal(l.diferenca, l.ind.casas) : pct(l.variacao);
    return temAnterior
      ? `<tr><td>${esc(l.ind.label)}</td><td>${num(l.anterior, l.ind.casas)}</td><td><strong>${num(l.atual, l.ind.casas)}</strong></td><td>${variacao}</td><td>${tendenciaBadge(l.tendencia)}</td></tr>`
      : `<tr><td>${esc(l.ind.label)}</td><td><strong>${num(l.atual, l.ind.casas)}</strong></td></tr>`;
  }).join('');
  return `<div class="dx-table-scroll"><table class="dx-table"><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table></div>`;
}

function grupoHtml(titulo, sub, linhas, temAnterior) {
  return `
    <div class="dx-card">
      <h2 class="dx-section-title">${titulo}</h2>
      <p class="dx-mini">${sub}</p>
      ${tabelaGrupo(linhas, temAnterior)}
    </div>`;
}

const ZONA_OPCOES = [
  ['remates-X', 'Remates feitos'], ['remates-Y', 'Remates sofridos'],
  ['cruzamentos-X', 'Cruzamentos feitos'], ['cruzamentos-Y', 'Cruzamentos sofridos'],
  ['perdas-X', 'Ganhos de bola'], ['perdas-Y', 'Perdas de bola'],
];
const TERCO_LABEL = { defensivo: 'Defensivo', intermedio: 'Intermédio', ofensivo: 'Ofensivo' };
const CORREDOR_LABEL = { esquerdo: 'Esquerdo', central: 'Central', direito: 'Direito' };

function zonasHtml(ctx, c) {
  const [tracker, tipo] = estadoPagina.zona.split('-');
  const { matriz, total } = matrizZonas(ctx.atual, c.eventos, tracker, tipo);
  const max = Math.max(1, ...matriz.flat());
  const cor = tipo === 'X' ? '35, 153, 115' : '201, 122, 46'; // COR.favor / COR.contra
  const nome = ZONA_OPCOES.find(([v]) => v === estadoPagina.zona)[1];
  const celulas = CORREDORES.map((cor_, r) => `
    <div class="dx-zona-rot">${CORREDOR_LABEL[cor_]}</div>
    ${TERCOS.map((t, col) => {
      const v = matriz[r][col];
      const p = total ? Math.round((v / total) * 100) : 0;
      return `<div class="dx-zona" style="background: rgba(${cor}, ${(0.12 + 0.78 * (v / max)).toFixed(2)})" title="${esc(nome)} — corredor ${CORREDOR_LABEL[cor_].toLowerCase()}, terço ${TERCO_LABEL[t].toLowerCase()}: ${v} (${p}%)"><strong>${v}</strong><span>${p}%</span></div>`;
    }).join('')}`).join('');
  return `
    <div class="dx-card">
      <div class="dx-cardhead">
        <div>
          <h2 class="dx-section-title">Por zona do campo</h2>
          <p class="dx-mini">Total do período. A equipa ataca para a direita.</p>
        </div>
        ${selectHtml('cl-zona', ZONA_OPCOES, estadoPagina.zona)}
      </div>
      ${total ? `
        <div class="dx-zonas">
          <div></div>${TERCOS.map(t => `<div class="dx-zona-rot dx-zona-col">${TERCO_LABEL[t]}</div>`).join('')}
          ${celulas}
        </div>
        <p class="dx-mini" style="margin-top:8px">${total} evento(s) · ataque →</p>`
        : '<p class="dx-mini">Sem eventos deste tipo no período.</p>'}
    </div>`;
}

// Barras a favor (direita) vs. contra (esquerda), média por jogo. Escala
// própria em cada linha (os volumes são muito diferentes entre ações).
function equilibrioHtml(c, temAnterior) {
  const { pA } = c;
  const pares = [
    ['Remates', 'Feitos', pA.rematesF, 'Sofridos', pA.rematesC, `saldo ${sinal(pA.saldoRematesJogo)}`],
    ['Cruzamentos', 'Feitos', pA.cruzamentosF, 'Sofridos', pA.cruzamentosC, `saldo ${sinal(pA.saldoCruzamentosJogo)}`],
    ['Cantos', 'Conquistados', pA.cantosF, 'Concedidos', pA.cantosC, `saldo ${sinal(pA.saldoCantosJogo)}`],
    ['Bola', 'Ganhos', pA.ganhos, 'Perdas', pA.perdas, `rácio ${num(pA.racioGanhosPerdas, 2)}`],
  ];
  const linhas = pares.map(([nome, lf, f, lc, cc, saldo]) => {
    const max = Math.max(f.porJogo || 0, cc.porJogo || 0) || 1;
    const larg = (v) => (v == null ? 0 : Math.round((v / max) * 100));
    return `
      <div class="dx-borb">
        <div class="dx-borb-nome">${nome}<span class="dx-mini">${saldo}</span></div>
        <div class="dx-borb-lado esq" title="${lc}: ${cc.porJogo == null ? 'n/d' : num(cc.porJogo)} por jogo">
          <span class="dx-borb-val">${num(cc.porJogo)}</span><span class="dx-borb-barra contra" style="width:${larg(cc.porJogo)}%"></span>
        </div>
        <div class="dx-borb-lado dir" title="${lf}: ${f.porJogo == null ? 'n/d' : num(f.porJogo)} por jogo">
          <span class="dx-borb-barra favor" style="width:${larg(f.porJogo)}%"></span><span class="dx-borb-val">${num(f.porJogo)}</span>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="dx-card">
      <h2 class="dx-section-title">Equilíbrio: a favor vs. contra</h2>
      <p class="dx-mini">Média por jogo. <span class="dx-dot" style="background:${COR.contra}"></span> contra · <span class="dx-dot" style="background:${COR.favor}"></span> a favor. Escala própria em cada linha; o saldo aparece só como complemento dos dois valores.</p>
      <div class="dx-borbs">${linhas}</div>
      <div style="margin-top:14px">${tabelaGrupo(c.grupos.equilibrio, temAnterior)}</div>
    </div>`;
}

function evolucaoHtml() {
  return `
    <div class="dx-card" style="margin-top:15px">
      <div class="dx-cardhead">
        <div>
          <h2 class="dx-section-title">Evolução por jogo</h2>
          <p class="dx-mini">Falhas na linha = dado não disponível nesse jogo (codificação parcial sem registos).</p>
        </div>
        ${selectHtml('cl-evolucao', Object.entries(SERIES).map(([k, s]) => [k, s.label]), estadoPagina.evolucao)}
      </div>
      <div style="height:260px"><canvas id="cl-grafico-evolucao"></canvas></div>
    </div>`;
}

function blocosHtml(ctx, c) {
  const s = SERIES[estadoPagina.blocos];
  const da = distribuicaoBlocos(ctx.atual, c.eventos, s.a[1], s.a[2]);
  const db = distribuicaoBlocos(ctx.atual, c.eventos, s.b[1], s.b[2]);
  const sem = da.semMinuto + db.semMinuto;
  return `
    <div class="dx-card">
      <div class="dx-cardhead">
        <div>
          <h2 class="dx-section-title">Por períodos de 15 minutos</h2>
          <p class="dx-mini">Média por jogo. 30–45+ e 75–90+ incluem os descontos.${sem ? ` ${sem} evento(s) sem minuto ficaram de fora.` : ''}</p>
        </div>
        ${selectHtml('cl-blocos', SERIES_BLOCOS.map(k => [k, SERIES[k].label]), estadoPagina.blocos)}
      </div>
      <div style="height:240px"><canvas id="cl-grafico-blocos"></canvas></div>
    </div>`;
}

const LINHAS_CASA_FORA = [
  ['Pontos por jogo', p => p.ppg, 2],
  ['Golos marcados / jogo', p => p.golosMarcadosJogo, 2],
  ['Golos sofridos / jogo', p => p.golosSofridosJogo, 2],
  ['Remates feitos / 90', p => p.rematesF.por90, 1],
  ['Remates sofridos / 90', p => p.rematesC.por90, 1],
  ['Cruzamentos feitos / 90', p => p.cruzamentosF.por90, 1],
  ['Cruzamentos sofridos / 90', p => p.cruzamentosC.por90, 1],
  ['Cantos conquistados / 90', p => p.cantosF.por90, 1],
  ['Cantos concedidos / 90', p => p.cantosC.por90, 1],
  ['Ganhos de bola / 90', p => p.ganhos.por90, 1],
  ['Perdas de bola / 90', p => p.perdas.por90, 1],
  ['Perdas no terço defensivo / 90', p => p.perdasTercoDef.por90, 1],
];

function casaForaHtml(ctx, c) {
  const semLocal = ctx.atual.length - c.casa.length - c.fora.length;
  const val = (p, f, casas) => (p ? num(f(p), casas) : ND);
  const corpo = LINHAS_CASA_FORA.map(([l, f, casas]) => `<tr><td>${l}</td><td>${val(c.pCasa, f, casas)}</td><td>${val(c.pFora, f, casas)}</td></tr>`).join('');
  return `
    <div class="dx-card">
      <h2 class="dx-section-title">Casa vs. fora</h2>
      <p class="dx-mini">Jogos do período atual.${semLocal ? ` ${semLocal} jogo(s) sem casa/fora indicado ficaram de fora.` : ''} Com poucos jogos de cada lado, as diferenças são só indícios.</p>
      <div class="dx-table-scroll">
        <table class="dx-table">
          <thead><tr><th>Indicador</th><th>Casa (${c.casa.length})</th><th>Fora (${c.fora.length})</th></tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
    </div>`;
}

function jogosHtml(ctx, c) {
  const par = (a, b) => `${a == null ? ND : a} – ${b == null ? ND : b}`;
  const col = (def) => valores(ctx, c, def);
  const rem = [col(SERIES.remates.a), col(SERIES.remates.b)];
  const cru = [col(SERIES.cruzamentos.a), col(SERIES.cruzamentos.b)];
  const can = [col(SERIES.cantos.a), col(SERIES.cantos.b)];
  const bol = [col(SERIES.bolas.a), col(SERIES.bolas.b)];
  const zon = [col(SERIES.zonas.a), col(SERIES.zonas.b)];
  const corpo = ctx.atual.map((j, i) => `
    <tr>
      <td>${dataCurta(j.data)}</td>
      <td>${esc(j.adversario)}</td>
      <td>${j.local ? (j.local === 'casa' ? 'Casa' : 'Fora') : ND}</td>
      <td>${j.golos_consistentes ? `${resultadoJogo(j)} ${j.golos_marcados}–${j.golos_sofridos}` : ND}</td>
      <td>${par(rem[0][i], rem[1][i])}</td>
      <td>${par(cru[0][i], cru[1][i])}</td>
      <td>${par(can[0][i], can[1][i])}</td>
      <td>${par(bol[0][i], bol[1][i])}</td>
      <td>${par(zon[0][i], zon[1][i])}</td>
    </tr>`).reverse().join('');
  return `
    <div class="dx-card" style="margin-top:15px">
      <h2 class="dx-section-title">Comparação entre jogos</h2>
      <p class="dx-mini">Valores a favor – contra em cada jogo, do mais recente para o mais antigo. Última coluna: recuperações no terço ofensivo – perdas no terço defensivo.</p>
      <div class="dx-table-scroll">
        <table class="dx-table">
          <thead><tr><th>Data</th><th>Adversário</th><th>Local</th><th>Resultado</th><th>Remates</th><th>Cruzamentos</th><th>Cantos</th><th>Ganhos – perdas</th><th>Rec. t. of. – perdas t. def.</th></tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
    </div>`;
}

// ---------- Página ----------

export const coletiva = {
  titulo: 'Performance Coletiva',
  precisaDetalhe: true,
  render(ctx) {
    const c = calcular(ctx);
    ctx.calculo = c;
    const temAnterior = ctx.anterior.length > 0;
    const notaAnterior = temAnterior ? '' : ' Sem período anterior com estes filtros — só valores atuais.';
    return `
      ${kpisHtml(c)}
      <div class="dx-grid">
        ${grupoHtml('Produção ofensiva', `Por 90 minutos.${notaAnterior}`, c.grupos.ofensivo, temAnterior)}
        ${zonasHtml(ctx, c)}
      </div>
      <div class="dx-grid-even">
        ${grupoHtml('Comportamento defensivo', `Por 90 minutos. Tendência segundo a direção favorável configurada em Alertas.${notaAnterior}`, c.grupos.defensivo, temAnterior)}
        ${equilibrioHtml(c, temAnterior)}
      </div>
      ${evolucaoHtml()}
      <div class="dx-grid-even">
        ${blocosHtml(ctx, c)}
        ${casaForaHtml(ctx, c)}
      </div>
      ${jogosHtml(ctx, c)}`;
  },
  depois(ctx) {
    const c = ctx.calculo;
    const s = SERIES[estadoPagina.evolucao];
    criarGrafico(document.getElementById('cl-grafico-evolucao'), {
      type: 'line',
      data: {
        labels: rotulosJogos(ctx.atual),
        datasets: [linha(s.a[0], valores(ctx, c, s.a), COR.favor), linha(s.b[0], valores(ctx, c, s.b), COR.contra)],
      },
      options: OPCOES_BASE,
    });

    const sb = SERIES[estadoPagina.blocos];
    const da = distribuicaoBlocos(ctx.atual, c.eventos, sb.a[1], sb.a[2]);
    const db = distribuicaoBlocos(ctx.atual, c.eventos, sb.b[1], sb.b[2]);
    const arred = (v) => (v == null ? null : Math.round(v * 10) / 10);
    criarGrafico(document.getElementById('cl-grafico-blocos'), {
      type: 'bar',
      data: {
        labels: BLOCOS_15,
        datasets: [barra(sb.a[0], da.mediaPorJogo.map(arred), COR.favor), barra(sb.b[0], db.mediaPorJogo.map(arred), COR.contra)],
      },
      options: OPCOES_BASE,
    });

    const ligar = (id, chave) => document.getElementById(id)?.addEventListener('change', (e) => {
      estadoPagina[chave] = e.target.value;
      ctx.redesenhar();
    });
    ligar('cl-evolucao', 'evolucao');
    ligar('cl-blocos', 'blocos');
    ligar('cl-zona', 'zona');
  },
};
