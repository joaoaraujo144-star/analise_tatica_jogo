# Análise de Jogo

Ferramenta web para registar dados táticos de um jogo de futebol num campo clicável, gerir o plantel e a convocatória, e obter relatórios por jogador ao longo de vários jogos — organizada por equipas, partilhável com outras contas (ex: um adjunto).

Site em produção: **https://joaoaraujo144-star.github.io/analise_tatica_jogo/login.html**

## Funcionalidades

- **Login por conta** (email + palavra-passe) — acesso a partir de qualquer dispositivo.
- **Equipas**: cada conta pode criar ou pertencer a várias equipas, com os dados totalmente isolados entre elas (jogadores, jogos, cliques de uma equipa nunca aparecem noutra).
  - Cada equipa tem um nome e um emblema (upload de imagem, ou um avatar colorido gerado automaticamente se não houver imagem), editáveis a qualquer momento diretamente no cartão da equipa.
  - **Partilhável por código de convite**: cada equipa tem um código único; quem tiver o código pode juntar-se e passa a ver e editar os mesmos dados dessa equipa.
- **Jogos**: dentro de uma equipa, cria e guarda um histórico de jogos (adversário + data). Abrir um jogo leva à sua própria página, com três tabs só disponíveis aí (Jogadores, Registo de Jogo, Relatórios) e um botão "Trocar de jogo" para voltar à lista.
- **Jogadores** (dentro de um jogo):
  - *Plantel*: lista reutilizável de jogadores da equipa (Nº + Nome), não precisa de ser reintroduzida em cada jogo.
  - *Convocados*: escolhe jogadores do plantel para o jogo atual, define Titular/Suplente, e regista por jogador: cartão amarelo, cartão vermelho, assistências, golos e minuto de substituição (tudo clicável diretamente na tabela).
- **Registo de Jogo**: 4 campos de futebol clicáveis — Faltas (Realizadas/Sofridas), Cantos, Perdas de Bola e Remates (A Favor/Contra) — cada clique marca um ponto no campo com o tipo selecionado. Atalhos de teclado `X`/`Y` trocam de modo no campo onde o rato está; clique direito ou Ctrl+clique desfaz o último ponto.
- **Relatórios**, em dois níveis:
  - Na página de um jogo: estatísticas só dos convocados desse jogo.
  - No dashboard da equipa: totais agregados por jogador (jogos, golos, assistências, cartões) ao longo de **todos** os jogos da equipa.
- **Exportação CSV**: descarrega um único ficheiro com todos os dados do jogo atualmente selecionado (jogadores convocados + todos os cliques dos 4 campos).
- **Importação de dados locais**: se existirem dados de uma versão anterior (guardados no `localStorage` do browser), a app oferece um botão para os importar como um novo jogo da equipa atual.

## Arquitetura

Site 100% estático (sem servidor próprio), hospedado no GitHub Pages, com [Supabase](https://supabase.com) (Postgres + Auth + Storage) como backend, acedido diretamente do browser via `@supabase/supabase-js` (importado de um CDN, sem build step).

### Ficheiros

| Ficheiro | Descrição |
|---|---|
| `login.html` / `login.js` | Página de login e registo de conta. |
| `teams.html` / `teams.js` | Escolher, criar, entrar (por código de convite) ou editar uma equipa (nome + emblema). Passo obrigatório entre o login e o dashboard. |
| `dashboard.html` / `dashboard.js` | Tabs "Jogos" (criar, abrir, importar dados locais) e "Relatórios" (agregado de todos os jogos da equipa). |
| `match.html` / `match.js` | Página de um jogo específico (aberto a partir do dashboard): tabs Jogadores, Registo de Jogo e Relatórios (só deste jogo), com botão "Trocar de jogo" para voltar ao dashboard. |
| `supabase-client.js` | Inicializa o cliente Supabase (URL + chave pública) — partilhado por todas as páginas. |
| `styles.css` | Estilos partilhados entre todas as páginas. |
| `supabase_schema.sql` | Esquema completo (tabelas, RLS, funções, storage) — para configurar um projeto Supabase novo de raiz. |
| `supabase_schema_teams.sql` | Migração incremental que introduziu as equipas (histórico; só necessária em projetos criados antes desta funcionalidade). |
| `supabase_schema_team_logos.sql` | Migração incremental que introduziu o emblema da equipa (histórico; idem). |
| `faltas.html` | Redirecionamento automático para `login.html`, mantido só para não quebrar o link antigo que já tinha sido partilhado. |
| `campo.png` / `campo.jpeg` | Imagem do campo de futebol usada nos 4 trackers (`campo.png` é a versão rodada para horizontal). |

### Base de dados (Supabase / Postgres)

Todas as tabelas têm Row Level Security baseada em pertença a uma equipa (`team_members`) — só quem for membro de uma equipa vê ou edita os dados dessa equipa:

- **`teams`** — equipas (`nome`, `join_code`, `logo_url`).
- **`team_members`** — quem pertence a que equipa (`role`: `owner` ou `membro`).
- **`players`** — plantel reutilizável de uma equipa (`numero`, `nome`).
- **`matches`** — jogos de uma equipa (`adversario`, `data`).
- **`match_players`** — convocatória e estatísticas de um jogador num jogo específico (`estado`, `amarelo`, `vermelho`, `assistencias`, `golo`, `minuto_substituicao`).
- **`events`** — cliques nos 4 campos (`tracker_id`, `tipo`, `x_pct`, `y_pct`).

Criar/entrar numa equipa passa por duas funções Postgres (`create_team`, `join_team_by_code`) chamadas via RPC, que tratam a criação da equipa + associação do utilizador de forma atómica. Os emblemas ficam num bucket público do Supabase Storage (`team-logos`), com upload restrito a membros da equipa correspondente.

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
