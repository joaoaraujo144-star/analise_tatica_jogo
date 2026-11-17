/**
 * Análise de Jogo — js/direcao/paginas/alertas.js
 * Página 6 do Dashboard Executivo — Alertas: transformar os indicadores
 * em informação útil para a Gestão Desportiva.
 *
 *  - Alertas por regras transparentes (../alertas.js): coletivos (período
 *    atual vs. anterior), produção individual e dependência de jogadores.
 *    Cada alerta mostra indicador, atual, anterior, variação, limite,
 *    período, gravidade e recomendação de análise.
 *  - Configuração dos indicadores (tabela kpi_targets): direção
 *    favorável, alerta ativo, limite e gravidade — vale para todo o
 *    dashboard.
 *  - Qualidade dos dados do período.
 *
 * Versão: 1.3 (2026-11-17)
 *
 * Histórico:
 *   1.3 — no telemóvel, cada alerta é um cartão (dx-table-cartoes).
 *   1.2 — cálculo passou para calcularAlertas() em ../alertas.js.
 *   1.1 — sem o registo de decisões (pedido: só alertas); página passa a
 *         chamar-se "Alertas".
 *   1.0 — criação (fase 7).
 */

import { ESPECIAIS, GRAVIDADES, GRAVIDADE_LABEL, calcularAlertas, qualidadeEventos } from '../alertas.js';
import { verificarOrientacao } from '../territorial.js';
import { carregarPlantel, carregarMinimos, guardarTarget, reporTarget } from '../dados.js';
import { esc, num, pct, dataCurta, ND } from '../ui.js';

let mensagem = null;
let periodoTexto = '';

const intervalo = (js) => (js.length ? `${dataCurta(js[0].data)}–${dataCurta(js[js.length - 1].data)}` : '');

// ---------- Cálculo ----------

function calcular(ctx) {
  return calcularAlertas({ ...ctx, plantel: ctx.extra.plantel, minimos: ctx.extra.minimos });
}

// ---------- Blocos ----------

function selectHtml(attrs, opcoes, valor) {
  return `<select ${attrs}>${opcoes.map(([v, l]) => `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}

const badgeGravidade = (g) => `<span class="dx-grav ${g}">${GRAVIDADE_LABEL[g]}</span>`;

function kpisHtml(c) {
  const n = (t) => c.alertas.filter(a => (t.startsWith('g:') ? a.gravidade === t.slice(2) : a.tipo === t)).length;
  return `
    <section class="dx-kpis">
      <article class="dx-card"><div class="dx-kpi-label">Alertas ativos</div><div class="dx-kpi-big">${c.alertas.length}</div><div class="dx-kpi-sub">${n('g:alta')} alta · ${n('g:media')} média · ${n('g:baixa')} baixa</div></article>
      <article class="dx-card"><div class="dx-kpi-label">Coletivos</div><div class="dx-kpi-big">${n('coletivo')}</div><div class="dx-kpi-sub">evolução da equipa face ao período anterior</div></article>
      <article class="dx-card"><div class="dx-kpi-label">Produção individual</div><div class="dx-kpi-big">${n('individual')}</div><div class="dx-kpi-sub">jogadores com queda acima do limite</div></article>
      <article class="dx-card"><div class="dx-kpi-label">Dependências</div><div class="dx-kpi-big">${n('dependencia')}</div><div class="dx-kpi-sub">posições presas a um só jogador</div></article>
    </section>`;
}

function valorAlerta(a, v) {
  if (v == null) return ND;
  return a.tipo === 'dependencia' ? `${num(v, 0)}%` : num(v, a.casas === 0 ? 0 : 2);
}

