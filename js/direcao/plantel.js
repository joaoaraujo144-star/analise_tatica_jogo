/**
 * Análise de Jogo — js/direcao/plantel.js
 * Fórmulas da Gestão do Plantel (pages/direcao.html, fase 6). Só funções
 * puras, testadas em tests/plantel.test.mjs.
 *
 * Fontes: players (posição principal e secundárias, data de nascimento
 * quando o jogador a preencheu), posicao_minimos (mínimo desejado por
 * posição, definido pela Direção — nunca inventado: sem mínimo, o défice
 * é n/d) e as estatísticas de js/direcao/individual.js.
 *
 * Regras de planeamento (mostradas também na interface):
 *  - Necessidade: jogadores de raiz numa posição < mínimo definido.
 *  - Dependência: um jogador com >= 80% dos minutos da posição e nenhuma
 *    alternativa (outro de raiz ou quem a tem como secundária). Com 1
 *    alternativa (o normal: titular + suplente) não é dependência.
 *  - Pouco utilizado: >= 3 convocatórias e < 20% dos minutos disponíveis.
 *  - Evolução: variação do rácio ganhos/perdas >= 20%, só com >= 90 min
 *    e >= 5 ganhos+perdas em cada período (o rácio é a única leitura com
 *    sentido favorável claro em qualquer posição; perdas sozinhas não).
 *  Tudo são possíveis decisões para a Direção avaliar, não decisões.
 *
 * Disponibilidade (lesões/castigos) e contratos não têm fonte na base de
 * dados: FONTES_FUTURAS documenta o que seria preciso, e a interface
 * mostra "Dados indisponíveis" em vez de os simular.
 *
 * Versão: 1.1 (2026-11-17)
 *
 * Histórico:
 *   1.1 — dependência só sem nenhuma alternativa (com titular + suplente
 *         quase todas as posições apareciam como dependência).
 *   1.0 — criação (fase 6).
 */

import { estatisticasJogador } from './individual.js';
import { variacaoPct } from './metricas.js';

export const POSICOES = ['GR', 'DD', 'DC', 'DE', 'MDC', 'MC', 'MO', 'ED', 'EE', 'PL'];
export const POSICAO_LABEL = {
  GR: 'Guarda-redes', DD: 'Lateral direito', DC: 'Defesa central', DE: 'Lateral esquerdo',
  MDC: 'Médio defensivo', MC: 'Médio centro', MO: 'Médio ofensivo', ED: 'Extremo direito',
  EE: 'Extremo esquerdo', PL: 'Ponta de lança',
};

export const REGRAS = { dependenciaPct: 80, dependenciaMaxAlternativas: 0, poucoUsoPct: 20, poucoUsoConvocatorias: 3, evolucaoPct: 20, evolucaoMinMinutos: 90, evolucaoMinAcoes: 5 };

export const FONTES_FUTURAS = {
  disponibilidade: 'Registo de indisponibilidades por jogador (lesão, castigo, ausência) com datas de início e fim.',
  contratos: 'Data de fim de contrato / vínculo por jogador.',
};

// "MC, mo ; DC" → ['MC', 'MO', 'DC'] (só posições válidas, sem repetidos,
// sem a principal). Devolve também os tokens inválidos, para avisar.
export function lerPosicoes(texto, principal = null) {
  const tokens = String(texto || '').toUpperCase().split(/[\s,;/]+/).filter(Boolean);
  const validas = [...new Set(tokens.filter(t => POSICOES.includes(t) && t !== principal))];
  const invalidas = tokens.filter(t => !POSICOES.includes(t));
  return { validas, invalidas };
}

export function idade(dataNascimento, hoje = new Date()) {
  if (!dataNascimento) return null;
  const d = new Date(`${dataNascimento}T00:00:00`);
  let a = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) a--;
  return a;
}

// ---------- Distribuição por posição ----------

// minimos: [{ posicao, minimo }]
export function distribuicaoPosicoes(plantel, minimos) {
  const min = new Map(minimos.map(m => [m.posicao, m.minimo]));
  const linhas = POSICOES.map(p => {
    const principais = plantel.filter(j => j.posicao === p);
    const secundarios = plantel.filter(j => j.posicao !== p && (j.posicoes_secundarias || []).includes(p));
    const minimo = min.has(p) ? min.get(p) : null;
    return {
      posicao: p, principais, secundarios, minimo,
      defice: minimo == null ? null : Math.max(0, minimo - principais.length),
    };
  });
  return { linhas, semPosicao: plantel.filter(j => !j.posicao) };
}

// ---------- Utilização ----------

