/**
 * Análise de Jogo — js/direcao/metricas.js
 * Fórmulas do Dashboard Executivo (pages/direcao.html). Só funções
 * puras — sem DOM, sem Supabase — para poderem ser testadas com
 * `node --test` (ver tests/metricas.test.mjs).
 *
 * Convenção para dados em falta: `null` quer dizer "não disponível"
 * (nunca 0). A interface mostra-o como "n/d". Um 0 só aparece quando é
 * mesmo zero observado.
 *
 * Fórmulas:
 *   PPG                 = (V × 3 + E) / jogos com resultado fiável
 *   Diferença de golos  = marcados − sofridos
 *   X / 90              = X × 90 / minutos de jogo
 *   Rácio a/b           = a / b            (b = 0 → n/d)
 *   Variação %          = (atual − anterior) / anterior × 100  (anterior = 0 → n/d)
 *   Época               = julho a junho (ex: 2026-11-17 → "2026/27")
 *
 * Conclusões executivas (conclusoesExecutivas): só com >= 3 jogos em
 * cada período; entre os indicadores com direção favorável e |variação|
 * >= 10%, a maior melhoria e o maior agravamento; a recomendação vem de
 * uma tabela fixa por indicador (RECOMENDACOES) — nada inventado.
 *
 * Saldo X / jogo      = média por jogo a favor − média por jogo contra
 *                       (mostrado sempre ao lado dos dois valores reais)
 *
 * Versão: 1.3 (2026-11-17)
 *
 * Histórico:
 *   1.3 — por 90: um jogo sem tempos fica fora do por 90 (em vez de o
 *         anular para o período inteiro); jogosSemMinutos.
 *   1.2 — Fase 3: contadorPor, valoresPorJogo, distribuicaoBlocos,
 *         matrizZonas, perdas no terço defensivo / recuperações no terço
 *         ofensivo, saldos por jogo; INDICADORES_OVERVIEW.
 *   1.1 — Fase 2: contadorEventos, calcularPeriodo, catálogo INDICADORES,
 *         compararIndicadores, conclusoesExecutivas.
 *   1.0 — Fase 1: básicos, resultados, codificação, tempo, períodos.
 */

// ---------- Básicos ----------

export function epocaDe(dataStr) {
  const [ano, mes] = dataStr.split('-').map(Number);
  const inicio = mes >= 7 ? ano : ano - 1;
  return `${inicio}/${String((inicio + 1) % 100).padStart(2, '0')}`;
}

export function por90(total, minutos) {
  if (total == null || !minutos) return null;
  return (total * 90) / minutos;
}