function alertasHtml(ctx, c) {
  const semComparacao = !ctx.anterior.length
    ? `<div class="dx-insight neutral">${['epoca', 'intervalo'].includes(ctx.filtros.janela) ? 'Os alertas de evolução comparam com o período anterior — escolhe "Últimos N jogos" nos filtros.' : 'Sem jogos anteriores a este período com os filtros escolhidos.'} Só os alertas de dependência estão a ser avaliados.</div>`
    : !c.col.suficiente ? `<div class="dx-insight neutral">Alertas coletivos precisam de pelo menos 3 jogos em cada período (atual: ${ctx.atual.length}, anterior: ${ctx.anterior.length}).</div>` : '';
  const corpo = c.alertas.map(a => `
    <tr>
      <td class="dx-cel-topo">${badgeGravidade(a.gravidade)}</td>
      <td class="dx-cel-titulo">${esc(a.label)}</td>
      <td data-label="Atual"><strong>${valorAlerta(a, a.atual)}</strong></td>
      <td data-label="Anterior">${a.tipo === 'dependencia' ? '—' : valorAlerta(a, a.anterior)}</td>
      <td data-label="Variação">${a.tipo === 'dependencia' ? '—' : pct(a.variacao)}</td>
      <td data-label="Limite">${a.tipo === 'dependencia' ? `≥ ${num(a.limite, 0)}% (${a.alternativas} alternativa(s))` : `${num(a.limite, 0)}%`}</td>
      <td data-label="Período">${a.tipo === 'dependencia' ? `${intervalo(ctx.atual)}` : periodoTexto}</td>
      <td class="dx-td-texto dx-cel-nota">${esc(a.recomendacao)}</td>
    </tr>`).join('');
  return `
    <div class="dx-card">
      <h2 class="dx-section-title">Alertas</h2>
      <p class="dx-mini">Regras: um indicador com alerta ativo dispara quando evolui no sentido desfavorável pelo menos o limite configurado (≥ 3 jogos em cada período); produção individual = (ganhos + remates + cruzamentos) por 90, com ≥ 90 min e ≥ 5 dessas ações em cada período; dependência = um jogador com a quota de minutos da posição acima do limite e nenhuma alternativa. Configurável na tabela do fim da página.</p>
      ${semComparacao}
      ${c.alertas.length ? `
        <div class="dx-table-scroll" style="margin-top:10px">
          <table class="dx-table dx-table-cartoes">
            <thead><tr><th>Gravidade</th><th>Indicador</th><th>Atual</th><th>Anterior</th><th>Variação</th><th>Limite</th><th>Período</th><th>Recomendação de análise</th></tr></thead>
            <tbody>${corpo}</tbody>
          </table>
        </div>` : '<p class="dx-mini" style="margin-top:10px">Nenhum alerta com as regras e os filtros atuais.</p>'}
    </div>`;
}

