/**
 * Análise de Jogo — js/direcao/paginas/plantel.js
 * Página 5 do Dashboard Executivo — Gestão do Plantel: profundidade,
 * utilização e necessidades. Distribuição por posição (com o mínimo
 * desejado editável aqui), utilização (minutos, titularidades, % dos
 * minutos disponíveis, posições secundárias editáveis aqui), evolução
 * entre períodos e planeamento (necessidades, prioridades,
 * acompanhamento, possíveis decisões) com as regras de ../plantel.js.
 *
 * Disponibilidade e contratos: sem fonte na base de dados — mostram
 * "Dados indisponíveis" (ver FONTES_FUTURAS).
 *
 * Versão: 1.0 (2026-11-17)
 */

import {
  POSICOES, POSICAO_LABEL, REGRAS, FONTES_FUTURAS, lerPosicoes, idade,
  distribuicaoPosicoes, utilizacao, participacaoPorPosicao, evolucaoJogadores, planeamento,
} from '../plantel.js';
import { estatisticasJogador } from '../individual.js';
import { carregarPlantel, carregarMinimos, guardarMinimo, guardarSecundarias } from '../dados.js';
import { esc, num, pct, ND } from '../ui.js';
import { RGB } from '../campo.js';

const nome = (p) => `${p.numero ? `${p.numero} ` : ''}${p.nome}`;
const listaNomes = (js) => (js.length ? js.map(j => esc(nome(j))).join(', ') : '<span class="dx-mini">—</span>');
const posLabel = (p) => (p ? `${p} — ${POSICAO_LABEL[p]}` : 'Sem posição');
let mensagem = null; // { texto, erro } da última gravação

function calcular(ctx) {
  const { plantel, minimos } = ctx.extra;
  const distribuicao = distribuicaoPosicoes(plantel, minimos);
  const utilizacoes = utilizacao(plantel, ctx.atual, ctx.detalhe);
  const participacao = participacaoPorPosicao(utilizacoes);
  const anterior = ctx.anterior.length
    ? new Map(plantel.map(p => [p.id, estatisticasJogador(p.id, ctx.anterior, ctx.detalhe)]))
    : null;
  const evolucao = anterior ? evolucaoJogadores(utilizacoes, anterior) : [];
  const plano = planeamento({ distribuicao, utilizacoes, evolucao });
  return { plantel, minimos, distribuicao, utilizacoes, participacao, evolucao, temAnterior: !!anterior, plano };
}

// ---------- Blocos ----------

function kpi(label, valor, sub = '') {
  return `<article class="dx-card"><div class="dx-kpi-label">${label}</div><div class="dx-kpi-big">${valor}</div>${sub ? `<div class="dx-kpi-sub">${sub}</div>` : ''}</article>`;
}

function kpisHtml(c) {
  const comPos = c.plantel.filter(p => p.posicao).length;
  const definidos = c.distribuicao.linhas.filter(l => l.minimo != null);
  const comDefice = definidos.filter(l => l.defice > 0).length;
  const disp = c.utilizacoes[0]?.minutosDisponiveis ?? 0;
  return `
    <section class="dx-kpis">
      ${kpi('Jogadores no plantel', c.plantel.length, `${comPos} com posição definida`)}
      ${kpi('Posições com défice', definidos.length ? comDefice : ND, definidos.length ? `de ${definidos.length} com mínimo definido` : 'define os mínimos na tabela abaixo')}
      ${kpi('Dependências', c.plano.dependencias.length, `um jogador com ≥ ${REGRAS.dependenciaPct}% dos minutos da posição`)}
      ${kpi('Minutos disponíveis', disp || ND, 'soma da duração dos jogos do período')}
    </section>`;
}