// Minutos disponíveis = soma da duração dos jogos com tempos completos.
// % utilizada só conta os minutos do jogador nesses jogos; se num deles
// os minutos do jogador forem desconhecidos, fica marcado incompleto.
export function utilizacao(plantel, jogos, detalhe) {
  const base = jogos.filter(j => j.minutos_jogo);
  const disponiveis = base.reduce((n, j) => n + j.minutos_jogo, 0);
  const idsBase = new Set(base.map(j => j.id));
  return plantel.map(p => {
    const s = estatisticasJogador(p.id, jogos, detalhe);
    const nosBase = s.porJogo.filter(x => idsBase.has(x.jogo.id) && x.jogou);
    const incompleto = nosBase.some(x => x.minutos == null);
    const minutosBase = nosBase.reduce((n, x) => n + (x.minutos || 0), 0);
    return {
      jogador: p, stats: s,
      minutosDisponiveis: disponiveis,
      pctMinutos: disponiveis ? (minutosBase / disponiveis) * 100 : null,
      incompleto,
    };
  });
}

// Quota de minutos jogados por cada posição (pela posição principal).
export function participacaoPorPosicao(utilizacoes) {
  const total = utilizacoes.reduce((n, u) => n + u.stats.minutos, 0);
  const grupos = [...POSICOES, null].map(p => {
    const us = utilizacoes.filter(u => (u.jogador.posicao || null) === p);
    const minutos = us.reduce((n, u) => n + u.stats.minutos, 0);
    return { posicao: p, jogadores: us.length, minutos, pct: total ? (minutos / total) * 100 : null };
  });
  return { total, grupos: grupos.filter(g => g.jogadores > 0) };
}

// ---------- Evolução entre períodos ----------

export function evolucaoJogadores(statsAtual, statsAnterior, r = REGRAS) {
  return statsAtual.map(({ jogador, stats: a }) => {
    const b = statsAnterior.get(jogador.id);
    const suficiente = (s) => s && s.minutosBase90 >= r.evolucaoMinMinutos && (s.total.ganhos + s.total.perdas) >= r.evolucaoMinAcoes && s.racio != null;
    if (!suficiente(a) || !suficiente(b)) return { jogador, atual: a?.racio ?? null, anterior: b?.racio ?? null, variacao: null, leitura: null };
    const variacao = variacaoPct(a.racio, b.racio);
    const leitura = variacao == null ? null : variacao >= r.evolucaoPct ? 'positiva' : variacao <= -r.evolucaoPct ? 'negativa' : 'estavel';
    return { jogador, atual: a.racio, anterior: b.racio, variacao, leitura };
  });
}

// ---------- Planeamento ----------

export function planeamento({ distribuicao, utilizacoes, evolucao = [] }, r = REGRAS) {
  const porId = new Map(utilizacoes.map(u => [u.jogador.id, u]));
  const necessidades = [];
  const dependencias = [];
  distribuicao.linhas.forEach(l => {
    if (l.defice > 0) {
      necessidades.push({ posicao: l.posicao, defice: l.defice, minimo: l.minimo, atuais: l.principais.length, alternativas: l.secundarios });
    }
    const mins = l.principais.map(j => ({ j, m: porId.get(j.id)?.stats.minutos || 0 }));
    const totalPos = mins.reduce((n, x) => n + x.m, 0);
    if (!totalPos) return;
    const top = mins.sort((a, b) => b.m - a.m)[0];
    const quota = (top.m / totalPos) * 100;
    const alternativas = l.principais.length - 1 + l.secundarios.length;
    if (quota >= r.dependenciaPct && alternativas <= r.dependenciaMaxAlternativas) {
      dependencias.push({ posicao: l.posicao, jogador: top.j, quota, alternativas });
    }
  });

  // Prioridade: défice que nem as posições secundárias cobrem primeiro,
  // depois o resto do défice, depois as dependências.
  const prioridades = [
    ...necessidades.map(n => ({ posicao: n.posicao, motivo: 'defice', peso: 100 + (n.defice - n.alternativas.length) * 10 + n.defice, n })),
    ...dependencias.filter(d => !necessidades.some(n => n.posicao === d.posicao)).map(d => ({ posicao: d.posicao, motivo: 'dependencia', peso: 50 + d.quota / 10, d })),
  ].sort((a, b) => b.peso - a.peso);

  const acompanhamento = [];
  utilizacoes.forEach(u => {
    if (u.stats.convocatorias >= r.poucoUsoConvocatorias && u.pctMinutos != null && u.pctMinutos < r.poucoUsoPct) {
      acompanhamento.push({ tipo: 'pouco_utilizado', jogador: u.jogador, u });
    }
    if (u.incompleto) acompanhamento.push({ tipo: 'minutos_incompletos', jogador: u.jogador, u });
  });
  evolucao.filter(e => e.leitura === 'negativa').forEach(e => acompanhamento.push({ tipo: 'evolucao_negativa', jogador: e.jogador, e }));

  const decisoes = [
    ...necessidades.map(n => ({ tipo: 'reforcar', posicao: n.posicao, n })),
    // Numa posição com défice, reforçar já resolve a dependência.
    ...dependencias.filter(d => !necessidades.some(n => n.posicao === d.posicao)).map(d => ({ tipo: 'alternativa', posicao: d.posicao, d })),
  ];
  return { necessidades, dependencias, prioridades, acompanhamento, decisoes };
}
