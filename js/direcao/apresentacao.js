/**
 * Análise de Jogo — js/direcao/apresentacao.js
 * Exportação do Dashboard Executivo (Gestão Desportiva) para PowerPoint,
 * com o visual do template "Matchday" do clube: fundo escuro, títulos e
 * etiquetas a dourado, painel lateral com barra dourada, faixa inferior
 * com uma etiqueta + texto, e rodapé "EQUIPA · GESTÃO DESPORTIVA ·
 * ÉPOCA" com a data.
 *
 * Duas partes, separadas para poderem ser testadas sem browser:
 *  - prepararDados(c): todos os números, com as mesmas funções puras do
 *    dashboard (os valores do PowerPoint são os do ecrã, com os mesmos
 *    filtros) — null continua a ser "n/d", nunca 0;
 *  - construirApresentacao(pptx, dados, { selecao }): desenha os slides
 *    numa instância de PptxGenJS (biblioteca carregada do CDN no browser,
 *    ou do npm nos testes). Gráficos nativos do PowerPoint (editáveis);
 *    tabelas e textos editáveis; o campo é desenhado com formas.
 *
 * Versão: 1.1 (2026-11-17)
 *
 * Histórico:
 *   1.1 — sem jogos anteriores: sem comparação, mas com os valores do
 *         período (indicadores, resumo); capa indica pré-época excluída.
 *   1.0 — criação.
 */

import {
  epocaDe, resultadoJogo, contadorEventos, contadorPor, calcularPeriodo, compararIndicadores,
  conclusoesExecutivas, valoresPorJogo, distribuicaoBlocos, BLOCOS_15, INDICADORES_OVERVIEW, TERCOS, CORREDORES,
} from './metricas.js';
import { JANELAS } from './filtros.js';
import { filtrarEventos, densidade, distribuicaoZonas, verificarOrientacao } from './territorial.js';
import { POSICOES, POSICAO_LABEL, REGRAS, distribuicaoPosicoes, utilizacao, evolucaoJogadores, planeamento } from './plantel.js';
import { estatisticasJogador } from './individual.js';
import { calcularAlertas, qualidadeEventos, GRAVIDADE_LABEL } from './alertas.js';

export const SLIDES = [
  { id: 'capa', titulo: 'Capa' },
  { id: 'resumo', titulo: 'Resumo executivo (KPIs e conclusões)' },
  { id: 'evolucao', titulo: 'Evolução por jogo e resultados' },
  { id: 'comparacao', titulo: 'Comparação entre períodos' },
  { id: 'coletiva', titulo: 'Equilíbrio a favor vs. contra e casa/fora' },
  { id: 'momentos', titulo: 'Momentos do jogo (blocos de 15 min)' },
  { id: 'territorio_bola', titulo: 'Território — ganhos e perdas de bola' },
  { id: 'territorio_remates', titulo: 'Território — remates feitos e sofridos' },
  { id: 'utilizacao', titulo: 'Utilização do plantel' },
  { id: 'planeamento', titulo: 'Planeamento do plantel' },
  { id: 'alertas', titulo: 'Alertas' },
  { id: 'notas', titulo: 'Notas e qualidade dos dados' },
];

// ---------- Formatação ----------

