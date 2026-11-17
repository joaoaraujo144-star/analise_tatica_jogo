/**
 * Análise de Jogo — js/direcao/campo.js
 * Desenho do campo do Dashboard Executivo (assets/campo.png): densidade
 * em grelha ou pontos, sobre as coordenadas normalizadas de
 * events_normalizado (a equipa ataca sempre para a direita), com as
 * linhas dos terços e corredores. Usado pela Análise Territorial e pela
 * Performance Individual.
 *
 * Versão: 1.0 (2026-11-17)
 */

import { densidade } from './territorial.js';

// RGB dos tons de gráfico validados (COR em graficos.js): a favor verde,
// contra laranja; faltas sem juízo de valor → amarelo nos dois lados.
export const RGB = { favor: '35, 153, 115', contra: '201, 122, 46', amarelo: '184, 135, 31' };
export const rgbDe = (tracker, tipo) => (tracker === 'faltas' ? RGB.amarelo : tipo === 'X' ? RGB.favor : RGB.contra);

export function campoHtml(eventos, { rgb, modo = 'densidade', mini = false, cols = 12, rows = 8 }) {
  let camada = '';
  if (modo === 'pontos') {
    camada = eventos.map(e => `<span class="dx-ponto" style="left:${e.x_pct_normalizado}%;top:${e.y_pct_normalizado}%;background:rgb(${rgb})" title="${e.parte}ª parte${e.minuto != null ? `, ${e.minuto}'` : ''}"></span>`).join('');
  } else {
    const g = densidade(eventos, cols, rows);
    const max = Math.max(1, ...g.flat());
    camada = g.map((linha, r) => linha.map((v, c) => (v
      ? `<div class="dx-heat-cell" style="left:${(c / cols) * 100}%;top:${(r / rows) * 100}%;width:${100 / cols}%;height:${100 / rows}%;background:rgba(${rgb}, ${(0.18 + 0.72 * (v / max)).toFixed(2)})" title="${v} evento(s)">${mini ? '' : v}</div>`
      : '')).join('')).join('');
  }
  return `
    <div class="dx-field-wrap${mini ? ' mini' : ''}">
      <img src="../assets/campo.png" alt="Campo">
      <div class="dx-heat-grid">${camada}</div>
      <div class="dx-tercos" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
    </div>`;
}

export function legendaIntensidade(rgb) {
  return `<div class="dx-legenda-int"><span>menos</span><span class="dx-legenda-barra" style="background:linear-gradient(90deg, rgba(${rgb},0.18), rgba(${rgb},0.9))"></span><span>mais</span><span class="dx-mini">· ataque →</span></div>`;
}