function distribuicaoHtml(c) {
  const partPorPos = new Map(c.participacao.grupos.map(g => [g.posicao, g]));
  const idadeMedia = (js) => {
    const is = js.map(j => idade(j.data_nascimento)).filter(v => v != null);
    return is.length ? `${num(is.reduce((a, b) => a + b, 0) / is.length, 1)} <span class="dx-mini">(${is.length}/${js.length})</span>` : ND;
  };
  const corpo = c.distribuicao.linhas.map(l => {
    const g = partPorPos.get(l.posicao);
    const defice = l.minimo == null ? ND : l.defice > 0 ? `<span class="dx-warn-txt">−${l.defice}</span>` : '0';
    return `<tr>
      <td><strong>${l.posicao}</strong> <span class="dx-mini">${POSICAO_LABEL[l.posicao]}</span></td>
      <td>${l.principais.length}</td>
      <td class="dx-td-texto">${listaNomes(l.principais)}</td>
      <td class="dx-td-texto">${listaNomes(l.secundarios)}</td>
      <td><input type="number" min="0" max="20" class="dx-input-num" data-minimo="${l.posicao}" value="${l.minimo ?? ''}" placeholder="—" aria-label="Mínimo ${l.posicao}"></td>
      <td>${defice}</td>
      <td>${g ? `${num(g.pct, 0)}%` : '0%'}</td>
      <td>${idadeMedia(l.principais)}</td>
    </tr>`;
  }).join('');
  const sem = c.distribuicao.semPosicao;
  return `
    <div class="dx-card">
      <h2 class="dx-section-title">Distribuição por posição</h2>
      <p class="dx-mini">"De raiz" = posição principal (tab Plantel). "Podem atuar" = quem a tem como posição secundária (editável na tabela de utilização). Mínimo vazio = não definido (sem défice calculado). Idade média só de quem preencheu a data de nascimento.</p>
      ${sem.length ? `<div class="dx-insight warning">${sem.length} jogador(es) sem posição definida: ${listaNomes(sem)} — não entram na distribuição.</div>` : ''}
      <div class="dx-table-scroll" style="margin-top:10px">
        <table class="dx-table">
          <thead><tr><th>Posição</th><th>Nº</th><th>De raiz</th><th>Podem atuar</th><th>Mínimo</th><th>Défice</th><th>Minutos da posição</th><th>Idade média</th></tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
    </div>`;
}

