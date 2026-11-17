/**
 * Análise de Jogo — js/direcao/dados.js
 * Acesso ao Supabase do Dashboard Executivo. Pedidos sempre em lote
 * (`match_id in (...)`), nunca um por jogo. RLS por equipa já garante
 * que só chegam dados das equipas do utilizador.
 *
 * Versão: 1.3 (2026-11-17)
 *
 * Histórico:
 *   1.3 — equipas com logo_url (capa e cabeçalhos do PowerPoint).
 *   1.2 — configuração dos indicadores (kpi_targets) para os Alertas.
 *   1.1 — plantel completo, mínimos por posição e posições secundárias
 *         (Gestão do Plantel).
 *   1.0 — jogos (v_jogo_resumo) e detalhe em lote, paginado.
 */

import { supabase } from '../supabase-client.js';

export async function carregarEquipas() {
  const { data, error } = await supabase.from('teams').select('id, nome, logo_url').order('nome');
  if (error) throw error;
  return data || [];
}

// Jogos que contam para o dashboard: terminados e fora da pré-época,
// do mais antigo para o mais recente (a ordem de que filtros.js precisa).
export async function carregarJogos(teamId) {
  const { data, error } = await supabase
    .from('v_jogo_resumo')
    .select('*')
    .eq('team_id', teamId)
    .eq('terminado', true)
    .eq('pre_epoca', false)
    .order('data', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Detalhe dos jogos escolhidos pelos filtros: eventos (já com terço/
// corredor normalizados), golos, convocatórias e os tempos de cada
// parte (necessários para os minutos jogados por jogador).
export async function carregarDetalhe(matchIds) {
  if (!matchIds.length) return { eventos: [], golos: [], convocados: [], tempos: [] };
  const [eventos, golos, convocados, tempos] = await Promise.all([
    todasAsLinhas(() => supabase.from('events_normalizado').select('*').in('match_id', matchIds).order('id')),
    todasAsLinhas(() => supabase.from('goals').select('*').in('match_id', matchIds).order('id')),
    todasAsLinhas(() => supabase.from('match_players').select('*, players(id, numero, nome, posicao)').in('match_id', matchIds).order('id')),
    todasAsLinhas(() => supabase.from('matches').select('id, parte1_inicio, parte1_fim, parte2_inicio, parte2_fim').in('id', matchIds).order('id')),
  ]);
  return { eventos, golos, convocados, tempos };
}

// O Supabase devolve no máximo 1000 linhas por pedido — 10-12 jogos de
// eventos passam disso facilmente. Pagina com .range() até esgotar
// (ordem estável por id, senão páginas podiam repetir/saltar linhas).
const PAGINA = 1000;
async function todasAsLinhas(criarQuery) {
  const linhas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await criarQuery().range(desde, desde + PAGINA - 1);
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < PAGINA) return linhas;
  }
}

// ---------- Gestão do Plantel (fase 6) ----------

// Plantel completo da equipa (não só os convocados do período).
export async function carregarPlantel(teamId) {
  const { data, error } = await supabase
    .from('players')
    .select('id, numero, nome, posicao, posicoes_secundarias, data_nascimento')
    .eq('team_id', teamId)
    .order('nome');
  if (error) throw error;
  return data || [];
}

export async function carregarMinimos(teamId) {
  const { data, error } = await supabase.from('posicao_minimos').select('posicao, minimo').eq('team_id', teamId);
  if (error) throw error;
  return data || [];
}

// minimo null/'' → apaga (volta a "não definido"); senão grava.
export async function guardarMinimo(teamId, posicao, minimo) {
  const q = minimo == null
    ? supabase.from('posicao_minimos').delete().eq('team_id', teamId).eq('posicao', posicao)
    : supabase.from('posicao_minimos').upsert({ team_id: teamId, posicao, minimo }, { onConflict: 'team_id,posicao' });
  const { error } = await q;
  if (error) throw error;
}

export async function guardarSecundarias(playerId, posicoes) {
  const { error } = await supabase.from('players').update({ posicoes_secundarias: posicoes }).eq('id', playerId);
  if (error) throw error;
}

// ---------- Alertas (fase 7) ----------

export async function carregarTargets(teamId) {
  const { data, error } = await supabase.from('kpi_targets').select('indicador, direcao, limite_pct, gravidade, ativo').eq('team_id', teamId);
  if (error) throw error;
  return data || [];
}

export async function guardarTarget(teamId, indicador, { direcao, limite, gravidade, ativo }) {
  const { error } = await supabase.from('kpi_targets').upsert(
    { team_id: teamId, indicador, direcao, limite_pct: limite, gravidade, ativo },
    { onConflict: 'team_id,indicador' },
  );
  if (error) throw error;
}

// Volta ao valor por omissão (apaga a linha).
export async function reporTarget(teamId, indicador) {
  const { error } = await supabase.from('kpi_targets').delete().eq('team_id', teamId).eq('indicador', indicador);
  if (error) throw error;
}
