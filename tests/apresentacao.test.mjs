// Testes da exportação para PowerPoint (js/direcao/apresentacao.js).
// Usa um "pptx" falso que só regista o que é desenhado — não precisa da
// biblioteca PptxGenJS. Correr: node --test 'tests/*.test.mjs'

import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararDados, construirApresentacao, nomeFicheiro, SLIDES } from '../js/direcao/apresentacao.js';
import { configuracao, indicadoresConfigurados } from '../js/direcao/alertas.js';

function pptxFalso() {
  const slides = [];
  return {
    slides,
    ShapeType: { rect: 'rect', line: 'line', ellipse: 'ellipse', roundRect: 'roundRect' },
    ChartType: { line: 'line', bar: 'bar' },
    addSlide() {
      const s = { textos: [], graficos: [], tabelas: [], formas: 0, imagens: 0 };
      s.addText = (t) => s.textos.push(Array.isArray(t) ? t.map(x => x.text).join(' | ') : t);
      s.addShape = () => { s.formas++; };
      s.addChart = (tipo, dados) => s.graficos.push({ tipo, dados });
      s.addTable = (linhas) => s.tabelas.push(linhas);
      s.addImage = () => { s.imagens++; };
      slides.push(s);
      return s;
    },
  };
}

const tm = (id) => ({ id, parte1_inicio: '2026-10-01T15:00:00Z', parte1_fim: '2026-10-01T15:45:00Z', parte2_inicio: '2026-10-01T16:00:00Z', parte2_fim: '2026-10-01T16:45:00Z' });
const jogo = (i, extra = {}) => ({ id: `m${i}`, data: `2026-10-0${i}`, adversario: `Adv${i}`, local: 'casa', codificacao: 'completa', minutos_jogo: 90, golos_consistentes: true, golos_marcados: 1, golos_sofridos: 0, ...extra });

function dados(extra = {}) {
  const config = configuracao([]);
  const jogos = [1, 2, 3, 4, 5, 6].map(i => jogo(i, i === 2 ? { codificacao: 'parcial' } : {}));
  const eventos = jogos.flatMap(j => [
    { match_id: j.id, tracker_id: 'remates', tipo: 'X', parte: 1, minuto: 10, x_pct: 80, y_pct: 50, x_pct_normalizado: 80, y_pct_normalizado: 50, terco: 'ofensivo', corredor: 'central', player_id: 'p1' },
    { match_id: j.id, tracker_id: 'remates', tipo: 'Y', parte: 2, minuto: 20, x_pct: 15, y_pct: 40, x_pct_normalizado: 15, y_pct_normalizado: 40, terco: 'defensivo', corredor: 'central', player_id: null },
  ]).filter(e => e.match_id !== 'm2' || e.tipo === 'X');
  return prepararDados({
    equipa: { id: 't', nome: 'Clube Teste' }, filtros: { epoca: '2026/27', competicao: '', janela: '3', local: '', adversario: '' },
    atual: jogos.slice(3), anterior: jogos.slice(0, 3),
    detalhe: { eventos, convocados: jogos.map(j => ({ match_id: j.id, player_id: 'p1', estado: 'Titular', substituicao: null })), tempos: jogos.map(j => tm(j.id)), golos: [] },
    plantel: [{ id: 'p1', numero: '9', nome: 'Avançado', posicao: 'PL', posicoes_secundarias: [] }], minimos: [],
    config, indicadores: indicadoresConfigurados(config), hoje: '2026-11-17', ...extra,
  });
}

test('prepararDados: mesmos números do dashboard, n/d onde falta', () => {
  const d = dados();
  assert.equal(d.nAtual, 3);
  assert.equal(d.pA.V, 3);
  assert.equal(d.porId.remates_f_90.atual, 1);
  assert.deepEqual(d.series.rematesC, [1, 1, 1]);
  assert.equal(d.mapas.rematesF.total, 3);
  assert.equal(d.filtros.janela, 'Últimos 3 jogos');
  // m2 (anterior) é parcial e sem remates contra → fica fora, não conta como 0
  assert.equal(d.pB.rematesC.jogosConsiderados, 2);
});

test('construirApresentacao: todos os slides, numeração e gráficos nativos', () => {
  const p = pptxFalso();
  construirApresentacao(p, dados());
  assert.equal(p.slides.length, SLIDES.length);
  assert.equal(p.layout, 'LAYOUT_WIDE');
  assert.ok(p.slides[2].graficos.length === 2);              // evolução: 2 gráficos de linhas
  assert.ok(p.slides[3].tabelas.length === 1);               // comparação
  assert.ok(p.slides[1].textos.some(t => /CONCLUSÕES/.test(t)));
  assert.ok(p.slides[11].textos.includes('12'));             // número da página
  assert.ok(p.slides[5].textos.some(t => /CLUBE TESTE/.test(t)));
});

test('construirApresentacao: seleção de slides e numeração sem capa', () => {
  const p = pptxFalso();
  construirApresentacao(p, dados(), { selecao: ['alertas', 'notas'] });
  assert.equal(p.slides.length, 2);
  assert.ok(p.slides[0].textos.includes('1'));
  assert.ok(p.slides[1].textos.includes('2'));
});

test('nomeFicheiro: sem acentos nem espaços', () => {
  assert.equal(nomeFicheiro({ equipa: { nome: 'ADC Sanguedo Séniores' }, gerado: '2026-11-17' }), 'Gestao-Desportiva_ADC-Sanguedo-Seniores_2026-11-17.pptx');
});

test('sem jogos anteriores: sem comparação, mas com os valores do período', async () => {
  const { prepararDados: preparar } = await import('../js/direcao/apresentacao.js');
  const base = dados();
  const d = { ...base, nAnterior: 0, pB: null, linhasOverview: base.linhasOverview.map(l => ({ ...l, anterior: null, diferenca: null, variacao: null, tendencia: null })) };
  const p = pptxFalso();
  construirApresentacao(p, d, { selecao: ['resumo', 'comparacao'] });
  const [resumo, comp] = p.slides;
  assert.ok(comp.textos.includes('INDICADORES DO PERÍODO'));
  assert.equal(comp.tabelas.length, 2);
  assert.equal(comp.tabelas[0][0].length, 2);                 // só Indicador | Atual
  assert.ok(!resumo.textos.some(t => /sem valor anterior/.test(t)));
  assert.ok(resumo.textos.some(t => /OUTROS INDICADORES DO PERÍODO/.test(t)));
  assert.ok(typeof preparar === 'function');
});
