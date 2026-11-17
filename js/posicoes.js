/**
 * Análise de Jogo — js/posicoes.js
 * Ordem das posições (GR → defesas → médios → extremos → ponta de lança)
 * e comparação de jogadores por posição, usada em todas as listas de
 * jogadores da app: Plantel, Wellness e Relatórios (dashboard.html),
 * convocatória e estatísticas do jogo (match.html), relatório do jogo
 * (relatorio.html) e Dashboard Executivo (direcao.html).
 *
 * Exceção deliberada à convenção "cada página duplica os seus helpers
 * pequenos" (como relatorio-dados.js): a ordem tem de ser exatamente a
 * mesma em todas as páginas — uma cópia desatualizada numa delas seria
 * um erro difícil de ver.
 *
 * Jogadores sem posição definida ficam no fim.
 *
 * Versão: 1.0 (2026-11-17)
 */

export const ORDEM_POSICOES = ['GR', 'DD', 'DC', 'DE', 'MDC', 'MC', 'MO', 'ED', 'EE', 'PL'];

export function ordemPosicao(posicao) {
  const i = ORDEM_POSICOES.indexOf(posicao);
  return i < 0 ? ORDEM_POSICOES.length : i;
}

// Número da camisola para ordenar ("10" > "9"; sem número → fim).
function ordemNumero(numero) {
  const n = parseInt(numero, 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

// Diferença de posição entre dois jogadores ({ posicao }) — para usar
// como 1.º critério antes de outro (ex: minutos jogados).
export function porPosicao(a, b) {
  return ordemPosicao(a?.posicao) - ordemPosicao(b?.posicao);
}

// Ordem completa de uma lista de jogadores ({ posicao, numero, nome }):
// posição, depois número, depois nome.
export function compararJogadores(a, b) {
  return porPosicao(a, b)
    || ordemNumero(a?.numero) - ordemNumero(b?.numero)
    || String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt');
}