function utilizacaoHtml(c) {
  const ordem = (p) => (p.posicao ? POSICOES.indexOf(p.posicao) : 99);
  const us = c.utilizacoes.slice().sort((a, b) => ordem(a.jogador) - ordem(b.jogador) || b.stats.minutos - a.stats.minutos);
  const corpo = us.map(u => {
    const p = u.jogador, s = u.stats;
    const ida = idade(p.data_nascimento);
    const barra = u.pctMinutos == null ? ND
      : `<span class="dx-uso"><span style="width:${Math.min(100, u.pctMinutos)}%;background:rgb(${RGB.favor})"></span></span> ${num(u.pctMinutos, 0)}%${u.incompleto ? '<span class="dx-warn-txt" title="Há jogos com minutos desconhecidos">*</span>' : ''}`;
    return `<tr>
      <td>${esc(nome(p))}</td>
      <td>${p.posicao || ND}</td>
      <td><input type="text" class="dx-input-txt" data-secundarias="${p.id}" data-principal="${p.posicao || ''}" value="${esc((p.posicoes_secundarias || []).join(', '))}" placeholder="ex: MC, MO" aria-label="Outras posições de ${esc(p.nome)}"></td>
      <td>${ida ?? ND}</td>
      <td>${s.convocatorias}</td>
      <td>${s.jogos}</td>
      <td>${s.titularidades}</td>
      <td>${s.minutos}</td>
      <td>${barra}</td>
    </tr>`;
  }).join('');
  return `
    <div class="dx-card" style="margin-top:15px">
      <h2 class="dx-section-title">Utilização</h2>
      <p class="dx-mini">Período atual. % = minutos jogados ÷ minutos disponíveis (jogos com tempos completos). * = minutos desconhecidos em algum jogo (tempos ou substituição sem minuto). Outras posições: abreviaturas separadas por vírgula (${POSICOES.join(', ')}).</p>
      <div class="dx-table-scroll">
        <table class="dx-table">
          <thead><tr><th>Jogador</th><th>Posição</th><th>Outras posições</th><th>Idade</th><th>Convocatórias</th><th>Jogos</th><th>Titular</th><th>Minutos</th><th>% minutos disponíveis</th></tr></thead>
          <tbody>${corpo || '<tr><td colspan="9">Plantel vazio.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function participacaoHtml(c) {
  if (!c.participacao.total) return `<div class="dx-card"><h2 class="dx-section-title">Participação por posição</h2><p class="dx-mini">Sem minutos registados no período.</p></div>`;
  const linhas = c.participacao.grupos.slice().sort((a, b) => b.minutos - a.minutos).map(g => `
    <div class="dx-zbar">
      <span class="dx-zbar-nome">${g.posicao || 'Sem pos.'}</span>
      <span class="dx-zbar-pista"><span style="width:${g.pct}%;background:rgb(${RGB.favor})"></span></span>
      <span class="dx-zbar-val">${g.minutos}′ · ${num(g.pct, 0)}%</span>
    </div>`).join('');
  return `
    <div class="dx-card">
      <h2 class="dx-section-title">Participação por posição</h2>
      <p class="dx-mini">Quota dos minutos jogados no período, pela posição principal.</p>
      <div style="margin-top:10px">${linhas}</div>
    </div>`;
}

function evolucaoHtml(c) {
  if (!c.temAnterior) {
    return `<div class="dx-card"><h2 class="dx-section-title">Evolução entre períodos</h2><p class="dx-mini">Sem período anterior com estes filtros — usa "Últimos N jogos".</p></div>`;
  }
  const lista = (leitura) => {
    const es = c.evolucao.filter(e => e.leitura === leitura).sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao));
    return es.length
      ? `<ul class="dx-lista">${es.map(e => `<li>${esc(nome(e.jogador))} <span class="dx-mini">${e.jogador.posicao || ''} · rácio ${num(e.anterior, 2)} → ${num(e.atual, 2)} (${pct(e.variacao)})</span></li>`).join('')}</ul>`
      : '<p class="dx-mini">Nenhum.</p>';
  };
  const semAmostra = c.evolucao.filter(e => e.leitura == null).length;
  return `
    <div class="dx-card">
      <h2 class="dx-section-title">Evolução entre períodos</h2>
      <p class="dx-mini">Variação do rácio ganhos/perdas de ≥ ${REGRAS.evolucaoPct}%, só com ≥ ${REGRAS.evolucaoMinMinutos} min (codificação completa) e ≥ ${REGRAS.evolucaoMinAcoes} ganhos+perdas em cada período. ${semAmostra} jogador(es) sem amostra suficiente.</p>
      <div class="dx-grid-even" style="margin-top:8px">
        <div><div class="dx-kpi-delta good" style="margin-bottom:6px">▲ Evolução positiva</div>${lista('positiva')}</div>
        <div><div class="dx-kpi-delta bad" style="margin-bottom:6px">▼ Evolução negativa</div>${lista('negativa')}</div>
      </div>
    </div>`;
}

function planeamentoHtml(c) {
  const { necessidades, prioridades, acompanhamento, decisoes } = c.plano;
  const semMinimos = !c.minimos.length;
  const nec = necessidades.length
    ? `<ul class="dx-lista">${necessidades.map(n => `<li><strong>${posLabel(n.posicao)}</strong>: ${n.atuais} de raiz para um mínimo de ${n.minimo} (faltam ${n.defice})${n.alternativas.length ? ` — podem atuar: ${listaNomes(n.alternativas)}` : ' — sem alternativas por posição secundária'}.</li>`).join('')}</ul>`
    : `<p class="dx-mini">${semMinimos ? 'Define os mínimos por posição para identificar necessidades.' : 'Nenhuma posição abaixo do mínimo.'}</p>`;
  const pri = prioridades.length
    ? `<ol class="dx-lista">${prioridades.map(p => `<li><strong>${posLabel(p.posicao)}</strong> — ${p.motivo === 'defice'
      ? `défice de ${p.n.defice}${p.n.alternativas.length >= p.n.defice ? ' (coberto por posições secundárias)' : ''}`
      : `dependência de ${esc(nome(p.d.jogador))} (${num(p.d.quota, 0)}% dos minutos, ${p.d.alternativas} alternativa(s))`}</li>`).join('')}</ol>`
    : '<p class="dx-mini">Sem posições prioritárias pelas regras atuais.</p>';
  const TXT = {
    pouco_utilizado: (a) => `${num(a.u.pctMinutos, 0)}% dos minutos disponíveis em ${a.u.stats.convocatorias} convocatórias — avaliar o papel no plantel e a evolução em treino.`,
    minutos_incompletos: () => 'minutos desconhecidos em algum jogo — completar o minuto das substituições.',
    evolucao_negativa: (a) => `rácio ganhos/perdas ${num(a.e.anterior, 2)} → ${num(a.e.atual, 2)} — rever em vídeo, com o contexto da função.`,
  };
  const aco = acompanhamento.length
    ? `<ul class="dx-lista">${acompanhamento.map(a => `<li>${esc(nome(a.jogador))}: ${TXT[a.tipo](a)}</li>`).join('')}</ul>`
    : '<p class="dx-mini">Nenhum jogador a sinalizar pelas regras atuais.</p>';
  const dec = decisoes.length
    ? `<ul class="dx-lista">${decisoes.map(d => (d.tipo === 'reforcar'
      ? `<li>Reforçar <strong>${posLabel(d.posicao)}</strong> — recrutar ou adaptar${d.n.alternativas.length ? ` (candidatos a adaptar: ${listaNomes(d.n.alternativas)})` : ''}.</li>`
      : `<li>Preparar alternativa a <strong>${esc(nome(d.d.jogador))}</strong> em ${posLabel(d.posicao)} — formar/adaptar um 2.º jogador ou recrutar.</li>`)).join('')}</ul>`
    : '<p class="dx-mini">Sem decisões sugeridas pelas regras atuais.</p>';
  return `
    <div class="dx-card" style="margin-top:15px">
      <h2 class="dx-section-title">Planeamento</h2>
      <p class="dx-mini">Regras: necessidade = de raiz abaixo do mínimo; dependência = um jogador com ≥ ${REGRAS.dependenciaPct}% dos minutos da posição e nenhuma alternativa; pouco utilizado = ≥ ${REGRAS.poucoUsoConvocatorias} convocatórias e &lt; ${REGRAS.poucoUsoPct}% dos minutos disponíveis. São possíveis decisões para avaliar, não decisões tomadas.</p>
      <div class="dx-grid-even">
        <div><h3 class="dx-subtitulo">Necessidades identificadas</h3>${nec}</div>
        <div><h3 class="dx-subtitulo">Posições prioritárias</h3>${pri}</div>
        <div><h3 class="dx-subtitulo">Recomendações de acompanhamento</h3>${aco}</div>
        <div><h3 class="dx-subtitulo">Possíveis decisões sobre o plantel</h3>${dec}</div>
      </div>
    </div>`;
}

function indisponiveisHtml() {
  const card = (titulo, fonte) => `
    <div class="dx-estado dx-estado-esq">
      <strong>${titulo} — dados indisponíveis</strong>
      Não há fonte para isto na base de dados, por isso não é estimado nem simulado. Para o integrar seria preciso: ${esc(fonte)}
    </div>`;
  return `
    <div class="dx-grid-even">
      ${card('Disponibilidade (lesões, castigos)', FONTES_FUTURAS.disponibilidade)}
      ${card('Contratos', FONTES_FUTURAS.contratos)}
    </div>`;
}

// ---------- Página ----------

export const plantel = {
  titulo: 'Gestão do Plantel',
  precisaDetalhe: true,
  async carregarExtra(teamId) {
    const [plantel, minimos] = await Promise.all([carregarPlantel(teamId), carregarMinimos(teamId)]);
    return { plantel, minimos };
  },
  render(ctx) {
    const c = calcular(ctx);
    const msg = mensagem ? `<div class="dx-msg${mensagem.erro ? ' erro' : ''}">${esc(mensagem.texto)}</div>` : '';
    mensagem = null;
    return `
      ${msg}
      ${kpisHtml(c)}
      ${distribuicaoHtml(c)}
      ${utilizacaoHtml(c)}
      <div class="dx-grid-even">
        ${participacaoHtml(c)}
        ${evolucaoHtml(c)}
      </div>
      ${planeamentoHtml(c)}
      ${indisponiveisHtml()}`;
  },
  depois(ctx) {
    const gravar = async (acao, ok) => {
      try {
        await acao();
        mensagem = { texto: ok };
      } catch (err) {
        console.error(err);
        mensagem = { texto: `Não foi possível gravar: ${err.message || err}`, erro: true };
      }
      ctx.invalidarExtra();
      ctx.redesenhar();
    };
    document.querySelectorAll('[data-minimo]').forEach(inp => inp.addEventListener('change', () => {
      const v = inp.value.trim();
      const n = v === '' ? null : Number(v);
      if (n != null && (!Number.isInteger(n) || n < 0)) { inp.value = ''; return; }
      gravar(() => guardarMinimo(ctx.equipa.id, inp.dataset.minimo, n), `Mínimo de ${inp.dataset.minimo} ${n == null ? 'removido' : `definido: ${n}`}.`);
    }));
    document.querySelectorAll('[data-secundarias]').forEach(inp => inp.addEventListener('change', () => {
      const { validas, invalidas } = lerPosicoes(inp.value, inp.dataset.principal || null);
      const aviso = invalidas.length ? ` Ignorado: ${invalidas.join(', ')} (não é uma posição).` : '';
      gravar(() => guardarSecundarias(inp.dataset.secundarias, validas), `Outras posições gravadas: ${validas.join(', ') || 'nenhuma'}.${aviso}`);
    }));
  },
};