const ND = 'n/d';
const num = (v, casas = 1) => (v == null || Number.isNaN(v) ? ND
  : v.toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const sinal = (v, casas = 1) => (v == null ? ND : `${v > 0 ? '+' : ''}${num(v, casas)}`);
const pct = (v) => (v == null ? ND : `${v > 0 ? '+' : ''}${num(v, 0)}%`);
const dataCurta = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
const dataLonga = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const intervalo = (js) => (js.length ? `${dataCurta(js[0].data)}–${dataCurta(js[js.length - 1].data)}` : '');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const nomeJogador = (p) => `${p.numero ? `${p.numero} ` : ''}${p.nome}`;

// ---------- Dados ----------

// c: { equipa, filtros, atual, anterior, detalhe, plantel, minimos, config, indicadores, hoje? }
export function prepararDados(c) {
  const { eventos } = c.detalhe;
  const contar = contadorEventos(eventos);
  const contarTerco = contadorPor(eventos, e => e.terco);
  const periodo = (js) => calcularPeriodo(js, contar, contarTerco);
  const pA = periodo(c.atual);
  const pB = c.anterior.length ? periodo(c.anterior) : null;
  const linhas = compararIndicadores(pA, pB, c.indicadores);
  const idsOverview = new Set(INDICADORES_OVERVIEW.map(i => i.id));
  const linhasOverview = linhas.filter(l => idsOverview.has(l.ind.id));
  const porId = Object.fromEntries(linhas.map(l => [l.ind.id, l]));
  const conclusoes = conclusoesExecutivas(linhasOverview, c.atual.length, c.anterior.length);

  const janela = JANELAS.find(j => j.value === c.filtros.janela)?.label || '';
  const ultimo = c.atual[c.atual.length - 1];
  const epoca = c.filtros.epoca || (ultimo ? epocaDe(ultimo.data) : '');

  const casa = c.atual.filter(j => j.local === 'casa');
  const fora = c.atual.filter(j => j.local === 'fora');

  const ids = new Set(c.atual.map(j => j.id));
  const mapa = (tracker, tipo, nome, cor) => {
    const evs = filtrarEventos(eventos, { tracker, tipo, matchIds: ids });
    return { nome, cor, total: evs.length, grelha: densidade(evs, 6, 4), zonas: distribuicaoZonas(evs) };
  };

  const statsAtual = c.plantel.map(p => ({ jogador: p, stats: estatisticasJogador(p.id, c.atual, c.detalhe) }));
  const statsAnterior = c.anterior.length ? new Map(c.plantel.map(p => [p.id, estatisticasJogador(p.id, c.anterior, c.detalhe)])) : null;
  const utilizacoes = utilizacao(c.plantel, c.atual, c.detalhe);
  const distribuicao = distribuicaoPosicoes(c.plantel, c.minimos);
  const plano = planeamento({ distribuicao, utilizacoes, evolucao: statsAnterior ? evolucaoJogadores(statsAtual, statsAnterior) : [] });

  const todos = new Set([...c.anterior, ...c.atual].map(j => j.id));
  const orientacao = verificarOrientacao(eventos.filter(e => todos.has(e.match_id)));

  return {
    equipa: c.equipa,
    gerado: c.hoje || new Date().toISOString().slice(0, 10),
    epoca,
    filtros: {
      epoca: c.filtros.epoca || 'Todas',
      competicao: c.filtros.competicao || 'Todas',
      janela,
      local: c.filtros.local === 'casa' ? 'Casa' : c.filtros.local === 'fora' ? 'Fora' : 'Casa e fora',
      adversario: c.filtros.adversario || 'Todos',
    },
    nAtual: c.atual.length,
    nAnterior: c.anterior.length,
    periodoAtual: intervalo(c.atual),
    periodoTexto: c.anterior.length
      ? `${c.atual.length} jogos (${intervalo(c.atual)}) vs. ${c.anterior.length} anteriores (${intervalo(c.anterior)})`
      : `${c.atual.length} jogos (${intervalo(c.atual)})`,
    pA, pB, linhas, linhasOverview, porId, conclusoes,
    jogos: c.atual.map(j => ({
      rotulo: `${j.adversario.length > 14 ? `${j.adversario.slice(0, 13)}…` : j.adversario} ${dataCurta(j.data)}`,
      resultado: resultadoJogo(j),
      placar: j.golos_consistentes ? `${j.golos_marcados}–${j.golos_sofridos}` : null,
      adversario: j.adversario,
    })),
    series: {
      rematesF: valoresPorJogo(c.atual, contar, 'remates', 'X'),
      rematesC: valoresPorJogo(c.atual, contar, 'remates', 'Y'),
      ganhos: valoresPorJogo(c.atual, contar, 'perdas', 'X'),
      perdas: valoresPorJogo(c.atual, contar, 'perdas', 'Y'),
    },
    blocos: {
      rematesF: distribuicaoBlocos(c.atual, eventos, 'remates', 'X'),
      rematesC: distribuicaoBlocos(c.atual, eventos, 'remates', 'Y'),
      ganhos: distribuicaoBlocos(c.atual, eventos, 'perdas', 'X'),
      perdas: distribuicaoBlocos(c.atual, eventos, 'perdas', 'Y'),
    },
    casaFora: { nCasa: casa.length, nFora: fora.length, pCasa: casa.length ? periodo(casa) : null, pFora: fora.length ? periodo(fora) : null },
    mapas: {
      ganhos: mapa('perdas', 'X', 'Ganhos de bola', 'favor'),
      perdas: mapa('perdas', 'Y', 'Perdas de bola', 'contra'),
      rematesF: mapa('remates', 'X', 'Remates feitos', 'favor'),
      rematesC: mapa('remates', 'Y', 'Remates sofridos', 'contra'),
    },
    utilizacoes,
    minutosDisponiveis: utilizacoes[0]?.minutosDisponiveis ?? 0,
    plano,
    alertas: calcularAlertas(c),
    qualidade: {
      eventos: qualidadeEventos(eventos, c.atual),
      completa: c.atual.filter(j => j.codificacao === 'completa').length,
      parcial: c.atual.filter(j => j.codificacao === 'parcial').length,
      semTempos: c.atual.filter(j => !j.minutos_jogo).length,
      semResultado: c.atual.filter(j => !j.golos_consistentes).length,
      orientacaoSuspeita: orientacao.filter(o => o.estado === 'suspeito').length,
    },
  };
}

// ---------- Visual (template Matchday) ----------

const W = 13.333;
const FONTE = 'Calibri';
const C = {
  fundo: '141414', painel: '181818', cartao: '1C1C1C', linhaTabela: '262626',
  dourado: 'C9A227', branco: 'FFFFFF', cinza: '9A9A9A', cinzaEsc: '5A5A5A',
  relvado: '1B4A26', linhaRelvado: '3F7A45',
  verde: '2E7D32', vermelho: 'C62828', amarelo: 'E0A800',
  bom: '4CAF50', mau: 'EF5350',
  favor: '239973', contra: 'C97A2E', // cores dos gráficos do dashboard (validadas)
  mapaFavor: 'C9A227', mapaContra: 'E53935', // no relvado verde, dourado/vermelho leem-se melhor
};
const ESQ = { x: 0.5, y: 0.95, w: 7.78, h: 5.55 };
const PAINEL = { x: 8.5, y: 0.89, w: 4.335, h: 5.61 };

const COR_TEND = { melhoria: C.bom, agravamento: C.mau, estavel: C.cinza, neutro: C.cinza };
const TXT_TEND = { melhoria: '▲ Melhoria', agravamento: '▼ Agravamento', estavel: '■ Estável', neutro: 'Sem juízo' };

function texto(slide, t, x, y, w, h, o = {}) {
  slide.addText(t, { x, y, w, h, fontFace: FONTE, fontSize: 12, color: C.branco, margin: 0, valign: 'top', ...o });
}

function logoImg(slide, dados, x, y, w, h) {
  if (!dados.logo) return false;
  slide.addImage({ data: dados.logo, x, y, w, h, sizing: { type: 'contain', w, h } });
  return true;
}

// Cabeçalho, número da página, faixa inferior e rodapé de um slide de conteúdo.
function base(pptx, dados, { titulo, n, sub, faixa }) {
  const s = pptx.addSlide();
  s.background = { color: C.fundo };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.09, fill: { color: C.branco }, line: { color: C.branco, width: 0 } });
  const temLogo = logoImg(s, dados, 0.62, 0.29, 0.46, 0.5);
  texto(s, titulo.toUpperCase(), temLogo ? 1.22 : 0.6, 0.3, 6.6, 0.55, { fontSize: 26, bold: true, valign: 'middle' });
  if (sub) {
    texto(s, [{ text: `${sub[0]}  `, options: { bold: true } }, { text: sub[1] }], 7.05, 0.38, 4.9, 0.4, { fontSize: 12, color: C.cinza, valign: 'middle' });
  }
  texto(s, String(n), 12.2, 0.2, 0.65, 0.4, { fontSize: 16, color: C.dourado, align: 'right' });
  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 6.64, w: 12.34, h: 0.03, fill: { color: C.branco }, line: { color: C.branco, width: 0 } });
  if (faixa) {
    texto(s, faixa[0].toUpperCase(), 0.6, 6.74, 5.5, 0.3, { fontSize: 13, bold: true, color: C.dourado, valign: 'middle' });
    // Texto curto no sítio do template; longo, alinhado à direita a ocupar o espaço livre.
    const curto = faixa[1].length <= 48;
    texto(s, faixa[1], curto ? 8.94 : 4.4, 6.74, curto ? 3.9 : 8.44, 0.3, { fontSize: 11, valign: 'middle', align: curto ? 'left' : 'right', fit: 'shrink' });
  }
  texto(s, `${dados.equipa.nome.toUpperCase()}   ·   GESTÃO DESPORTIVA   ·   ÉPOCA ${dados.epoca}`, 0.6, 7.06, 8, 0.3, { fontSize: 11, color: C.cinza, valign: 'middle' });
  texto(s, dataLonga(dados.gerado), 9.5, 7.06, 3.34, 0.3, { fontSize: 11, color: C.cinza, align: 'right', valign: 'middle' });
  return s;
}