export function racio(a, b) {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

export function variacaoPct(atual, anterior) {
  if (atual == null || anterior == null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

// direcao: 'subir' (mais é melhor) ou 'descer' (menos é melhor) — nunca
// assumido. Abaixo de `margemPct` de variação conta como estável.
export function tendencia(atual, anterior, direcao, margemPct = 5) {
  if (atual == null || anterior == null) return null;
  if (atual === anterior) return 'estavel';
  const v = variacaoPct(atual, anterior);
  if (v != null && Math.abs(v) < margemPct) return 'estavel';
  const subiu = atual > anterior;
  return (subiu === (direcao === 'subir')) ? 'melhoria' : 'agravamento';
}

// ---------- Resultados ----------

// resumo: uma linha de v_jogo_resumo. Sem golos consistentes (jogo antigo,
// antes de existir a tabela goals) → resultado desconhecido, não 0-0.
export function resultadoJogo(resumo) {
  if (!resumo.golos_consistentes) return null;
  if (resumo.golos_marcados > resumo.golos_sofridos) return 'V';
  if (resumo.golos_marcados < resumo.golos_sofridos) return 'D';
  return 'E';
}

export function registoResultados(resumos) {
  const r = { V: 0, E: 0, D: 0, semResultado: 0 };
  resumos.forEach(j => {
    const res = resultadoJogo(j);
    if (res) r[res]++; else r.semResultado++;
  });
  r.jogos = r.V + r.E + r.D;
  r.pontos = r.V * 3 + r.E;
  r.ppg = r.jogos ? r.pontos / r.jogos : null;
  return r;
}

// ---------- Eventos e codificação ----------

// Num jogo cuja codificação não está marcada como completa, "nenhum
// evento" não pode contar como zero — pode só não ter sido codificado.
export function contagemValida(contagem, codificacao) {
  if (contagem > 0) return contagem;
  return codificacao === 'completa' ? 0 : null;
}

// Agrega uma contagem por jogo, ignorando os jogos onde ela não é
// válida — e só esses jogos entram no denominador dos minutos, para o
// "por 90" não ficar diluído por jogos não codificados. Um jogo sem
// tempos completos fica fora do "por 90" (numerador e denominador), mas
// conta no total e na média por jogo; jogosSemMinutos diz quantos foram.
// jogos: [{ id, codificacao, minutos_jogo }]; contar(jogo) → nº de eventos
export function agregarEventos(jogos, contar) {
  let total = 0, minutos = 0, considerados = 0, totalComMinutos = 0, semMinutos = 0;
  jogos.forEach(j => {
    const v = contagemValida(contar(j), j.codificacao);
    if (v == null) return;
    total += v;
    considerados++;
    if (j.minutos_jogo) { minutos += j.minutos_jogo; totalComMinutos += v; } else semMinutos++;
  });
  return {
    total: considerados ? total : null,
    porJogo: considerados ? total / considerados : null,
    por90: minutos ? por90(totalComMinutos, minutos) : null,
    jogosConsiderados: considerados,
    jogosSemMinutos: semMinutos,
  };
}

// ---------- Tempo ----------

// Blocos de 15 min: 0–15, 15–30, 30–45+ (1ª parte), 45–60, 60–75,
// 75–90+ (2ª parte). `minuto` é sempre relativo ao início da parte.
export const BLOCOS_15 = ['0–15', '15–30', '30–45+', '45–60', '60–75', '75–90+'];
export function blocoDe15(parte, minuto) {
  if (minuto == null || (parte !== 1 && parte !== 2)) return null;
  return (parte - 1) * 3 + Math.min(2, Math.max(0, Math.floor(minuto / 15)));
}

// ---------- Minutos jogados (mesma regra de 034_match_players_minutos.sql) ----------

export function duracaoParte(inicio, fim) {
  if (!inicio || !fim) return 0;
  return Math.max(0, Math.round((new Date(fim) - new Date(inicio)) / 60000));
}

export function minutosJogados(mp, match) {
  const d1 = duracaoParte(match.parte1_inicio, match.parte1_fim);
  const d2 = duracaoParte(match.parte2_inicio, match.parte2_fim);
  const minutoNoJogo = () => (mp.parte_substituicao === 1
    ? Math.min(mp.minuto_substituicao, d1)
    : d1 + Math.min(mp.minuto_substituicao, d2));
  const temMinuto = mp.parte_substituicao && mp.minuto_substituicao != null;
  if (mp.estado === 'Titular') {
    return mp.substituicao === 'Saiu' && temMinuto ? minutoNoJogo() : d1 + d2;
  }
  if (mp.substituicao === 'Entrou' && temMinuto) return Math.max(0, d1 + d2 - minutoNoJogo());
  return 0;
}

// ---------- Períodos ----------

// jogos ordenados do mais antigo para o mais recente. Devolve os últimos
// n (atual) e os n antes desses (anterior) — o anterior pode ter menos
// de n jogos, ou nenhum.
export function dividirPeriodos(jogos, n) {
  const atual = jogos.slice(-n);
  const anterior = jogos.slice(Math.max(0, jogos.length - 2 * n), Math.max(0, jogos.length - n));
  return { atual, anterior };
}

// ---------- Período: todos os indicadores de um conjunto de jogos ----------

// Contador rápido de eventos por jogo/campo/tipo (evita filtrar a lista
// toda para cada pergunta).
export function contadorEventos(eventos) {
  const m = new Map();
  eventos.forEach(e => {
    const k = `${e.match_id}|${e.tracker_id}|${e.tipo}`;
    m.set(k, (m.get(k) || 0) + 1);
  });
  return (matchId, tracker, tipo) => m.get(`${matchId}|${tracker}|${tipo}`) || 0;
}

// Como contadorEventos, mas separado também por uma chave do evento
// (ex: e => e.terco): contar(matchId, tracker, tipo, valorDaChave).
export function contadorPor(eventos, chave) {
  const m = new Map();
  eventos.forEach(e => {
    const k = `${e.match_id}|${e.tracker_id}|${e.tipo}|${chave(e)}`;
    m.set(k, (m.get(k) || 0) + 1);
  });
  return (matchId, tracker, tipo, valor) => m.get(`${matchId}|${tracker}|${tipo}|${valor}`) || 0;
}

// Valor de uma contagem jogo a jogo (para gráficos de evolução e a
// tabela de comparação entre jogos) — null onde não é válida.
export function valoresPorJogo(jogos, contar, tracker, tipo) {
  return jogos.map(j => contagemValida(contar(j.id, tracker, tipo), j.codificacao));
}

// Distribuição por blocos de 15 min de um tracker/tipo, em média por
// jogo — só com os jogos onde a contagem é válida (mesma regra de
// agregarEventos). Eventos sem minuto ficam em `semMinuto`, nunca são
// atribuídos a um bloco à sorte.
export function distribuicaoBlocos(jogos, eventos, tracker, tipo) {
  const validos = new Set(jogos.filter(j => {
    const n = eventos.filter(e => e.match_id === j.id && e.tracker_id === tracker && e.tipo === tipo).length;
    return contagemValida(n, j.codificacao) != null;
  }).map(j => j.id));
  const total = BLOCOS_15.map(() => 0);
  let semMinuto = 0;
  eventos.forEach(e => {
    if (!validos.has(e.match_id) || e.tracker_id !== tracker || e.tipo !== tipo) return;
    const b = blocoDe15(e.parte, e.minuto);
    if (b == null) semMinuto++; else total[b]++;
  });
  const n = validos.size;
  return { total, mediaPorJogo: total.map(v => (n ? v / n : null)), semMinuto, jogosConsiderados: n };
}

export const TERCOS = ['defensivo', 'intermedio', 'ofensivo'];
export const CORREDORES = ['esquerdo', 'central', 'direito'];

// Matriz corredor × terço (contagens) de um tracker/tipo, nos jogos dados.
export function matrizZonas(jogos, eventos, tracker, tipo) {
  const ids = new Set(jogos.map(j => j.id));
  const m = CORREDORES.map(() => TERCOS.map(() => 0));
  let total = 0;
  eventos.forEach(e => {
    if (!ids.has(e.match_id) || e.tracker_id !== tracker || e.tipo !== tipo) return;
    const r = CORREDORES.indexOf(e.corredor);
    const c = TERCOS.indexOf(e.terco);
    if (r < 0 || c < 0) return;
    m[r][c]++;
    total++;
  });
  return { matriz: m, total };
}

const SEM_DADOS = { total: null, porJogo: null, por90: null, jogosConsiderados: 0, jogosSemMinutos: 0 };

// A favor − contra por jogo, a partir das médias por jogo de cada lado
// (os dois lados podem ter sido válidos num nº de jogos diferente).
function saldoPorJogo(a, b) {
  return a.porJogo == null || b.porJogo == null ? null : a.porJogo - b.porJogo;
}

// jogos: linhas de v_jogo_resumo; contar: contadorEventos(...);
// contarTerco (opcional): contadorPor(eventos, e => e.terco) — sem ele,
// os indicadores por terço ficam n/d.
// Golos só de jogos com resultado fiável (golos_consistentes).
export function calcularPeriodo(jogos, contar, contarTerco = null) {
  const res = registoResultados(jogos);
  const fiaveis = jogos.filter(j => j.golos_consistentes);
  const soma = (k) => fiaveis.reduce((n, j) => n + j[k], 0);
  const porJogoFiavel = (v) => (fiaveis.length ? v / fiaveis.length : null);
  const ev = (tracker, tipo) => agregarEventos(jogos, j => contar(j.id, tracker, tipo));
  const golosM = fiaveis.length ? soma('golos_marcados') : null;
  const golosS = fiaveis.length ? soma('golos_sofridos') : null;
  const ganhos = ev('perdas', 'X');
  const perdas = ev('perdas', 'Y');
  const evTerco = (tracker, tipo, terco) => (contarTerco
    ? agregarEventos(jogos, j => contarTerco(j.id, tracker, tipo, terco))
    : SEM_DADOS);
  const rematesF = ev('remates', 'X'), rematesC = ev('remates', 'Y');
  const cruzamentosF = ev('cruzamentos', 'X'), cruzamentosC = ev('cruzamentos', 'Y');
  const cantosF = ev('cantos', 'X'), cantosC = ev('cantos', 'Y');
  return {
    ...res,
    jogos: jogos.length, // depois do ...res: o "jogos" de registoResultados conta só os jogos com resultado
    jogosComResultado: fiaveis.length,
    golosMarcados: golosM,
    golosSofridos: golosS,
    difGolos: golosM == null ? null : golosM - golosS,
    golosMarcadosJogo: golosM == null ? null : porJogoFiavel(golosM),
    golosSofridosJogo: golosS == null ? null : porJogoFiavel(golosS),
    rematesF, rematesC, cruzamentosF, cruzamentosC, cantosF, cantosC,
    faltasCometidas: ev('faltas', 'X'), faltasSofridas: ev('faltas', 'Y'),
    ganhos, perdas,
    racioGanhosPerdas: racio(ganhos.total, perdas.total),
    // Perdas de bola (Y) no nosso terço defensivo; ganhos de bola (X) =
    // recuperações no terço ofensivo. Coordenadas já normalizadas.
    perdasTercoDef: evTerco('perdas', 'Y', 'defensivo'),
    ganhosTercoOf: evTerco('perdas', 'X', 'ofensivo'),
    saldoRematesJogo: saldoPorJogo(rematesF, rematesC),
    saldoCruzamentosJogo: saldoPorJogo(cruzamentosF, cruzamentosC),
    saldoCantosJogo: saldoPorJogo(cantosF, cantosC),
  };
}

// ---------- Catálogo de indicadores ----------
// direcao: 'subir' (mais é melhor), 'descer' (menos é melhor) ou null
// (sem juízo — ex: faltas cometidas não são boas nem más por si). É o
// valor por omissão; a página "Alertas" permite reconfigurar
// (kpi_targets). soAbsoluto: a variação % não faz sentido (o valor pode
// passar de negativo a positivo) — compara-se só a diferença.
export const INDICADORES = [
  { id: 'ppg', label: 'Pontos por jogo', direcao: 'subir', casas: 2, valor: p => p.ppg },
  { id: 'golos_marcados_jogo', label: 'Golos marcados / jogo', direcao: 'subir', casas: 2, valor: p => p.golosMarcadosJogo },
  { id: 'golos_sofridos_jogo', label: 'Golos sofridos / jogo', direcao: 'descer', casas: 2, valor: p => p.golosSofridosJogo },
  { id: 'dif_golos', label: 'Diferença de golos', direcao: 'subir', casas: 0, soAbsoluto: true, valor: p => p.difGolos },
  { id: 'remates_f_90', label: 'Remates feitos / 90', direcao: 'subir', casas: 1, valor: p => p.rematesF.por90 },
  { id: 'remates_c_90', label: 'Remates sofridos / 90', direcao: 'descer', casas: 1, valor: p => p.rematesC.por90 },
  { id: 'cruzamentos_f_90', label: 'Cruzamentos feitos / 90', direcao: 'subir', casas: 1, valor: p => p.cruzamentosF.por90 },
  { id: 'cruzamentos_c_90', label: 'Cruzamentos sofridos / 90', direcao: 'descer', casas: 1, valor: p => p.cruzamentosC.por90 },
  { id: 'cantos_f_90', label: 'Cantos a favor / 90', direcao: 'subir', casas: 1, valor: p => p.cantosF.por90 },
  { id: 'cantos_c_90', label: 'Cantos contra / 90', direcao: 'descer', casas: 1, valor: p => p.cantosC.por90 },
  { id: 'ganhos_90', label: 'Ganhos de bola / 90', direcao: 'subir', casas: 1, valor: p => p.ganhos.por90 },
  { id: 'perdas_90', label: 'Perdas de bola / 90', direcao: 'descer', casas: 1, valor: p => p.perdas.por90 },
  { id: 'racio_gp', label: 'Rácio ganhos/perdas', direcao: 'subir', casas: 2, valor: p => p.racioGanhosPerdas },
  { id: 'faltas_cometidas_90', label: 'Faltas cometidas / 90', direcao: null, casas: 1, valor: p => p.faltasCometidas.por90 },
  { id: 'faltas_sofridas_90', label: 'Faltas sofridas / 90', direcao: null, casas: 1, valor: p => p.faltasSofridas.por90 },
  // Acrescentados na fase 3 (Performance Coletiva) — fora da tabela do
  // Executive Overview (INDICADORES_OVERVIEW), que fica como estava.
  { id: 'perdas_terco_def_90', label: 'Perdas no terço defensivo / 90', direcao: 'descer', casas: 1, valor: p => p.perdasTercoDef.por90 },
  { id: 'ganhos_terco_of_90', label: 'Recuperações no terço ofensivo / 90', direcao: 'subir', casas: 1, valor: p => p.ganhosTercoOf.por90 },
  { id: 'saldo_remates_jogo', label: 'Saldo de remates / jogo', direcao: 'subir', casas: 1, soAbsoluto: true, valor: p => p.saldoRematesJogo },
  { id: 'saldo_cruzamentos_jogo', label: 'Saldo de cruzamentos / jogo', direcao: 'subir', casas: 1, soAbsoluto: true, valor: p => p.saldoCruzamentosJogo },
  { id: 'saldo_cantos_jogo', label: 'Saldo de cantos / jogo', direcao: 'subir', casas: 1, soAbsoluto: true, valor: p => p.saldoCantosJogo },
];

export const INDICADORES_OVERVIEW = INDICADORES.filter(i => ![
  'perdas_terco_def_90', 'ganhos_terco_of_90', 'saldo_remates_jogo', 'saldo_cruzamentos_jogo', 'saldo_cantos_jogo',
].includes(i.id));

export const indicador = (id) => INDICADORES.find(i => i.id === id);

// Uma linha por indicador: anterior, atual, diferença, variação %, tendência.
export function compararIndicadores(pAtual, pAnterior, indicadores = INDICADORES) {
  return indicadores.map(ind => {
    const atual = ind.valor(pAtual);
    const anterior = pAnterior ? ind.valor(pAnterior) : null;
    const diferenca = atual != null && anterior != null ? atual - anterior : null;
    const variacao = ind.soAbsoluto ? null : variacaoPct(atual, anterior);
    const tend = ind.direcao ? tendencia(atual, anterior, ind.direcao, ind.soAbsoluto ? 0 : 5) : (diferenca == null ? null : 'neutro');
    return { ind, atual, anterior, diferenca, variacao, tendencia: tend };
  });
}

// ---------- Conclusões executivas ----------
// Regras (mostradas também na interface, para serem transparentes):
//  - só com >= minJogos jogos em cada período;
//  - só indicadores com direção definida e variação de pelo menos
//    limiarPct % (indícios, não prova — amostras de poucos jogos);
//  - evolução positiva = maior melhoria; risco = maior agravamento;
//  - recomendação ligada ao risco (ou, sem risco, à melhoria).
export const RECOMENDACOES = {
  ppg: 'Rever em vídeo os jogos perdidos do período: contexto, adversário e momentos dos golos.',
  golos_marcados_jogo: 'Analisar a finalização e a chegada à área nos últimos jogos.',
  golos_sofridos_jogo: 'Rever os golos sofridos: origem (bola parada, transição, organização) e zona.',
  remates_f_90: 'Avaliar a chegada a zonas de finalização e a criação de oportunidades.',
  remates_c_90: 'Analisar a organização defensiva e as zonas de onde o adversário remata.',
  cruzamentos_f_90: 'Avaliar a utilização dos corredores laterais na construção ofensiva.',
  cruzamentos_c_90: 'Rever a defesa dos corredores laterais e a pressão sobre o cruzador.',
  cantos_f_90: 'Avaliar a presença ofensiva no último terço.',
  cantos_c_90: 'Analisar as situações que originam cantos contra.',
  ganhos_90: 'Avaliar a pressão e a reação à perda (recuperações).',
  perdas_90: 'Rever em vídeo a construção sob pressão: onde e como se perde a bola.',
  racio_gp: 'Cruzar ganhos e perdas por zona na Análise Territorial antes de decidir.',
  perdas_terco_def_90: 'Rever a primeira fase de construção: soluções de passe e saída sob pressão.',
  ganhos_terco_of_90: 'Avaliar a pressão alta e a reação imediata à perda.',
};

export function conclusoesExecutivas(linhas, nAtual, nAnterior, { minJogos = 3, limiarPct = 10 } = {}) {
  if (nAtual < minJogos || nAnterior < minJogos) {
    return { suficiente: false, motivo: `São precisos pelo menos ${minJogos} jogos em cada período (atual: ${nAtual}, anterior: ${nAnterior}).` };
  }
  const relevantes = linhas.filter(l => l.ind.direcao && l.variacao != null && Math.abs(l.variacao) >= limiarPct);
  const maior = (t) => relevantes.filter(l => l.tendencia === t).sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao))[0] || null;
  const positiva = maior('melhoria');
  const risco = maior('agravamento');
  const base = risco || positiva;
  const recomendacao = base
    ? (risco ? RECOMENDACOES[risco.ind.id] : `Manter o que está a resultar em "${positiva.ind.label}" e confirmar em vídeo se a melhoria é estrutural.`) || null
    : null;
  return { suficiente: true, positiva, risco, recomendacao, relevantes };
}
