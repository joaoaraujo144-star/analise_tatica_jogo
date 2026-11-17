/**
 * Análise de Jogo — js/direcao/paginas/overview.js
 * Página 1 do Dashboard Executivo — Executive Overview: estado
 * competitivo em menos de 5 minutos. KPIs com variação face ao período
 * anterior, evolução por jogo, comparação entre períodos, resumo de
 * tendências e três conclusões executivas baseadas em regras
 * transparentes (ver conclusoesExecutivas() em ../metricas.js).
 *
 * Versão: 1.4 (2026-11-17)
 *
 * Histórico:
 *   1.4 — sem jogos anteriores: tabela só com os valores atuais e KPIs
 *         sem linha de comparação.
 *   1.3 — nota: jogos sem tempos ficam fora do por 90 (já não o anulam).
 *   1.2 — direção favorável configurada (ctx.indicadores, fase 7).
 *   1.1 — tabela limitada a INDICADORES_OVERVIEW (o catálogo cresceu na fase 3).
 *   1.0 — criação (fase 2).
 */

import {
  contadorEventos, calcularPeriodo, compararIndicadores, conclusoesExecutivas, INDICADORES_OVERVIEW,
  contagemValida, resultadoJogo,
} from '../metricas.js';
import { esc, num, sinal, pct, dataCurta, tendenciaBadge, deltaKpi } from '../ui.js';
import { COR, OPCOES_BASE, linha, criarGrafico } from '../graficos.js';

const MIN_JOGOS = 3;
const LIMIAR_PCT = 10;

// Séries do gráfico de evolução: valores por jogo, null quando o dado
// não é válido (resultado não fiável / tipo não codificado).
const SERIES = {
  golos: { label: 'Golos', a: ['Marcados', j => (j.golos_consistentes ? j.golos_marcados : null)], b: ['Sofridos', j => (j.golos_consistentes ? j.golos_sofridos : null)] },
  remates: { label: 'Remates', a: ['Feitos', 'remates', 'X'], b: ['Sofridos', 'remates', 'Y'] },
  cruzamentos: { label: 'Cruzamentos', a: ['Feitos', 'cruzamentos', 'X'], b: ['Sofridos', 'cruzamentos', 'Y'] },
  bolas: { label: 'Ganhos / perdas de bola', a: ['Ganhos', 'perdas', 'X'], b: ['Perdas', 'perdas', 'Y'] },
  cantos: { label: 'Cantos', a: ['A favor', 'cantos', 'X'], b: ['Contra', 'cantos', 'Y'] },
};

let estadoPagina = { serie: 'remates' };

function calcular(ctx) {
  const contar = contadorEventos(ctx.detalhe.eventos);
  const pA = calcularPeriodo(ctx.atual, contar);
  const pB = ctx.anterior.length ? calcularPeriodo(ctx.anterior, contar) : null;
  // Mesmos indicadores de sempre, mas com a direção favorável configurada.
  const idsOverview = new Set(INDICADORES_OVERVIEW.map(i => i.id));
  const linhas = compararIndicadores(pA, pB, ctx.indicadores.filter(i => idsOverview.has(i.id)));
  const concl = conclusoesExecutivas(linhas, ctx.atual.length, ctx.anterior.length, { minJogos: MIN_JOGOS, limiarPct: LIMIAR_PCT });
  const porId = Object.fromEntries(linhas.map(l => [l.ind.id, l]));
  return { contar, pA, pB, linhas, concl, porId, temAnterior: !!pB };
}

function kpi(label, valor, delta, extra = '') {
  return `<article class="dx-card"><div class="dx-kpi-label">${label}</div><div class="dx-kpi-big">${valor}</div>${delta || ''}${extra}</article>`;
}

function kpisHtml({ pA, porId, temAnterior }) {
  const dk = (l) => deltaKpi(l, temAnterior);
  const sem = pA.semResultado ? ` · <span class="dx-warn-txt">${pA.semResultado} sem resultado fiável</span>` : '';
  const golos = pA.golosMarcados == null ? '<span class="dx-nd">n/d</span>' : `${pA.golosMarcados}–${pA.golosSofridos}`;
  return `
    <section class="dx-kpis">
      ${kpi('Jogos realizados', pA.jogos, `<div class="dx-kpi-delta neutral">${pA.V}V · ${pA.E}E · ${pA.D}D${sem}</div>`)}
      ${kpi('Pontos por jogo', num(pA.ppg, 2), dk(porId.ppg), `<div class="dx-kpi-sub">${pA.pontos} pontos em ${pA.jogosComResultado} jogos</div>`)}
      ${kpi('Golos (marcados–sofridos)', golos, dk(porId.dif_golos), `<div class="dx-kpi-sub">Diferença ${sinal(pA.difGolos, 0)}</div>`)}
      ${kpi('Rácio ganhos/perdas', num(pA.racioGanhosPerdas, 2), dk(porId.racio_gp))}
      ${kpi('Remates feitos / 90', num(porId.remates_f_90.atual), dk(porId.remates_f_90))}
      ${kpi('Remates sofridos / 90', num(porId.remates_c_90.atual), dk(porId.remates_c_90))}
      ${kpi('Ganhos de bola / 90', num(porId.ganhos_90.atual), dk(porId.ganhos_90))}
      ${kpi('Perdas de bola / 90', num(porId.perdas_90.atual), dk(porId.perdas_90))}
    </section>`;
}