function painel(pptx, s, titulo) {
  s.addShape(pptx.ShapeType.rect, { x: PAINEL.x, y: PAINEL.y, w: 0.055, h: PAINEL.h, fill: { color: C.dourado }, line: { color: C.dourado, width: 0 } });
  s.addShape(pptx.ShapeType.rect, { x: PAINEL.x + 0.055, y: PAINEL.y, w: PAINEL.w - 0.055, h: PAINEL.h, fill: { color: C.painel }, line: { color: C.painel, width: 0 } });
  texto(s, titulo.toUpperCase(), 8.94, 1.08, 3.8, 0.45, { fontSize: 20, bold: true, color: C.dourado });
  return 1.68;
}

// Itens "ETIQUETA / valor" do painel lateral. Devolve o y seguinte.
function itensPainel(s, itens, y, { alturaValor = 0.42 } = {}) {
  itens.forEach(({ label, valor, cor }) => {
    texto(s, label.toUpperCase(), 8.94, y, 3.8, 0.24, { fontSize: 11, bold: true, color: C.dourado });
    texto(s, valor, 8.94, y + 0.25, 3.8, alturaValor, { fontSize: 12, color: cor || C.branco, fit: 'shrink' });
    y += 0.3 + alturaValor;
  });
  return y;
}

function cartao(pptx, s, x, y, w, h) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: C.cartao }, line: { color: C.cartao, width: 0 } });
  s.addShape(pptx.ShapeType.rect, { x, y, w, h: 0.05, fill: { color: C.dourado }, line: { color: C.dourado, width: 0 } });
}

const OPC_GRAFICO = {
  fontFace: FONTE,
  catAxisLabelColor: 'BFBFBF', catAxisLabelFontSize: 9, catAxisLineShow: false,
  valAxisLabelColor: 'BFBFBF', valAxisLabelFontSize: 9, valAxisLineShow: false,
  valGridLine: { color: '2E2E2E', size: 0.75 },
  showLegend: true, legendPos: 't', legendColor: C.branco, legendFontSize: 10,
  showTitle: true, titleColor: C.branco, titleFontSize: 12, titleFontFace: FONTE,
  displayBlanksAs: 'gap',
};

function graficoLinhas(pptx, s, titulo, labels, series, area) {
  s.addChart(pptx.ChartType.line, series.map(([name, values]) => ({ name, labels, values })), {
    ...area, ...OPC_GRAFICO, title: titulo,
    chartColors: [C.favor, C.contra], lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 7,
    lineDataSymbolLineColor: C.fundo, lineDataSymbolLineSize: 1.5, valAxisMinVal: 0,
  });
}

function graficoBarras(pptx, s, titulo, labels, series, area, o = {}) {
  s.addChart(pptx.ChartType.bar, series.map(([name, values]) => ({ name, labels, values })), {
    ...area, ...OPC_GRAFICO, title: titulo, barDir: 'col', barGapWidthPct: 60,
    chartColors: [C.favor, C.contra], valAxisMinVal: 0,
    showValue: true, dataLabelColor: C.branco, dataLabelFontSize: 9, dataLabelFormatCode: '0.0', dataLabelPosition: 'outEnd',
    ...o,
  });
}

function tabela(s, cab, linhas, area, larguras, o = {}) {
  const celCab = cab.map(t => ({ text: t, options: { bold: true, color: C.dourado, fill: { color: C.cartao } } }));
  const corpo = linhas.map((l, i) => l.map(cel => {
    const base = typeof cel === 'object' && cel !== null && 'text' in cel ? cel : { text: String(cel ?? ND) };
    return { text: base.text, options: { color: C.branco, fill: { color: i % 2 ? '181818' : C.fundo }, ...(base.options || {}) } };
  }));
  s.addTable([celCab, ...corpo], {
    x: area.x, y: area.y, w: area.w, colW: larguras, fontFace: FONTE, fontSize: o.fontSize || 11,
    border: { type: 'solid', pt: 0.5, color: C.linhaTabela }, rowH: o.rowH || 0.3, valign: 'middle', margin: 0.05,
  });
}

// Campo horizontal (ataque para a direita) com densidade 6×4 por cima.
function campo(pptx, s, x, y, w, h, mapa) {
  const L = { color: C.linhaRelvado, width: 1 };
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: C.relvado }, line: L });
  s.addShape(pptx.ShapeType.line, { x: x + w / 2, y, w: 0, h, line: L });
  const d = h * 0.27;
  s.addShape(pptx.ShapeType.ellipse, { x: x + w / 2 - d / 2, y: y + h / 2 - d / 2, w: d, h: d, fill: { color: C.relvado, transparency: 100 }, line: L });
  const aw = w * 0.157, ah = h * 0.6;
  s.addShape(pptx.ShapeType.rect, { x, y: y + (h - ah) / 2, w: aw, h: ah, fill: { color: C.relvado, transparency: 100 }, line: L });
  s.addShape(pptx.ShapeType.rect, { x: x + w - aw, y: y + (h - ah) / 2, w: aw, h: ah, fill: { color: C.relvado, transparency: 100 }, line: L });
  const cor = mapa.cor === 'favor' ? C.mapaFavor : C.mapaContra;
  const rows = mapa.grelha.length, cols = mapa.grelha[0].length;
  const max = Math.max(1, ...mapa.grelha.flat());
  mapa.grelha.forEach((linha, r) => linha.forEach((v, c2) => {
    if (!v) return;
    const cx = x + (c2 / cols) * w, cy = y + (r / rows) * h;
    s.addShape(pptx.ShapeType.rect, {
      x: cx, y: cy, w: w / cols, h: h / rows,
      fill: { color: cor, transparency: Math.round(85 - 65 * (v / max)) }, line: { color: C.relvado, width: 0.5 },
    });
    texto(s, String(v), cx, cy, w / cols, h / rows, { fontSize: 10, bold: true, align: 'center', valign: 'middle' });
  }));
  [1, 2].forEach(k => s.addShape(pptx.ShapeType.line, { x: x + (w * k) / 3, y, w: 0, h, line: { color: 'FFFFFF', width: 0.75, dashType: 'dash', transparency: 55 } }));
}

