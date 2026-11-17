/**
 * Análise de Jogo — js/direcao/graficos.js
 * Chart.js para o Dashboard Executivo: cores e opções comuns, e um
 * registo dos gráficos criados para os destruir antes de cada novo
 * render (senão o Chart.js deixa instâncias penduradas em canvas que já
 * não existem).
 *
 * Cores de dados: tons validados com scripts/validate_palette.js da
 * skill dataviz em modo escuro contra a superfície #151e30 (os mesmos
 * de relatorio-6-jogos.js) — verde = a favor, laranja = contra.
 *
 * Versão: 1.0 (2026-11-17)
 */

import { Chart } from 'https://esm.sh/chart.js@4/auto';

export const COR = {
  favor: '#239973',
  contra: '#c97a2e',
  amarelo: '#b8871f',
  vermelho: '#c9465a',
  superficie: '#151e30',
  texto: '#edf4ff',
  muted: '#9aacc5',
  grelha: '#34445b',
};

export const OPCOES_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  scales: {
    x: { ticks: { color: COR.muted }, grid: { color: COR.grelha } },
    y: { ticks: { color: COR.muted }, grid: { color: COR.grelha }, beginAtZero: true },
  },
  plugins: { legend: { labels: { color: COR.texto } } },
};

// Espec. de marca (skill dataviz, marks-and-anatomy): linha 2px com
// pontos >= 8px e anel na cor da superfície; barra <= 24px com canto
// arredondado só na ponta. spanGaps:false — um jogo sem dado (null)
// fica como falha na linha, nunca como zero.
export function linha(label, data, cor) {
  return { label, data, borderColor: cor, backgroundColor: cor, borderWidth: 2, tension: 0.25, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: COR.superficie, pointBorderWidth: 2, spanGaps: false };
}
export function barra(label, data, cor) {
  return { label, data, backgroundColor: cor, maxBarThickness: 24, borderRadius: 4, borderSkipped: false };
}

let ativos = [];

export function criarGrafico(canvas, config) {
  const g = new Chart(canvas, config);
  ativos.push(g);
  return g;
}

export function destruirGraficos() {
  ativos.forEach(g => g.destroy());
  ativos = [];
}
