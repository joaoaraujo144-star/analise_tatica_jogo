// Análise de Jogo — supabase/functions/gerar-insights/index.ts
// Edge Function (Deno): gera a análise em prosa ("insights") dos
// relatórios Geral e Transições de um jogo, chamando a API da Claude.
//
// Esta é a primeira peça server-side deste projeto (que é, no resto,
// 100% estático — ver docs/architecture.md). Existe só para guardar a
// chave da API da Claude fora do browser: o cliente já calculou todos os
// números (domínio, timeline, zonas, transições, ...) em
// js/relatorio-dados.js e envia só esse resumo, não dados em bruto.
//
// A verificação do JWT do utilizador é feita automaticamente pelo
// Supabase antes do pedido chegar aqui (comportamento por omissão de
// "supabase functions deploy" — não usar --no-verify-jwt).
//
// Configurar (uma vez, do lado do utilizador — ver README.md):
//   supabase functions deploy gerar-insights
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Versão: 1.0 (2026-09-14)

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = 'claude-sonnet-5';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mesmas regras que tenho vindo a aplicar à mão nos dashboards feitos
// nesta conversa — ver docs/architecture.md § "Relatórios gerados por IA"
// para o contexto completo.
const SYSTEM_PROMPT = `És um analista de futebol amador a escrever para a equipa técnica de uma equipa (não do adversário). Recebes um resumo JSON já agregado de um jogo (contagens, zonas do campo, transições) e escreves entre 4 a 6 "insights" curtos em português de Portugal.

Regras obrigatórias:
- Nunca resumas "a favor" e "contra" (ou "ganhos"/"perdas") num saldo líquido — usa sempre os dois valores reais.
- O relatório é sempre do ponto de vista da equipa do utilizador ("nós"), nunca do adversário.
- Se o resumo indicar uma discrepância de dados (ex: marcador de um golo diferente entre duas fontes), esse é sempre o insight de maior prioridade (level "bad", badge "Dados a corrigir" ou semelhante).
- Preferir números concretos (contagens, percentagens, minutos) a generalidades.
- Nunca inventar factos que não estejam no JSON recebido.
- Tom direto e útil para um treinador, não literário.

Devolve APENAS um array JSON válido, sem markdown à volta, no formato:
[{ "level": "good" | "info" | "concern" | "bad", "badge": "Rótulo curto", "text": "Frase(s) do insight." }]`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada (supabase secrets set).' }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido no pedido.' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { tipo, dados } = body || {};
  if (!['geral', 'transicoes'].includes(tipo) || !dados) {
    return new Response(JSON.stringify({ error: 'Corpo do pedido tem de ter "tipo" (geral/transicoes) e "dados".' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const userPrompt = `Tipo de relatório: ${tipo}\n\nDados do jogo (JSON):\n${JSON.stringify(dados)}`;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return new Response(JSON.stringify({ error: `API da Claude: ${anthropicRes.status} ${errText}` }), {
      status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const anthropicData = await anthropicRes.json();
  const rawText = (anthropicData.content || []).map((b: { text?: string }) => b.text || '').join('');

  let insights;
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    insights = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    // Nunca deixar o pedido falhar só porque o modelo não devolveu JSON
    // limpo — mostra o texto em bruto como um único insight "info".
    insights = [{ level: 'info', badge: 'Análise', text: rawText.trim() }];
  }

  return new Response(JSON.stringify({ insights }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
