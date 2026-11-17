/**
 * Análise de Jogo — js/direcao/ui.js
 * Formatação partilhada pelas páginas do Dashboard Executivo. Um valor
 * null aparece sempre como "n/d" (classe .dx-nd), nunca como 0.
 *
 * Versão: 1.1 (2026-11-17)
 *
 * Histórico:
 *   1.1 — deltaKpi sem linha de comparação quando não há período anterior.
 *   1.0 — criação (fase 2).
 */

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ND = '<span class="dx-nd" title="Dado não disponível">n/d</span>';

export function num(v, casas = 1) {
  if (v == null || Number.isNaN(v)) return ND;
  return v.toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function sinal(v, casas = 1) {
  if (v == null) return ND;
  return `${v > 0 ? '+' : ''}${num(v, casas)}`;
}

export function pct(v) {
  return v == null ? ND : `${v > 0 ? '+' : ''}${num(v, 0)}%`;
}

export function dataCurta(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

export function dataLonga(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const TEND = {
  melhoria: { cls: 'good', label: 'Melhoria' },
  agravamento: { cls: 'bad', label: 'Agravamento' },
  estavel: { cls: 'neutral', label: 'Estável' },
  neutro: { cls: 'neutral', label: 'Sem juízo' },
};

export function tendenciaBadge(t) {
  if (!t) return ND;
  const x = TEND[t];
  return `<span class="dx-tend ${x.cls}">${x.label}</span>`;
}

// Linha de variação de um KPI face ao período anterior, a partir de uma
// linha de compararIndicadores(). A cor vem da tendência (que já tem em
// conta a direção favorável), nunca só do sinal. Sem período anterior
// (temAnterior = false) não há linha de comparação — só o valor atual.
export function deltaKpi(l, temAnterior = true) {
  if (!temAnterior) return '';
  if (!l || l.anterior == null) return '<div class="dx-kpi-delta neutral">Sem valor anterior comparável</div>';
  const cls = TEND[l.tendencia]?.cls || 'neutral';
  const seta = l.diferenca > 0 ? '▲' : l.diferenca < 0 ? '▼' : '■';
  const quanto = l.ind.soAbsoluto || l.variacao == null ? sinal(l.diferenca, l.ind.casas) : pct(l.variacao);
  return `<div class="dx-kpi-delta ${cls}">${seta} ${quanto} <span class="dx-kpi-ref">vs ${num(l.anterior, l.ind.casas)}</span></div>`;
}