const fraseZonas = (z) => (z.total
  ? `Terços: def. ${num(z.tercoPct.defensivo, 0)}% · int. ${num(z.tercoPct.intermedio, 0)}% · of. ${num(z.tercoPct.ofensivo, 0)}%\nCorredores: esq. ${num(z.corredorPct.esquerdo, 0)}% · centro ${num(z.corredorPct.central, 0)}% · dir. ${num(z.corredorPct.direito, 0)}%`
  : 'Sem eventos no período.');

// ---------- Slides ----------

function slideCapa(pptx, d) {
  const s = pptx.addSlide();
  s.background = { color: C.fundo };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.09, fill: { color: C.branco }, line: { color: C.branco, width: 0 } });
  texto(s, 'GESTÃO DESPORTIVA', 0.6, 0.3, 7, 0.55, { fontSize: 26, bold: true, valign: 'middle' });
  texto(s, '1', 12.2, 0.2, 0.65, 0.4, { fontSize: 16, color: C.dourado, align: 'right' });

  if (!logoImg(s, d, 2.47, 1.95, 1.52, 1.64)) {
    s.addShape(pptx.ShapeType.roundRect, { x: 2.47, y: 1.95, w: 1.52, h: 1.64, rectRadius: 0.2, fill: { color: C.cartao }, line: { color: C.dourado, width: 1.5, dashType: 'dash' } });
    texto(s, d.equipa.nome.split(/\s+/).map(p => p[0]).join('').slice(0, 3).toUpperCase(), 2.47, 1.95, 1.52, 1.64, { fontSize: 30, bold: true, color: C.dourado, align: 'center', valign: 'middle' });
  }
  texto(s, d.equipa.nome.toUpperCase(), 0.73, 4.3, 5, 0.5, { fontSize: 24, bold: true, align: 'center' });
  texto(s, 'RELATÓRIO DE PERFORMANCE', 0.73, 4.85, 5, 0.3, { fontSize: 12, bold: true, color: C.dourado, align: 'center' });

  texto(s, String(d.nAtual), 5.6, 2.2, 2.1, 1.0, { fontSize: 54, bold: true, color: C.dourado, align: 'center', valign: 'middle' });
  texto(s, 'JOGOS ANALISADOS', 5.6, 3.2, 2.1, 0.3, { fontSize: 12, bold: true, align: 'center' });
  texto(s, d.periodoAtual, 5.6, 3.5, 2.1, 0.3, { fontSize: 12, color: C.cinza, align: 'center' });
  texto(s, 'pré-época excluída', 5.6, 3.8, 2.1, 0.3, { fontSize: 10, color: C.cinza, align: 'center' });

  s.addShape(pptx.ShapeType.roundRect, { x: 9.07, y: 1.95, w: 2.18, h: 2.16, rectRadius: 0.2, fill: { color: C.cartao }, line: { color: C.dourado, width: 1.5, dashType: 'dash' } });
  texto(s, num(d.pA.ppg, 2), 9.07, 2.3, 2.18, 0.9, { fontSize: 40, bold: true, align: 'center', valign: 'middle' });
  texto(s, 'PONTOS POR JOGO', 9.07, 3.25, 2.18, 0.3, { fontSize: 11, color: C.cinza, align: 'center' });
  texto(s, `${d.pA.V}V   ${d.pA.E}E   ${d.pA.D}D`, 7.66, 4.3, 5, 0.5, { fontSize: 24, bold: true, align: 'center' });
  texto(s, 'REGISTO', 7.66, 4.85, 5, 0.3, { fontSize: 12, bold: true, color: C.dourado, align: 'center' });

  s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.82, w: W, h: 0.04, fill: { color: C.branco }, line: { color: C.branco, width: 0 } });
  const campos = [
    ['ÉPOCA', d.filtros.epoca], ['COMPETIÇÃO', d.filtros.competicao], ['PERÍODO', d.filtros.janela],
    ['CASA/FORA', d.filtros.local], ['ADVERSÁRIO', d.filtros.adversario], ['GERADO EM', dataLonga(d.gerado)],
  ];
  campos.forEach(([l, v], i) => {
    const x = 0.65 + i * 2.04;
    texto(s, l, x, 6.25, 1.95, 0.28, { fontSize: 12, bold: true, color: C.dourado });
    texto(s, v, x, 6.55, 1.95, 0.4, { fontSize: 14, fit: 'shrink' });
  });
}