function evolucaoHtml() {
  const opcoes = Object.entries(SERIES).map(([k, s]) => `<option value="${k}" ${k === estadoPagina.serie ? 'selected' : ''}>${s.label}</option>`).join('');
  return `
    <div class="dx-card">
      <div class="dx-cardhead">
        <div>
          <h2 class="dx-section-title">Evolução por jogo</h2>
          <p class="dx-mini">A favor (verde) vs. contra (laranja). Falhas na linha = dado não disponível nesse jogo.</p>
        </div>
        <select id="ov-serie">${opcoes}</select>
      </div>
      <div style="height:260px"><canvas id="ov-grafico"></canvas></div>
    </div>`;
}

function conclusoesHtml({ concl }) {
  if (!concl.suficiente) {
    return `<div class="dx-card"><h2 class="dx-section-title">Conclusões executivas</h2><p class="dx-mini">${esc(concl.motivo)} Sem amostra suficiente não são geradas conclusões.</p></div>`;
  }
  const fundamento = (l) => `${esc(l.ind.label)}: ${num(l.anterior, l.ind.casas)} → ${num(l.atual, l.ind.casas)} (${pct(l.variacao)})`;
  const pos = concl.positiva
    ? `<div class="dx-insight"><strong>Evolução positiva</strong><br>${fundamento(concl.positiva)}</div>`
    : `<div class="dx-insight neutral"><strong>Evolução positiva</strong><br>Nenhuma melhoria de pelo menos ${LIMIAR_PCT}%.</div>`;
  const risco = concl.risco
    ? `<div class="dx-insight warning"><strong>Risco identificado</strong><br>${fundamento(concl.risco)}</div>`
    : `<div class="dx-insight neutral"><strong>Risco identificado</strong><br>Nenhum agravamento de pelo menos ${LIMIAR_PCT}%.</div>`;
  const rec = concl.recomendacao
    ? `<div class="dx-insight info"><strong>Recomendação</strong><br>${esc(concl.recomendacao)}</div>`
    : `<div class="dx-insight neutral"><strong>Recomendação</strong><br>Sem variações relevantes que justifiquem uma recomendação.</div>`;
  return `
    <div class="dx-card">
      <h2 class="dx-section-title">Conclusões executivas</h2>
      ${pos}${risco}${rec}
      <p class="dx-mini" style="margin-top:12px">Regra: só com pelo menos ${MIN_JOGOS} jogos em cada período e variações de pelo menos ${LIMIAR_PCT}% em indicadores com direção favorável definida. São indícios a validar com vídeo e contexto (adversários, resultado, alterações de sistema) — não prova estatística.</p>
    </div>`;
}

function tendenciasHtml({ concl, linhas }) {
  const lista = (t) => {
    const ls = linhas.filter(l => l.tendencia === t && l.variacao != null && Math.abs(l.variacao) >= LIMIAR_PCT);
    return ls.length
      ? `<ul class="dx-lista">${ls.map(l => `<li>${esc(l.ind.label)} <span class="dx-mini">(${pct(l.variacao)})</span></li>`).join('')}</ul>`
      : `<p class="dx-mini">Nenhuma com pelo menos ${LIMIAR_PCT}%.</p>`;
  };
  if (!concl.suficiente) return '';
  return `
    <div class="dx-card">
      <h2 class="dx-section-title">Tendências</h2>
      <div class="dx-grid-even" style="margin-top:8px">
        <div><div class="dx-kpi-delta good" style="margin-bottom:6px">▲ Positivas</div>${lista('melhoria')}</div>
        <div><div class="dx-kpi-delta bad" style="margin-bottom:6px">▼ Negativas</div>${lista('agravamento')}</div>
      </div>
    </div>`;
}

