# Análise de Jogo

Ferramenta web para registar dados táticos de um jogo de futebol num campo clicável, gerir o plantel e a convocatória, e obter relatórios por jogador ao longo de vários jogos.

Site em produção: **https://joaoaraujo144-star.github.io/analise_tatica_jogo/login.html**

## Funcionalidades

- **Login por conta** (email + palavra-passe), com dados privados por conta — acesso a partir de qualquer dispositivo.
- **Jogos**: cria e guarda um histórico de jogos (adversário + data), e seleciona qual está ativo.
- **Jogadores**:
  - *Plantel*: lista reutilizável de jogadores (Nº + Nome), não precisa de ser reintroduzida em cada jogo.
  - *Convocados*: escolhe jogadores do plantel para o jogo atual, define Titular/Suplente, e regista por jogador: cartão amarelo, cartão vermelho, assistências, golos e minuto de substituição (tudo clicável diretamente na tabela).
- **Registo de Jogo**: 4 campos de futebol clicáveis — Faltas (Realizadas/Sofridas), Cantos, Perdas de Bola e Remates (A Favor/Contra) — cada clique marca um ponto no campo com o tipo selecionado. Atalhos de teclado `X`/`Y` trocam de modo no campo onde o rato está; clique direito ou Ctrl+clique desfaz o último ponto.
- **Relatórios**: totais agregados por jogador (jogos, golos, assistências, cartões) ao longo de todos os jogos guardados.
- **Exportação CSV**: descarrega um único ficheiro com todos os dados do jogo atualmente selecionado (jogadores convocados + todos os cliques dos 4 campos).
- **Importação de dados locais**: se existirem dados de uma versão anterior (guardados no `localStorage` do browser), a app oferece um botão para os importar como um novo jogo.

## Arquitetura

Site 100% estático (sem servidor próprio), hospedado no GitHub Pages, com [Supabase](https://supabase.com) (Postgres + Auth) como backend, acedido diretamente do browser via `@supabase/supabase-js` (importado de um CDN, sem build step).

### Ficheiros

| Ficheiro | Descrição |
|---|---|
| `login.html` / `login.js` | Página de login e registo de conta. |
| `dashboard.html` / `dashboard.js` | A aplicação principal (as 4 tabs: Jogos, Jogadores, Registo de Jogo, Relatórios). Só acessível com sessão ativa. |
| `supabase-client.js` | Inicializa o cliente Supabase (URL + chave pública) — partilhado por `login.js` e `dashboard.js`. |
| `styles.css` | Estilos partilhados entre as duas páginas. |
| `supabase_schema.sql` | Script SQL com as tabelas e as políticas de segurança (RLS) — corre-se uma vez no SQL Editor do Supabase. |
| `faltas.html` | Redirecionamento automático para `login.html`, mantido só para não quebrar o link antigo que já tinha sido partilhado. |
| `campo.png` / `campo.jpeg` | Imagem do campo de futebol usada nos 4 trackers (`campo.png` é a versão rodada para horizontal). |

### Base de dados (Supabase / Postgres)

4 tabelas, todas com Row Level Security — cada conta só vê e edita os seus próprios dados (`user_id = auth.uid()`):

- **`players`** — plantel reutilizável (`numero`, `nome`).
- **`matches`** — jogos (`adversario`, `data`).
- **`match_players`** — convocatória e estatísticas de um jogador num jogo específico (`estado`, `amarelo`, `vermelho`, `assistencias`, `golo`, `minuto_substituicao`).
- **`events`** — cliques nos 4 campos (`tracker_id`, `tipo`, `x_pct`, `y_pct`).

Ver `supabase_schema.sql` para a definição completa.

## Configurar um novo ambiente Supabase (do zero)

1. Criar conta e projeto grátis em [supabase.com](https://supabase.com).
2. **SQL Editor** → colar e correr o conteúdo de `supabase_schema.sql`.
3. **Authentication → Providers → Email** → confirmar que o provider está ativo e que "Allow new users to sign up" está ligado.
4. **Authentication → Providers → Email** → desligar "Confirm email" (evita depender de emails de confirmação).
5. **Settings → API** → copiar o *Project URL* e a *anon public key* e colar em `supabase-client.js` (a anon key é pública por definição — a segurança vem das políticas RLS, não de a esconder).

## Desenvolvimento local

Como a app faz pedidos `fetch` ao Supabase, precisa de ser servida por `http://`, não aberta diretamente como `file://` (o browser bloqueia esses pedidos por CORS). Para testar localmente:

```bash
python3 -m http.server 8765
```

e abrir `http://localhost:8765/login.html`.

## Publicação

O deploy é automático via GitHub Pages sempre que há um `git push` para o branch `main`:

```bash
git add -A
git commit -m "descrição da alteração"
git push
```

Fica disponível em `https://joaoaraujo144-star.github.io/analise_tatica_jogo/` cerca de 1 minuto depois.