function slideResumo(pptx, d, n) {
  const s = base(pptx, d, { titulo: 'Resumo executivo', n, sub: ['PERÍODO', d.periodoTexto], faixa: ['Regra das conclusões', '≥ 3 jogos em cada período e variações ≥ 10%. Indícios a validar em vídeo.'] });
  const p = d.porId;
  const kpis = [
    ['Jogos', String(d.pA.jogos), null, `${d.pA.V}V · ${d.pA.E}E · ${d.pA.D}D`],
    ['Pontos por jogo', num(d.pA.ppg, 2), p.ppg],
    ['Golos (M–S)', d.pA.golosMarcados == null ? ND : `${d.pA.golosMarcados}–${d.pA.golosSofridos}`, p.dif_golos],
    ['Rácio ganhos/perdas', num(d.pA.racioGanhosPerdas, 2), p.racio_gp],
    ['Remates feitos / 90', num(p.remates_f_90.atual), p.remates_f_90],
    ['Remates sofridos / 90', num(p.remates_c_90.atual), p.remates_c_90],
    ['Ganhos de bola / 90', num(p.ganhos_90.atual), p.ganhos_90],
    ['Perdas de bola / 90', num(p.perdas_90.atual), p.perdas_90],
  ];
  const cw = (ESQ.w - 3 * 0.15) / 4, ch = 1.55;
  kpis.forEach(([label, valor, l, extra], i) => {
    const x = ESQ.x + (i % 4) * (cw + 0.15), y = ESQ.y + Math.floor(i / 4) * (ch + 0.15);
    cartao(pptx, s, x, y, cw, ch);
    texto(s, label.toUpperCase(), x + 0.15, y + 0.18, cw - 0.3, 0.3, { fontSize: 10, bold: true, color: C.dourado, fit: 'shrink' });
    texto(s, valor, x + 0.15, y + 0.5, cw - 0.3, 0.55, { fontSize: 26, bold: true, valign: 'middle' });
    let linha = extra || '';
    let cor = C.cinza;
    if (l && d.nAnterior) {
      if (l.anterior == null) linha = 'sem valor anterior';
      else {
        linha = `${l.diferenca > 0 ? '▲' : l.diferenca < 0 ? '▼' : '■'} ${l.ind.soAbsoluto || l.variacao == null ? sinal(l.diferenca, l.ind.casas) : pct(l.variacao)}  vs ${num(l.anterior, l.ind.casas)}`;
        cor = COR_TEND[l.tendencia] || C.cinza;
      }
    }
    texto(s, linha, x + 0.15, y + 1.1, cw - 0.3, 0.3, { fontSize: 10, color: cor, fit: 'shrink' });
  });

  // Tendências (≥ 10%)
  const yT = ESQ.y + 2 * (ch + 0.15) + 0.1;
  const lista = (t) => d.linhasOverview.filter(l => l.tendencia === t && l.variacao != null && Math.abs(l.variacao) >= 10)
    .map(l => `${l.ind.label} (${pct(l.variacao)})`).slice(0, 5);
  if (d.nAnterior) {
    [['melhoria', '▲ TENDÊNCIAS POSITIVAS', C.bom, 0], ['agravamento', '▼ TENDÊNCIAS NEGATIVAS', C.mau, 1]].forEach(([t, tit, cor, k]) => {
      const x = ESQ.x + k * (ESQ.w / 2);
      texto(s, tit, x, yT, ESQ.w / 2 - 0.2, 0.3, { fontSize: 11, bold: true, color: cor });
      const ls = lista(t);
      texto(s, ls.length ? ls.map(x2 => ({ text: x2, options: { bullet: true } })) : 'Nenhuma ≥ 10%.', x, yT + 0.32, ESQ.w / 2 - 0.2, 1.6, { fontSize: 11, color: ls.length ? C.branco : C.cinza, paraSpaceAfter: 3 });
    });
  } else {
    // Sem jogos anteriores: sem tendências, mas os restantes valores do período.
    const p = d.porId;
    const col = [
      [['Cruzamentos feitos / 90', p.cruzamentos_f_90], ['Cruzamentos sofridos / 90', p.cruzamentos_c_90], ['Cantos a favor / 90', p.cantos_f_90]],
      [['Cantos contra / 90', p.cantos_c_90], ['Faltas cometidas / 90', p.faltas_cometidas_90], ['Faltas sofridas / 90', p.faltas_sofridas_90]],
    ];
    col.forEach((itens, k) => {
      const x = ESQ.x + k * (ESQ.w / 2);
      texto(s, k ? '' : 'OUTROS INDICADORES DO PERÍODO', x, yT, ESQ.w / 2 - 0.2, 0.3, { fontSize: 11, bold: true, color: C.dourado });
      texto(s, itens.map(([l, x2]) => ({ text: `${l}: ${num(x2.atual, x2.ind.casas)}`, options: { bullet: true } })), x, yT + 0.32, ESQ.w / 2 - 0.2, 1.6, { fontSize: 11, paraSpaceAfter: 3 });
    });
  }

  let y = painel(pptx, s, 'Conclusões');
  const c = d.conclusoes;
  if (!d.nAnterior) {
    texto(s, 'Sem jogos anteriores para comparar — as conclusões precisam de comparação. Resumo do período:', 8.94, y, 3.8, 0.7, { fontSize: 11, color: C.cinza });
    itensPainel(s, [
      { label: 'Registo', valor: `${plural(d.pA.V, 'vitória', 'vitórias')} · ${plural(d.pA.E, 'empate', 'empates')} · ${plural(d.pA.D, 'derrota', 'derrotas')}${d.pA.semResultado ? ` · ${d.pA.semResultado} sem resultado` : ''}` },
      { label: 'Golos por jogo', valor: `${num(d.pA.golosMarcadosJogo, 2)} marcados · ${num(d.pA.golosSofridosJogo, 2)} sofridos` },
      { label: 'Remates / 90', valor: `${num(d.pA.rematesF.por90)} feitos · ${num(d.pA.rematesC.por90)} sofridos` },
      { label: 'Bola / 90', valor: `${num(d.pA.ganhos.por90)} ganhos · ${num(d.pA.perdas.por90)} perdas` },
    ], y + 0.8, { alturaValor: 0.32 });
    return;
  }
  if (!c.suficiente) {
    texto(s, c.motivo, 8.94, y, 3.8, 1.2, { fontSize: 12, color: C.cinza });
    return;
  }
  const f = (l) => `${l.ind.label}: ${num(l.anterior, l.ind.casas)} → ${num(l.atual, l.ind.casas)} (${pct(l.variacao)})`;
  itensPainel(s, [
    { label: 'Evolução positiva', valor: c.positiva ? f(c.positiva) : 'Nenhuma melhoria ≥ 10%.', cor: c.positiva ? C.branco : C.cinza },
    { label: 'Risco identificado', valor: c.risco ? f(c.risco) : 'Nenhum agravamento ≥ 10%.', cor: c.risco ? C.branco : C.cinza },
    { label: 'Recomendação', valor: c.recomendacao || 'Sem variações relevantes.', cor: c.recomendacao ? C.branco : C.cinza },
  ], y, { alturaValor: 0.9 });
}

function slideEvolucao(pptx, d, n) {
  const s = base(pptx, d, { titulo: 'Evolução por jogo', n, sub: ['PERÍODO', d.periodoTexto], faixa: ['Leitura', 'Falha na linha = jogo sem dados (codificação parcial sem registos).'] });
  const labels = d.jogos.map(j => j.rotulo);
  graficoLinhas(pptx, s, 'Remates por jogo', labels, [['Feitos', d.series.rematesF], ['Sofridos', d.series.rematesC]], { x: ESQ.x, y: ESQ.y, w: ESQ.w, h: 2.7 });
  graficoLinhas(pptx, s, 'Ganhos e perdas de bola por jogo', labels, [['Ganhos', d.series.ganhos], ['Perdas', d.series.perdas]], { x: ESQ.x, y: ESQ.y + 2.85, w: ESQ.w, h: 2.7 });

  let y = painel(pptx, s, 'Resultados');
  const cor = { V: C.verde, E: C.amarelo, D: C.vermelho };
  const jogos = d.jogos.slice(-12);
  jogos.forEach((j, i) => {
    const x = 8.94 + (i % 6) * 0.62, yy = y + Math.floor(i / 6) * 0.62;
    s.addShape(pptx.ShapeType.ellipse, { x, y: yy, w: 0.5, h: 0.5, fill: { color: j.resultado ? cor[j.resultado] : C.cinzaEsc }, line: { color: C.fundo, width: 1 } });
    texto(s, j.resultado || '?', x, yy, 0.5, 0.5, { fontSize: 13, bold: true, align: 'center', valign: 'middle' });
  });
  y += Math.ceil(jogos.length / 6) * 0.62 + 0.2;
  itensPainel(s, [
    { label: 'Golos marcados–sofridos', valor: d.pA.golosMarcados == null ? ND : `${d.pA.golosMarcados}–${d.pA.golosSofridos} (diferença ${sinal(d.pA.difGolos, 0)})` },
    { label: 'Pontos por jogo', valor: `${num(d.pA.ppg, 2)} (${d.pA.pontos} pontos em ${d.pA.jogosComResultado} jogos)` },
    { label: 'Remates / 90', valor: `${num(d.pA.rematesF.por90)} feitos · ${num(d.pA.rematesC.por90)} sofridos` },
  ], y, { alturaValor: 0.32 });
}