function comparacaoHtml(ctx, { linhas }) {
  if (!ctx.anterior.length) {
    // Sem jogos anteriores: sem comparação, mas os valores do período aparecem na mesma.
    const motivo = ['epoca', 'intervalo'].includes(ctx.filtros.janela)
      ? 'A comparação com o período anterior só existe para "Últimos N jogos".'
      : 'Não há jogos anteriores a este período com os filtros escolhidos, por isso não há comparação.';
    const corpo = linhas.map(l => `<tr><td>${esc(l.ind.label)}</td><td><strong>${num(l.atual, l.ind.casas)}</strong></td></tr>`).join('');
    return `
      <div class="dx-card" style="margin-top:15px">
        <h2 class="dx-section-title">Indicadores do período (${ctx.atual.length} jogos)</h2>
        <p class="dx-mini">${motivo}</p>
        <div class="dx-table-scroll"><table class="dx-table"><thead><tr><th>Indicador</th><th>Atual</th></tr></thead><tbody>${corpo}</tbody></table></div>
      </div>`;
  }
  const linhasHtml = linhas.map(l => `
    <tr>
      <td>${esc(l.ind.label)}</td>
      <td>${num(l.anterior, l.ind.casas)}</td>
      <td><strong>${num(l.atual, l.ind.casas)}</strong></td>
      <td>${sinal(l.diferenca, l.ind.casas)}</td>
      <td>${l.ind.soAbsoluto ? '—' : pct(l.variacao)}</td>
      <td>${tendenciaBadge(l.tendencia)}</td>
    </tr>`).join('');
  return `
    <div class="dx-card" style="margin-top:15px">
      <div class="dx-cardhead">
        <div>
          <h2 class="dx-section-title">Últimos ${ctx.atual.length} jogos vs. ${ctx.anterior.length} anteriores</h2>
          <p class="dx-mini">Tendência segundo a direção favorável de cada indicador (configurável em Alertas). Variações abaixo de 5% contam como estáveis.</p>
        </div>
      </div>
      <div class="dx-table-scroll">
        <table class="dx-table">
          <thead><tr><th>Indicador</th><th>Anterior</th><th>Atual</th><th>Diferença</th><th>Variação</th><th>Tendência</th></tr></thead>
          <tbody>${linhasHtml}</tbody>
        </table>
      </div>
    </div>`;
}

function notaDados({ pA }) {
  const parciais = [pA.rematesF, pA.ganhos, pA.perdas].some(a => a.jogosConsiderados < pA.jogos);
  const sem90 = [pA.rematesF, pA.ganhos].some(a => a.jogosSemMinutos > 0);
  const notas = [];
  if (parciais) notas.push('alguns jogos sem codificação completa ficaram de fora dos indicadores de eventos');
  if (sem90) notas.push('há jogos sem tempos completos, que ficam de fora dos valores "por 90"');
  return notas.length ? `<p class="dx-mini" style="margin:-4px 0 15px">Nota: ${notas.join('; ')}.</p>` : '';
}

export const overview = {
  titulo: 'Executive Overview',
  precisaDetalhe: true,
  render(ctx) {
    const c = calcular(ctx);
    ctx.calculo = c;
    return `
      ${kpisHtml(c)}
      ${notaDados(c)}
      <div class="dx-grid">
        ${evolucaoHtml()}
        ${conclusoesHtml(c)}
      </div>
      ${comparacaoHtml(ctx, c)}
      ${tendenciasHtml(c) ? `<div style="margin-top:15px">${tendenciasHtml(c)}</div>` : ''}`;
  },
  depois(ctx) {
    const desenhar = () => {
      const s = SERIES[estadoPagina.serie];
      const valores = (def) => (typeof def[1] === 'function'
        ? ctx.atual.map(def[1])
        : ctx.atual.map(j => contagemValida(ctx.calculo.contar(j.id, def[1], def[2]), j.codificacao)));
      criarGrafico(document.getElementById('ov-grafico'), {
        type: 'line',
        data: {
          // Duas linhas por rótulo: adversário / data · C|F · resultado
          labels: ctx.atual.map(j => [
            j.adversario,
            [dataCurta(j.data), j.local ? (j.local === 'casa' ? 'C' : 'F') : null, resultadoJogo(j)].filter(Boolean).join(' · '),
          ]),
          datasets: [linha(s.a[0], valores(s.a), COR.favor), linha(s.b[0], valores(s.b), COR.contra)],
        },
        options: OPCOES_BASE,
      });
    };
    desenhar();
    document.getElementById('ov-serie').addEventListener('change', (e) => {
      estadoPagina.serie = e.target.value;
      ctx.redesenhar();
    });
  },
};
