/**
 * Análise de Jogo — js/direcao/alertas.js
 * Configuração dos indicadores e regras dos alertas do Dashboard
 * Executivo (página Alertas, fase 7). Só funções puras,
 * testadas em tests/alertas.test.mjs.
 *
 * Configuração (tabela kpi_targets, uma linha por indicador): direção
 * favorável, limite (%), gravidade e se o alerta está ativo. Sem linha,
 * vale o valor por omissão (direção do catálogo INDICADORES; alertas
 * por omissão em ALERTAS_PADRAO). A direção configurada vale em todo o
 * dashboard (tendências do Overview e da Performance Coletiva).
 *
 * Regras (transparentes, mostradas na página):
 *  - Coletivo: período atual vs. anterior, >= 3 jogos em cada um; alerta
 *    quando a evolução é no sentido desfavorável e |variação| >= limite.
 *    Indicadores "só em absoluto" (saldos, diferença de golos) não têm
 *    variação % e não geram alertas.
 *  - Produção individual: (ganhos + remates + cruzamentos) por 90 de cada
 *    jogador, com >= 90 min e >= 5 dessas ações em cada período; alerta
 *    quando cai pelo menos o limite. Perdas e faltas ficam de fora (mais
 *    perdas não é automaticamente pior).
 *  - Dependência: um jogador com >= limite % dos minutos da sua posição e
 *    nenhuma alternativa (regra de ../plantel.js).
 *
 * Versão: 1.1 (2026-11-17)
 *
 * Histórico:
 *   1.1 — calcularAlertas(): o cálculo completo, partilhado pela página
 *         Alertas e pela exportação para PowerPoint.
 *   1.0 — criação (fase 7).
 */

import {
  INDICADORES, RECOMENDACOES, variacaoPct, contadorEventos, contadorPor, calcularPeriodo, compararIndicadores,
} from './metricas.js';
import { estatisticasJogador } from './individual.js';
import { REGRAS, distribuicaoPosicoes, utilizacao, planeamento } from './plantel.js';

export const GRAVIDADES = ['alta', 'media', 'baixa'];
export const GRAVIDADE_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

// Os dois alertas que não são um indicador coletivo do catálogo.
export const ESPECIAIS = [
  { id: 'producao_individual', label: 'Redução da produção individual', descricao: '(ganhos + remates + cruzamentos) por 90 de cada jogador', direcao: 'subir' },
  { id: 'dependencia', label: 'Dependência excessiva de um jogador', descricao: 'quota de minutos da posição de um só jogador (limite = quota mínima, em %)', direcao: 'subir' },
];

// Alertas ativos por omissão (os pedidos para a Gestão Desportiva).
export const ALERTAS_PADRAO = {
  perdas_terco_def_90: { limite: 15, gravidade: 'alta' },
  remates_f_90: { limite: 15, gravidade: 'media' },
  remates_c_90: { limite: 15, gravidade: 'alta' },
  ganhos_terco_of_90: { limite: 15, gravidade: 'media' },
  racio_gp: { limite: 15, gravidade: 'media' },
  producao_individual: { limite: 30, gravidade: 'media' },
  dependencia: { limite: 80, gravidade: 'media' },
};
const LIMITE_OMISSAO = 15;

// targets: linhas de kpi_targets. Devolve Map id → configuração efetiva.
export function configuracao(targets = [], indicadores = INDICADORES) {
  const porId = new Map(targets.map(t => [t.indicador, t]));
  const todos = [...indicadores, ...ESPECIAIS];
  return new Map(todos.map(ind => {
    const t = porId.get(ind.id);
    const padrao = ALERTAS_PADRAO[ind.id];
    if (t) {
      return [ind.id, { direcao: t.direcao, limite: Number(t.limite_pct), gravidade: t.gravidade, ativo: t.ativo, origem: 'configurado' }];
    }
    return [ind.id, {
      direcao: ind.direcao ?? null,
      limite: padrao?.limite ?? LIMITE_OMISSAO,
      gravidade: padrao?.gravidade ?? 'media',
      ativo: !!padrao && !ind.soAbsoluto,
      origem: 'omissao',
    }];
  }));
}