function slideComparacao(pptx, d, n) {
  if (!d.nAnterior) {
    // Sem jogos anteriores: não há comparação, mas os valores do período aparecem na mesma.
    const s0 = base(pptx, d, { titulo: 'Indicadores do período', n, faixa: ['Período', `${d.periodoTexto} — sem jogos anteriores para comparar`] });
    const ls = d.linhasOverview.map(l => [l.ind.label, { text: num(l.atual, l.ind.casas), options: { bold: true } }]);
    const meio = Math.ceil(ls.length / 2);
    [ls.slice(0, meio), ls.slice(meio)].forEach((parte, i) => {
      if (parte.length) tabela(s0, ['Indicador', 'Atual'], parte, { x: 0.5 + i * 6.27, y: 0.95, w: 6.07 }, [4.4, 1.67], { rowH: 0.36 });
    });
    return;
  }
  const s = base(pptx, d, { titulo: 'Comparação entre períodos', n, faixa: ['Períodos', d.periodoTexto] });
  const linhas = d.linhasOverview.map(l => [
    l.ind.label, num(l.anterior, l.ind.casas), { text: num(l.atual, l.ind.casas), options: { bold: true } },
    sinal(l.diferenca, l.ind.casas), l.ind.soAbsoluto ? '—' : pct(l.variacao),
    { text: TXT_TEND[l.tendencia] || ND, options: { color: COR_TEND[l.tendencia] || C.cinza, bold: true } },
  ]);
  tabela(s, ['Indicador', 'Anterior', 'Atual', 'Diferença', 'Variação', 'Tendência'], linhas, { x: 0.5, y: 0.95, w: 12.34 }, [4.4, 1.5, 1.5, 1.5, 1.5, 1.94], { rowH: 0.32 });
}

function slideColetiva(pptx, d, n) {
  const p = d.pA;
  const s = base(pptx, d, {
    titulo: 'Equilíbrio a favor vs. contra', n, sub: ['PERÍODO', d.periodoTexto],
    faixa: ['Saldos por jogo', `Remates ${sinal(p.saldoRematesJogo)} · Cruz. ${sinal(p.saldoCruzamentosJogo)} · Cantos ${sinal(p.saldoCantosJogo)} · Rácio G/P ${num(p.racioGanhosPerdas, 2)}`],
  });
  const arred = (v) => (v == null ? null : Math.round(v * 10) / 10);
  graficoBarras(pptx, s, 'Média por jogo — a favor vs. contra', ['Remates', 'Cruzamentos', 'Cantos', 'Bola (ganhos / perdas)'], [
    ['A favor', [p.rematesF.porJogo, p.cruzamentosF.porJogo, p.cantosF.porJogo, p.ganhos.porJogo].map(arred)],
    ['Contra', [p.rematesC.porJogo, p.cruzamentosC.porJogo, p.cantosC.porJogo, p.perdas.porJogo].map(arred)],
  ], ESQ);

  let y = painel(pptx, s, 'Casa vs. fora');
  const cf = d.casaFora;
  texto(s, `Casa: ${cf.nCasa} jogo(s) · Fora: ${cf.nFora} jogo(s)`, 8.94, y - 0.1, 3.8, 0.3, { fontSize: 11, color: C.cinza });
  y += 0.3;
  const v = (pp, f, casas = 1) => (pp ? num(f(pp), casas) : ND);
  itensPainel(s, [
    ['Pontos por jogo', x => x.ppg, 2], ['Golos marcados / jogo', x => x.golosMarcadosJogo, 2], ['Golos sofridos / jogo', x => x.golosSofridosJogo, 2],
    ['Remates feitos / 90', x => x.rematesF.por90], ['Remates sofridos / 90', x => x.rematesC.por90], ['Perdas de bola / 90', x => x.perdas.por90],
  ].map(([label, f, casas]) => ({ label, valor: `Casa ${v(cf.pCasa, f, casas)}   ·   Fora ${v(cf.pFora, f, casas)}` })), y, { alturaValor: 0.3 });
}

function slideMomentos(pptx, d, n) {
  const s = base(pptx, d, { titulo: 'Momentos do jogo', n, sub: ['PERÍODO', d.periodoTexto], faixa: ['Nota', 'Média por jogo. 30–45+ e 75–90+ incluem os descontos.'] });
  const arred = (a) => a.map(v => (v == null ? null : Math.round(v * 10) / 10));
  const b = d.blocos;
  graficoBarras(pptx, s, 'Remates por bloco de 15 min', BLOCOS_15, [['Feitos', arred(b.rematesF.mediaPorJogo)], ['Sofridos', arred(b.rematesC.mediaPorJogo)]], { x: ESQ.x, y: ESQ.y, w: ESQ.w, h: 2.7 });
  graficoBarras(pptx, s, 'Ganhos e perdas de bola por bloco de 15 min', BLOCOS_15, [['Ganhos', arred(b.ganhos.mediaPorJogo)], ['Perdas', arred(b.perdas.mediaPorJogo)]], { x: ESQ.x, y: ESQ.y + 2.85, w: ESQ.w, h: 2.7 });

  const maior = (dist) => {
    const m = dist.mediaPorJogo;
    if (!dist.jogosConsiderados) return ND;
    const i = m.indexOf(Math.max(...m));
    return `${BLOCOS_15[i]} (${num(m[i])} por jogo)`;
  };
  const sem = b.rematesF.semMinuto + b.rematesC.semMinuto + b.ganhos.semMinuto + b.perdas.semMinuto;
  const y = painel(pptx, s, 'Leitura');
  itensPainel(s, [
    { label: 'Mais remates feitos', valor: maior(b.rematesF) },
    { label: 'Mais remates sofridos', valor: maior(b.rematesC) },
    { label: 'Mais ganhos de bola', valor: maior(b.ganhos) },
    { label: 'Mais perdas de bola', valor: maior(b.perdas) },
    { label: 'Eventos sem minuto (fora)', valor: String(sem), cor: sem ? C.dourado : C.branco },
  ], y, { alturaValor: 0.32 });
}

