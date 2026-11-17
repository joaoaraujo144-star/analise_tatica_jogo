/**
 * Análise de Jogo — js/direcao/filtros.js
 * Filtros globais do Dashboard Executivo, partilhados pelas 6 páginas:
 * época, competição, janela (últimos N / época completa / intervalo
 * personalizado), casa/fora e adversário. A equipa é escolhida à parte
 * (muda os dados carregados, não só o recorte).
 *
 * aplicarFiltros() é pura (só recebe jogos e devolve jogos), para poder
 * ser testada sem DOM.
 *
 * Versão: 1.0 (2026-11-17)
 */

import { epocaDe, dividirPeriodos } from './metricas.js';

export const JANELAS = [
  { value: '3', label: 'Últimos 3 jogos' },
  { value: '6', label: 'Últimos 6 jogos' },
  { value: '10', label: 'Últimos 10 jogos' },
  { value: '12', label: 'Últimos 12 jogos' },
  { value: 'epoca', label: 'Época completa' },
  { value: 'intervalo', label: 'Intervalo personalizado' },
];

export function filtrosIniciais() {
  return { epoca: '', competicao: '', janela: '6', desde: '', ate: '', local: '', adversario: '' };
}

// jogos: linhas de v_jogo_resumo, ordenadas do mais antigo para o mais
// recente, já só terminados e sem pré-época. Devolve o recorte "atual"
// e, para as janelas "últimos N", também os N jogos imediatamente antes
// (período anterior) com os mesmos filtros de contexto aplicados.
export function aplicarFiltros(jogos, f) {
  const contexto = jogos.filter(j =>
    (!f.epoca || epocaDe(j.data) === f.epoca)
    && (!f.competicao || j.competicao === f.competicao)
    && (!f.local || j.local === f.local)
    && (!f.adversario || j.adversario === f.adversario));

  if (f.janela === 'epoca') return { atual: contexto, anterior: [] };
  if (f.janela === 'intervalo') {
    const atual = contexto.filter(j => (!f.desde || j.data >= f.desde) && (!f.ate || j.data <= f.ate));
    return { atual, anterior: [] };
  }
  return dividirPeriodos(contexto, Number(f.janela) || 6);
}

// Opções das dropdowns, a partir dos jogos que existem (nunca listas fixas).
export function opcoesFiltros(jogos) {
  const unicos = (xs) => [...new Set(xs.filter(Boolean))].sort();
  return {
    epocas: unicos(jogos.map(j => epocaDe(j.data))).reverse(),
    competicoes: unicos(jogos.map(j => j.competicao)),
    adversarios: unicos(jogos.map(j => j.adversario)),
  };
}