// Catálogo com a direção favorável configurada (para compararIndicadores).
export function indicadoresConfigurados(config, indicadores = INDICADORES) {
  return indicadores.map(i => (config.has(i.id) ? { ...i, direcao: config.get(i.id).direcao } : i));
}

const ordemGravidade = (g) => GRAVIDADES.indexOf(g);
export function ordenarAlertas(alertas) {
  return alertas.slice().sort((a, b) => ordemGravidade(a.gravidade) - ordemGravidade(b.gravidade)
    || Math.abs(b.variacao ?? 0) - Math.abs(a.variacao ?? 0));
}

// linhas: compararIndicadores(...) com indicadoresConfigurados.
export function alertasColetivos(linhas, config, nAtual, nAnterior, { minJogos = 3 } = {}) {
  if (nAtual < minJogos || nAnterior < minJogos) return { suficiente: false, alertas: [] };
  const alertas = linhas.flatMap(l => {
    const c = config.get(l.ind.id);
    if (!c?.ativo || !c.direcao || l.ind.soAbsoluto || l.variacao == null) return [];
    if (l.tendencia !== 'agravamento' || Math.abs(l.variacao) < c.limite) return [];
    return [{
      tipo: 'coletivo', id: l.ind.id, label: l.ind.label, casas: l.ind.casas,
      atual: l.atual, anterior: l.anterior, variacao: l.variacao, limite: c.limite, gravidade: c.gravidade,
      recomendacao: RECOMENDACOES[l.ind.id] || 'Rever em vídeo os jogos do período para perceber a origem da variação.',
    }];
  });
  return { suficiente: true, alertas };
}

// Produção individual por 90, ou null se algum componente for n/d.
export function producao90(stats) {
  const v = ['ganhos', 'remates', 'cruzamentos'].map(k => stats.por90[k]);
  return v.some(x => x == null) ? null : v.reduce((a, b) => a + b, 0);
}

// statsAtual: [{ jogador, stats }]; statsAnterior: Map id → stats.
export function alertasProducaoIndividual(statsAtual, statsAnterior, config, { minMinutos = 90, minAcoes = 5 } = {}) {
  const c = config.get('producao_individual');
  if (!c?.ativo || !statsAnterior) return [];
  const acoes = (s) => s.total.ganhos + s.total.remates + s.total.cruzamentos;
  return statsAtual.flatMap(({ jogador, stats: a }) => {
    const b = statsAnterior.get(jogador.id);
    if (!b || a.minutosBase90 < minMinutos || b.minutosBase90 < minMinutos || acoes(b) < minAcoes) return [];
    const atual = producao90(a), anterior = producao90(b);
    const variacao = variacaoPct(atual, anterior);
    if (variacao == null || variacao > -c.limite) return [];
    return [{
      tipo: 'individual', id: 'producao_individual', jogador,
      label: `Produção individual — ${jogador.numero ? `${jogador.numero} ` : ''}${jogador.nome}`, casas: 1,
      atual, anterior, variacao, limite: c.limite, gravidade: c.gravidade,
      recomendacao: 'Rever em vídeo os últimos jogos do jogador: função, minutos, contexto (adversário, sistema) e carga.',
    }];
  });
}

// dependencias: planeamento(...).dependencias calculado com o limite configurado.
export function alertasDependencia(dependencias, config) {
  const c = config.get('dependencia');
  if (!c?.ativo) return [];
  return dependencias.map(d => ({
    tipo: 'dependencia', id: 'dependencia', jogador: d.jogador, posicao: d.posicao,
    label: `Dependência em ${d.posicao} — ${d.jogador.numero ? `${d.jogador.numero} ` : ''}${d.jogador.nome}`, casas: 0,
    atual: d.quota, anterior: null, variacao: null, limite: c.limite, gravidade: c.gravidade, alternativas: d.alternativas,
    recomendacao: `Preparar uma alternativa em ${d.posicao} (adaptação ou recrutamento) e gerir a carga do jogador.`,
  }));
}