function slideTerritorio(pptx, d, n, titulo, [a, b]) {
  const s = base(pptx, d, { titulo, n, sub: ['PERÍODO', d.periodoTexto], faixa: ['Nota', 'Densidade dos eventos registados, não ocupação do terreno.'] });
  const cw = 4.0, chh = 2.59;
  [a, b].forEach((m, i) => {
    const y = 1.05 + i * 2.78;
    texto(s, m.nome.toUpperCase(), ESQ.x, y, 1.75, 0.5, { fontSize: 13, bold: true, color: C.dourado });
    texto(s, `${m.total} evento(s)`, ESQ.x, y + 0.5, 1.75, 0.3, { fontSize: 11, color: C.cinza });
    texto(s, 'ataque →', ESQ.x, y + 0.8, 1.75, 0.3, { fontSize: 11, color: C.cinza });
    campo(pptx, s, 2.35, y, cw, chh, m);
  });
  const y = painel(pptx, s, 'Distribuição');
  itensPainel(s, [a, b].map(m => ({ label: m.nome, valor: fraseZonas(m.zonas) })), y, { alturaValor: 0.65 });
}

function slideUtilizacao(pptx, d, n) {
  const s = base(pptx, d, { titulo: 'Utilização do plantel', n, sub: ['PERÍODO', d.periodoTexto], faixa: ['Minutos disponíveis', `${d.minutosDisponiveis || ND} min (jogos com tempos completos)`] });
  const ordem = (p) => (p.posicao ? POSICOES.indexOf(p.posicao) : 99);
  const us = d.utilizacoes.slice().sort((x, y) => ordem(x.jogador) - ordem(y.jogador) || y.stats.minutos - x.stats.minutos);
  const linha = (u) => [
    nomeJogador(u.jogador), u.jogador.posicao || ND, String(u.stats.convocatorias),
    `${u.stats.jogos} (${u.stats.titularidades})`, String(u.stats.minutos),
    `${u.pctMinutos == null ? ND : `${num(u.pctMinutos, 0)}%`}${u.incompleto ? '*' : ''}`,
  ];
  const porTabela = 18;
  const metade = Math.min(porTabela, Math.ceil(us.length / 2));
  const partes = [us.slice(0, metade), us.slice(metade, metade + porTabela)];
  const cab = ['Jogador', 'Pos.', 'Conv.', 'Jogos (tit.)', 'Min.', '% disp.'];
  partes.forEach((ls, i) => {
    if (ls.length) tabela(s, cab, ls.map(linha), { x: 0.5 + i * 6.27, y: 0.95, w: 6.07 }, [2.35, 0.6, 0.62, 1.0, 0.7, 0.8], { fontSize: 10, rowH: 0.27 });
  });
  if (us.length > metade + porTabela) texto(s, `+ ${us.length - metade - porTabela} jogador(es) não mostrados.`, 0.5, 6.3, 6, 0.3, { fontSize: 10, color: C.cinza });
}

function slidePlaneamento(pptx, d, n) {
  const s = base(pptx, d, {
    titulo: 'Planeamento do plantel', n,
    faixa: ['Regras', `Dependência: ≥ ${REGRAS.dependenciaPct}% dos minutos da posição sem alternativa · pouco utilizado: < ${REGRAS.poucoUsoPct}% dos minutos em ≥ ${REGRAS.poucoUsoConvocatorias} convocatórias`],
  });
  const { necessidades, prioridades, acompanhamento, decisoes } = d.plano;
  const pos = (p) => `${p} — ${POSICAO_LABEL[p]}`;
  const lim = (arr, n2) => (arr.length > n2 ? [...arr.slice(0, n2), `+ ${arr.length - n2} …`] : arr);
  const bloco = (titulo, itens, vazio, y, h) => {
    texto(s, titulo, ESQ.x, y, ESQ.w, 0.3, { fontSize: 13, bold: true, color: C.dourado });
    texto(s, itens.length ? itens.map(t => ({ text: t, options: { bullet: true } })) : vazio, ESQ.x, y + 0.35, ESQ.w, h - 0.4, { fontSize: 12, color: itens.length ? C.branco : C.cinza, paraSpaceAfter: 4, fit: 'shrink' });
  };
  bloco('NECESSIDADES IDENTIFICADAS', lim(necessidades.map(x => `${pos(x.posicao)}: ${x.atuais} de raiz para um mínimo de ${x.minimo} (faltam ${x.defice})${x.alternativas.length ? ` — podem atuar: ${x.alternativas.map(nomeJogador).join(', ')}` : ''}`), 4),
    d.plano.necessidades.length ? '' : 'Nenhuma (ou mínimos por posição não definidos).', 0.95, 1.85);
  bloco('POSIÇÕES PRIORITÁRIAS', lim(prioridades.map(p => `${pos(p.posicao)} — ${p.motivo === 'defice' ? `défice de ${p.n.defice}` : `dependência de ${nomeJogador(p.d.jogador)} (${num(p.d.quota, 0)}% dos minutos)`}`), 4),
    'Sem posições prioritárias pelas regras atuais.', 2.85, 1.75);
  const TXT = {
    pouco_utilizado: (a) => `${nomeJogador(a.jogador)}: ${num(a.u.pctMinutos, 0)}% dos minutos em ${a.u.stats.convocatorias} convocatórias`,
    minutos_incompletos: (a) => `${nomeJogador(a.jogador)}: minutos desconhecidos em algum jogo`,
    evolucao_negativa: (a) => `${nomeJogador(a.jogador)}: rácio ganhos/perdas ${num(a.e.anterior, 2)} → ${num(a.e.atual, 2)}`,
  };
  bloco('ACOMPANHAMENTO', lim(acompanhamento.map(a => TXT[a.tipo](a)), 5), 'Nenhum jogador a sinalizar.', 4.65, 1.9);

  const y = painel(pptx, s, 'Possíveis decisões');
  const decs = decisoes.map(x => (x.tipo === 'reforcar'
    ? `Reforçar ${pos(x.posicao)} — recrutar ou adaptar${x.n.alternativas.length ? ` (${x.n.alternativas.map(nomeJogador).join(', ')})` : ''}`
    : `Preparar alternativa a ${nomeJogador(x.d.jogador)} em ${pos(x.posicao)}`));
  texto(s, decs.length ? lim(decs, 7).map(t => ({ text: t, options: { bullet: true } })) : 'Sem decisões sugeridas pelas regras atuais.', 8.94, y, 3.8, 4.6, { fontSize: 12, color: decs.length ? C.branco : C.cinza, paraSpaceAfter: 6, fit: 'shrink' });
}