function configuracaoHtml(ctx) {
  const DIRECOES = [['subir', 'Mais é melhor'], ['descer', 'Menos é melhor']];
  const linha = (ind, especial) => {
    const c = ctx.config.get(ind.id);
    const semAlerta = !especial && ind.soAbsoluto;
    const direcao = especial
      ? '<span class="dx-mini">—</span>'
      : selectHtml(`data-cfg="${ind.id}" data-campo="direcao" aria-label="Direção de ${esc(ind.label)}"`, c.direcao ? DIRECOES : [['', 'Sem juízo'], ...DIRECOES], c.direcao || '');
    return `<tr>
      <td>${esc(ind.label)}${especial ? `<div class="dx-mini">${esc(ind.descricao)}</div>` : ''}</td>
      <td>${direcao}</td>
      <td>${semAlerta ? '<span class="dx-mini" title="Sem variação % — só em absoluto">—</span>' : `<input type="checkbox" data-cfg="${ind.id}" data-campo="ativo" ${c.ativo ? 'checked' : ''} aria-label="Alerta ativo">`}</td>
      <td>${semAlerta ? '—' : `<input type="number" min="0" max="500" step="1" class="dx-input-num" data-cfg="${ind.id}" data-campo="limite" value="${c.limite}" aria-label="Limite %">`}</td>
      <td>${semAlerta ? '—' : selectHtml(`data-cfg="${ind.id}" data-campo="gravidade" aria-label="Gravidade"`, GRAVIDADES.map(g => [g, GRAVIDADE_LABEL[g]]), c.gravidade)}</td>
      <td>${c.origem === 'configurado' ? `Configurado <button type="button" class="dx-btn-link" data-cfg-repor="${ind.id}">repor</button>` : '<span class="dx-mini">Por omissão</span>'}</td>
    </tr>`;
  };
  const aviso = ctx.avisoTargets
    ? `<div class="dx-insight warning">Não foi possível ler a configuração guardada (${esc(ctx.avisoTargets)}) — a usar os valores por omissão. Confirma que a migração 035 foi corrida.</div>` : '';
  return `
    <div class="dx-card" style="margin-top:15px">
      <h2 class="dx-section-title">Configuração dos indicadores</h2>
      <p class="dx-mini">A direção favorável vale para todo o dashboard (tendências e alertas). Limite = variação % (em valor absoluto) a partir da qual uma evolução desfavorável gera alerta. Um alerta precisa de direção definida.</p>
      ${aviso}
      <div class="dx-table-scroll" style="margin-top:10px">
        <table class="dx-table">
          <thead><tr><th>Indicador</th><th>Direção favorável</th><th>Alerta</th><th>Limite %</th><th>Gravidade</th><th>Origem</th></tr></thead>
          <tbody>${ctx.indicadores.map(i => linha(i, false)).join('')}${ESPECIAIS.map(i => linha(i, true)).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

function qualidadeHtml(ctx) {
  const jogos = [...ctx.anterior, ...ctx.atual];
  const { atual } = ctx;
  const conta = (f) => atual.filter(f).length;
  const q = qualidadeEventos(ctx.detalhe.eventos, atual);
  const ids = new Set(jogos.map(j => j.id));
  const orient = verificarOrientacao(ctx.detalhe.eventos.filter(e => ids.has(e.match_id)));
  const linhas = [
    ['Jogos no período', atual.length],
    ['Codificação completa / parcial / não indicada', `${conta(j => j.codificacao === 'completa')} / ${conta(j => j.codificacao === 'parcial')} / ${conta(j => !j.codificacao)}`],
    ['Sem resultado fiável (golos por registar)', conta(j => !j.golos_consistentes)],
    ['Sem tempos de jogo completos', conta(j => !j.minutos_jogo)],
    ['Sem casa/fora indicado', conta(j => !j.local)],
    ['Sem competição indicada', conta(j => !j.competicao)],
    ['Eventos no período', q.total],
    ['Eventos de tipo desconhecido', q.tiposDesconhecidos],
    ['Eventos com coordenadas inválidas', q.coordenadasInvalidas],
    ['Eventos sem minuto', q.semMinuto],
    ['Eventos com parte inválida', q.parteInvalida],
    ['Duplicados prováveis (mesmo jogo, tipo, parte e ponto exato)', q.duplicados],
    ['Ações atribuíveis sem jogador', `${q.semJogador} de ${q.atribuiveis}`],
    ['Partes com orientação de ataque suspeita (atual + anterior)', orient.filter(o => o.estado === 'suspeito').length],
  ];
  return `
    <div class="dx-card" style="margin-top:15px">
      <h2 class="dx-section-title">Qualidade dos dados do período</h2>
      <p class="dx-mini">Jogos sem codificação completa não contam "nenhum evento" como zero; jogos sem tempos não entram nos valores por 90. Detalhe da orientação na Análise Territorial.</p>
      <div class="dx-table-scroll"><table class="dx-table"><tbody>${linhas.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
}

// ---------- Página ----------

export const alertas = {
  titulo: 'Alertas',
  precisaDetalhe: true,
  async carregarExtra(teamId) {
    const [plantel, minimos] = await Promise.all([carregarPlantel(teamId), carregarMinimos(teamId)]);
    return { plantel, minimos };
  },
  render(ctx) {
    const c = calcular(ctx);
    periodoTexto = ctx.anterior.length
      ? `${ctx.atual.length} jogos (${intervalo(ctx.atual)}) vs. ${ctx.anterior.length} anteriores (${intervalo(ctx.anterior)})`
      : intervalo(ctx.atual);
    const msg = mensagem ? `<div class="dx-msg${mensagem.erro ? ' erro' : ''}">${esc(mensagem.texto)}</div>` : '';
    mensagem = null;
    return `
      ${msg}
      ${kpisHtml(c)}
      ${alertasHtml(ctx, c)}
      ${configuracaoHtml(ctx)}
      ${qualidadeHtml(ctx)}`;
  },
  depois(ctx) {
    const raiz = document.getElementById('conteudo');
    const correr = async (acao, ok) => {
      try {
        await acao();
        mensagem = { texto: ok };
      } catch (err) {
        console.error(err);
        mensagem = { texto: `Não foi possível gravar: ${err.message || err}`, erro: true };
      }
      await ctx.recarregarConfig();
      ctx.redesenhar();
    };

    // Configuração: qualquer mudança grava a linha inteira do indicador.
    const lerLinha = (id) => {
      const campo = (c) => raiz.querySelector(`[data-cfg="${id}"][data-campo="${c}"]`);
      const atual = ctx.config.get(id);
      const especial = ESPECIAIS.find(x => x.id === id);
      return {
        direcao: especial ? especial.direcao : (campo('direcao')?.value || null),
        ativo: campo('ativo') ? campo('ativo').checked : false,
        limite: campo('limite') ? Number(campo('limite').value) : atual.limite,
        gravidade: campo('gravidade')?.value || atual.gravidade,
      };
    };
    raiz.querySelectorAll('[data-cfg]').forEach(inp => inp.addEventListener('change', () => {
      const id = inp.dataset.cfg;
      const v = lerLinha(id);
      if (!Number.isFinite(v.limite) || v.limite < 0) { mensagem = { texto: 'Limite inválido.', erro: true }; ctx.redesenhar(); return; }
      if (!v.direcao) {
        // "Sem juízo" não se guarda (a base de dados exige direção): repõe a omissão.
        if (v.ativo) { mensagem = { texto: 'Um alerta precisa de uma direção favorável definida.', erro: true }; ctx.redesenhar(); return; }
        correr(() => reporTarget(ctx.equipa.id, id), 'Configuração reposta (sem juízo).');
        return;
      }
      correr(() => guardarTarget(ctx.equipa.id, id, v), 'Configuração gravada.');
    }));
    raiz.querySelectorAll('[data-cfg-repor]').forEach(b => b.addEventListener('click', () => {
      correr(() => reporTarget(ctx.equipa.id, b.dataset.cfgRepor), 'Valores por omissão repostos.');
    }));
  },
};