// ---------- Qualidade dos dados ----------

const TIPOS_VALIDOS = new Set(['faltas', 'cantos', 'cruzamentos', 'perdas', 'remates'].flatMap(t => [`${t}|X`, `${t}|Y`]));
// Ações que têm de ser de um jogador nosso (as mesmas de individual.js).
const ATRIBUIVEIS = new Set(['perdas|X', 'perdas|Y', 'remates|X', 'cruzamentos|X', 'faltas|X', 'faltas|Y']);

// Validações dos eventos dos jogos do período. Duplicado provável = mesmo
// jogo, campo, tipo, parte e coordenadas exatas (dois cliques no mesmo
// ponto ao centésimo de % são quase sempre o mesmo evento registado 2x).
export function qualidadeEventos(eventos, jogos) {
  const ids = new Set(jogos.map(j => j.id));
  const evs = eventos.filter(e => ids.has(e.match_id));
  const vistos = new Map();
  let duplicados = 0;
  evs.forEach(e => {
    const k = `${e.match_id}|${e.tracker_id}|${e.tipo}|${e.parte}|${e.x_pct}|${e.y_pct}`;
    if (vistos.has(k)) duplicados++; else vistos.set(k, true);
  });
  const fora = (v) => v == null || v < 0 || v > 100;
  const atribuiveis = evs.filter(e => ATRIBUIVEIS.has(`${e.tracker_id}|${e.tipo}`));
  return {
    total: evs.length,
    tiposDesconhecidos: evs.filter(e => !TIPOS_VALIDOS.has(`${e.tracker_id}|${e.tipo}`)).length,
    coordenadasInvalidas: evs.filter(e => fora(e.x_pct) || fora(e.y_pct)).length,
    semMinuto: evs.filter(e => e.minuto == null).length,
    parteInvalida: evs.filter(e => e.parte !== 1 && e.parte !== 2).length,
    duplicados,
    atribuiveis: atribuiveis.length,
    semJogador: atribuiveis.filter(e => !e.player_id).length,
  };
}

// ---------- Tudo junto (página Alertas e exportação PowerPoint) ----------

// c: { atual, anterior, detalhe, plantel, minimos, config, indicadores }
export function calcularAlertas(c) {
  const { eventos } = c.detalhe;
  const contar = contadorEventos(eventos);
  const contarTerco = contadorPor(eventos, e => e.terco);
  const pA = calcularPeriodo(c.atual, contar, contarTerco);
  const pB = c.anterior.length ? calcularPeriodo(c.anterior, contar, contarTerco) : null;
  const col = alertasColetivos(compararIndicadores(pA, pB, c.indicadores), c.config, c.atual.length, c.anterior.length);

  const statsAtual = c.plantel.map(p => ({ jogador: p, stats: estatisticasJogador(p.id, c.atual, c.detalhe) }));
  const statsAnterior = c.anterior.length
    ? new Map(c.plantel.map(p => [p.id, estatisticasJogador(p.id, c.anterior, c.detalhe)]))
    : null;
  const ind = alertasProducaoIndividual(statsAtual, statsAnterior, c.config);

  const regras = { ...REGRAS, dependenciaPct: c.config.get('dependencia').limite };
  const dist = distribuicaoPosicoes(c.plantel, c.minimos);
  const deps = planeamento({ distribuicao: dist, utilizacoes: utilizacao(c.plantel, c.atual, c.detalhe) }, regras).dependencias;
  const dep = alertasDependencia(deps, c.config);

  return { col, alertas: ordenarAlertas([...col.alertas, ...ind, ...dep]) };
}