function slideAlertas(pptx, d, n) {
  const s = base(pptx, d, { titulo: 'Alertas', n, faixa: ['Período', d.periodoTexto] });
  const { alertas, col } = d.alertas;
  if (!alertas.length) {
    texto(s, d.nAnterior && col.suficiente ? 'Nenhum alerta com as regras configuradas.' : 'Nenhum alerta — os alertas de evolução precisam de pelo menos 3 jogos no período atual e no anterior.', ESQ.x, 2.5, 12.3, 1, { fontSize: 18, color: C.cinza, align: 'center' });
    return;
  }
  const corG = { alta: C.mau, media: C.amarelo, baixa: C.cinza };
  const v = (a, x) => (x == null ? ND : a.tipo === 'dependencia' ? `${num(x, 0)}%` : num(x, 2));
  const max = 12;
  const linhas = alertas.slice(0, max).map(a => [
    { text: GRAVIDADE_LABEL[a.gravidade], options: { color: corG[a.gravidade], bold: true } },
    a.label, { text: v(a, a.atual), options: { bold: true } },
    a.tipo === 'dependencia' ? '—' : v(a, a.anterior),
    a.tipo === 'dependencia' ? '—' : pct(a.variacao),
    a.tipo === 'dependencia' ? `≥ ${num(a.limite, 0)}%` : `${num(a.limite, 0)}%`,
    a.recomendacao,
  ]);
  tabela(s, ['Gravidade', 'Indicador', 'Atual', 'Anterior', 'Variação', 'Limite', 'Recomendação de análise'], linhas, { x: 0.5, y: 0.95, w: 12.34 }, [1.0, 3.1, 0.85, 0.85, 0.9, 0.8, 4.84], { fontSize: 10, rowH: 0.4 });
  if (alertas.length > max) texto(s, `+ ${alertas.length - max} alerta(s) — ver a página Alertas.`, 0.5, 6.3, 8, 0.3, { fontSize: 10, color: C.cinza });
}

function slideNotas(pptx, d, n) {
  const s = base(pptx, d, { titulo: 'Notas e qualidade dos dados', n, faixa: ['Regra', '"n/d" = dado não disponível — nunca é tratado como zero.'] });
  const q = d.qualidade, e = q.eventos;
  const cartoes = [
    ['CODIFICAÇÃO', `${q.completa} completa · ${q.parcial} parcial`, 'Num jogo parcial, "nenhum evento" não conta como zero.'],
    ['TEMPOS E MINUTOS', `${q.semTempos} jogo(s) sem tempos completos`, 'Esses jogos ficam fora dos valores por 90.'],
    ['RESULTADOS', `${q.semResultado} jogo(s) sem resultado fiável`, 'Golos por registar → resultado n/d, nunca 0-0.'],
    ['ATRIBUIÇÃO A JOGADORES', `${e.semJogador} de ${e.atribuiveis} ações sem jogador`, 'Os valores individuais são um mínimo.'],
    ['ORIENTAÇÃO DE ATAQUE', `${q.orientacaoSuspeita} parte(s) suspeita(s)`, 'Mapas e zonas destas partes podem estar trocados.'],
    ['EVENTOS', `${e.semMinuto} sem minuto · ${e.duplicados} duplicado(s) provável(eis)`, 'Sem minuto ficam fora dos blocos de 15 min.'],
  ];
  const cw = (12.34 - 2 * 0.3) / 3, chh = 2.45;
  cartoes.forEach(([l, v, nota], i) => {
    const x = 0.5 + (i % 3) * (cw + 0.3), y = 1.0 + Math.floor(i / 3) * (chh + 0.25);
    cartao(pptx, s, x, y, cw, chh);
    texto(s, l, x + 0.45, y + 0.4, cw - 0.8, 0.3, { fontSize: 12, bold: true, color: C.dourado });
    texto(s, v, x + 0.45, y + 0.8, cw - 0.8, 0.7, { fontSize: 16, fit: 'shrink' });
    texto(s, nota, x + 0.45, y + 1.55, cw - 0.8, 0.7, { fontSize: 11, color: C.cinza, fit: 'shrink' });
  });
}

// ---------- Montagem ----------

export function construirApresentacao(pptx, dados, { selecao = SLIDES.map(x => x.id) } = {}) {
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Análise de Jogo';
  pptx.title = `${dados.equipa.nome} — Gestão Desportiva`;
  const quer = new Set(selecao);
  let n = 1;
  const proximo = () => ++n;
  if (quer.has('capa')) slideCapa(pptx, dados);
  else n = 0;
  if (quer.has('resumo')) slideResumo(pptx, dados, proximo());
  if (quer.has('evolucao')) slideEvolucao(pptx, dados, proximo());
  if (quer.has('comparacao')) slideComparacao(pptx, dados, proximo());
  if (quer.has('coletiva')) slideColetiva(pptx, dados, proximo());
  if (quer.has('momentos')) slideMomentos(pptx, dados, proximo());
  if (quer.has('territorio_bola')) slideTerritorio(pptx, dados, proximo(), 'Território — ganhos e perdas', [dados.mapas.ganhos, dados.mapas.perdas]);
  if (quer.has('territorio_remates')) slideTerritorio(pptx, dados, proximo(), 'Território — remates', [dados.mapas.rematesF, dados.mapas.rematesC]);
  if (quer.has('utilizacao')) slideUtilizacao(pptx, dados, proximo());
  if (quer.has('planeamento')) slidePlaneamento(pptx, dados, proximo());
  if (quer.has('alertas')) slideAlertas(pptx, dados, proximo());
  if (quer.has('notas')) slideNotas(pptx, dados, proximo());
  return pptx;
}

export function nomeFicheiro(dados) {
  const limpo = dados.equipa.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Gestao-Desportiva_${limpo}_${dados.gerado}.pptx`;
}
