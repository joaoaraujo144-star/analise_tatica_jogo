# Análise de Jogo

Ferramenta web para registar dados táticos de um jogo de futebol num campo clicável, gerir o plantel e a convocatória, e obter relatórios por jogador ao longo de vários jogos — organizada por equipas, partilhável com outras contas (ex: um adjunto).

Site em produção: **https://joaoaraujo144-star.github.io/analise_tatica_jogo/** (o link antigo `.../login.html` continua a funcionar, redireciona automaticamente).

## Funcionalidades

- **Login por conta** (email + palavra-passe) — acesso a partir de qualquer dispositivo.
- **Equipas**: cada conta pode criar ou pertencer a várias equipas, com os dados totalmente isolados entre elas (jogadores, jogos, cliques de uma equipa nunca aparecem noutra).
  - Cada equipa tem um nome e um emblema (upload de imagem, ou um avatar colorido gerado automaticamente se não houver imagem), editáveis a qualquer momento diretamente no cartão da equipa.
  - **Partilhável por código de convite**: cada equipa tem um código único; quem tiver o código pode juntar-se e passa a ver e editar os mesmos dados dessa equipa.
- **Plantel**: tab no dashboard da equipa — lista reutilizável de jogadores (Nº + Nome), gerida uma única vez e partilhada por todos os jogos da equipa.
  - **Login do jogador (opcional)**: o treinador pode criar um acesso próprio para cada jogador diretamente nesta tab ("Criar login") — só define a palavra-passe; o "utilizador" (formato de email, ex: `joao-silva-x7k9@jogador.app`) é gerado automaticamente a partir do nome, e o jogador nunca precisa de ter esse email real. O jogador passa a poder entrar sozinho, mas só vê uma página própria (`jogador.html`) com o questionário de wellness, nunca o resto da equipa.
- **Wellness**: tab no dashboard da equipa com a resposta de hoje de cada jogador — dores musculares, stress, fadiga e sono (0-10), ou ❌ se ainda não respondeu — e a **média do dia por métrica** (só sobre quem já respondeu). Cada jogador só pode responder uma vez por dia, na própria conta; no primeiro login, completa o perfil (nome + data de nascimento) antes do primeiro questionário.
  - **Exportar para Excel**: dois botões, "Exportar diário" (respostas + médias de hoje) e "Exportar semanal" (uma linha por jogador/dia da semana civil atual — segunda a domingo — mais uma folha só com as médias diárias da equipa).
- **Jogos**: dentro de uma equipa, cria e guarda um histórico de jogos (adversário + data). Abrir um jogo leva à sua própria página, com três tabs só disponíveis aí (Jogadores, Registo de Jogo, Relatórios) e um botão "Trocar de jogo" para voltar à lista.
- **Cronómetro do jogo**: botões "Iniciar 1ª Parte", "Finalizar Parte" e "Iniciar 2ª Parte" (cada um grava a hora exata), um indicador visual (slide) da parte atual, um temporizador grande em minutos:segundos que conta a partir do início da parte em curso, e "Recomeçar Jogo" para limpar o cronómetro sem apagar dados. Quando a 2ª parte termina, a tab Registo de Jogo desaparece (troca automaticamente para Relatórios se estiver aberta) e a tab Jogadores fica bloqueada, só de leitura.
- **Edição só com o jogo a decorrer**: enquanto nenhuma parte está em curso (antes de começar, no intervalo, ou depois de terminar uma parte), só é possível convocar/remover jogadores e mudar o Estado (Titular/Suplente) na tab Jogadores; cartões, assistências, golos, substituição e os cliques no Registo de Jogo ficam bloqueados até haver uma parte a decorrer.
- **Orientação do campo**: uma seta clicável define a direção de ataque da equipa na 1ª parte; fica bloqueada assim que "Iniciar 1ª Parte" é premido e inverte automaticamente ao iniciar a 2ª parte. Fica guardada na base de dados (`matches.orientacao_parte1`).
- **Jogadores** (dentro de um jogo): *Convocatória* — escolhe jogadores do plantel para o jogo atual, define Titular/Suplente, e regista por jogador: 2 cartões amarelos, cartão vermelho, assistências, golos e substituição (tudo clicável diretamente na tabela). Marcar os 2 cartões amarelos marca automaticamente o vermelho. O badge de substituição adapta-se ao Estado: um Titular só alterna entre `—` e `Saiu`; um Suplente só entre `—` e `Entrou`.
- **Registo de Jogo**: 5 campos de futebol clicáveis — Faltas (Realizadas/Sofridas), Cantos (A Favor/Contra), Cruzamentos (A Favor/Contra), Ganhos/Perdas de Bola e Remates (A Favor/Contra) — cada clique marca um ponto no campo com o tipo selecionado, com o minuto do jogo (relativo ao início da parte em curso) e a hora exata. Atalhos de teclado `X`/`Y` trocam de modo no campo onde o rato está; clique direito ou Ctrl+clique desfaz o último ponto. **O registo é por parte**: ao iniciar a 2ª parte (ou ao "Recomeçar Jogo"), os campos mostram-se vazios como um novo registo, mas os pontos da 1ª parte não são apagados — voltam a aparecer ao regressar a essa parte. Só afeta esta tab; a convocatória em Jogadores mantém-se para o jogo todo.
  - **Jogador (opcional)**: depois de marcares um ponto, aparece um popup junto ao clique com números de camisola dos jogadores atualmente em campo (titulares que não saíram + suplentes que já entraram — não os 18/20 convocados todos), para dizeres opcionalmente quem fez a ação. O ponto já ficou gravado antes disso, por isso ignorar o popup não trava o ritmo de quem está a apontar ao vivo. Fecha ao tocar num número, ao tocar fora, ou automaticamente no clique seguinte. O que ficar por atribuir corrige-se depois — na própria tabela de registo de cada campo (durante o jogo) ou na secção "Registo de Jogo normalizado" dos Relatórios (depois de terminar).
- **Relatórios**, em dois níveis:
  - Na página de um jogo: estatísticas só dos convocados desse jogo. Quando o jogo termina, aparece também o **Registo de Jogo normalizado**: os pontos da 1ª e 2ª parte juntos, rodados 180º conforme a orientação de ataque de cada parte, para ficarem representados no mesmo sentido de ataque. Cada campo tem um botão para trocar entre a vista de **Pontos** (marcadores individuais) e **Mapa de Calor** (grelha 6×4 sobre o campo, mais intensa onde há mais eventos — pensada para funcionar bem mesmo com poucos pontos por jogo), com um segundo seletor para escolher qual dos dois tipos (ex: "A Favor"/"Contra", "Ganhos"/"Perdas") mostrar de cada vez — misturá-los não faria sentido. A zona de cada ponto (para o mapa de calor) é calculada na base de dados, não no browser, para poder ser consultada diretamente por SQL no futuro. Um botão **"Exportar relatório (PDF)"** abre a vista de impressão do browser (guardar como PDF) já só com a tab Relatórios, mostrando sempre os dois mapas de calor (ex: "Ganhos" e "Perdas") lado a lado por campo, independentemente do que estiver escolhido no ecrã.
  - No dashboard da equipa: totais agregados por jogador (jogos, golos, assistências, cartões) ao longo de **todos** os jogos da equipa.
- **Histórico de ações**: cada clique na convocatória (cartões, assistências, golos, estado, substituição — incluindo quando desligas/subtrais algo) fica registado com data e hora, tal como já acontecia com cada coordenada marcada no Registo de Jogo.
- **Exportação CSV**: descarrega um único ficheiro com todos os dados do jogo atualmente selecionado (jogadores convocados, todos os cliques dos 4 campos, e o histórico de ações com data/hora).
- **Importação de dados locais**: se existirem dados de uma versão anterior (guardados no `localStorage` do browser), a app oferece um botão para os importar como um novo jogo da equipa atual.

## Arquitetura

Site 100% estático (sem servidor próprio), hospedado no GitHub Pages, com [Supabase](https://supabase.com) (Postgres + Auth + Storage) como backend, acedido diretamente do browser via `@supabase/supabase-js` (importado de um CDN, sem build step).

Ver `docs/architecture.md` para o documento técnico completo: mapa de navegação entre páginas, fluxo de autenticação/sessão, estado guardado em `localStorage`, modelo de segurança (RLS) e padrões de código usados em várias páginas.

### Estrutura de pastas

```
index.html              → redireciona para pages/login.html (URL raiz do site)
login.html               → redireciona para pages/login.html (mantém o link antigo)
faltas.html               → redireciona para pages/login.html (link ainda mais antigo)
pages/
  login.html              Página de login e registo de conta (treinador) — jogadores também entram
                           aqui, mas são redirecionados para jogador.html.
  teams.html              Escolher, criar, entrar (por código de convite) ou editar uma equipa.
  dashboard.html          Tabs Jogos / Plantel / Wellness / Relatórios (agregado) de uma equipa.
  match.html              Página de um jogo: Jogadores, Registo de Jogo, Relatórios (só deste jogo).
  jogador.html            Página do jogador (login criado pelo treinador): perfil + questionário
                           de wellness diário — nunca vê o resto da equipa.
js/
  supabase-client.js       Inicializa o cliente Supabase — partilhado por todas as páginas.
  login.js, teams.js, dashboard.js, match.js, jogador.js   Lógica de cada página em pages/.
css/
  styles.css                Estilos partilhados entre todas as páginas.
assets/
  campo.png, campo.jpeg    Imagem do campo de futebol usada nos trackers (campo.png = horizontal).
docs/
  architecture.md            Arquitetura: navegação, sessão, localStorage, modelo de segurança.
  proxima-sessao-notas.txt   Notas informais de continuidade (não é documentação da app).
  Ficha de analise-observação.pdf, coordenadas_X_O.csv   Ficheiros de referência anteriores ao site.
supabase/
  schema.sql                Esquema completo — para configurar um projeto Supabase novo de raiz.
  data-model.md             Logical Data Model: diagrama de entidades/relações + dicionário de dados.
  migrations/               Migrações incrementais, por ordem (001 a 014) — só necessárias em
                             projetos já existentes, correr uma vez cada uma, por esta ordem:
                             001_teams, 002_team_logos, 003_substituicao, 004_amarelo2,
                             005_player_events, 006_partes, 007_orientacao, 008_events_parte,
                             009_events_normalizado, 010_events_minuto, 011_cruzamentos,
                             012_events_player, 013_events_zona, 014_wellness.
scripts/
  seed-demo-match.mjs       Ferramenta de dev: preenche uma equipa + jogo completo com dados
                             realistas para demos rápidas — ver "Ferramentas de desenvolvimento".
  import-plantel.mjs        Ferramenta de dev: cria uma equipa e importa o plantel a partir
                             de um CSV (Nome;Alcunha;Data de Nascimento).
  create-team-logins.mjs    Ferramenta de dev: cria o login de todos os jogadores de uma
                             equipa sem login ainda, e exporta as credenciais para CSV local.
```

Cada página em `pages/` só referencia o seu próprio ficheiro em `js/` (mesmo nome) e o `css/styles.css` partilhado; a navegação entre páginas usa caminhos relativos dentro da própria pasta `pages/`.

### Versão e comentários

Cada ficheiro de código (`.js`, `.html`, `.css`, `supabase/schema.sql` e migrações) tem, no topo, um bloco com uma descrição curta, um número de versão e um histórico de alterações — atualizado manualmente sempre que esse ficheiro é editado de forma significativa. Dentro dos ficheiros maiores, comentários de secção (`// ---------- Nome ----------` em JS, `/* ---------- Nome ---------- */` em CSS) marcam os blocos de funcionalidade.

### Base de dados (Supabase / Postgres)

Ver `supabase/data-model.md` para o Logical Data Model completo (diagrama de entidades/relações + dicionário de dados) — mantém-se atualizado a par de `supabase/schema.sql`.

Todas as tabelas têm Row Level Security baseada em pertença a uma equipa (`team_members`) — só quem for membro de uma equipa vê ou edita os dados dessa equipa:

- **`teams`** — equipas (`nome`, `join_code`, `logo_url`).
- **`team_members`** — quem pertence a que equipa (`role`: `owner` ou `membro`).
- **`players`** — plantel reutilizável de uma equipa (`numero`, `nome`, e opcionalmente `auth_user_id`/`data_nascimento`/`login_email` — login próprio de um jogador, ver Wellness abaixo).
- **`matches`** — jogos de uma equipa (`adversario`, `data`, `parte1_inicio`, `parte1_fim`, `parte2_inicio`, `parte2_fim`, `orientacao_parte1`: `E-D` ou `D-E`).
- **`match_players`** — convocatória e estatísticas de um jogador num jogo específico (`estado`, `amarelo`, `amarelo2`, `vermelho`, `assistencias`, `golo`, `substituicao`: vazio, `Saiu` ou `Entrou`).
- **`events`** — cliques nos 5 campos (`tracker_id`, `parte`: 1 ou 2, `minuto`, `tipo`, `x_pct`, `y_pct`, `player_id`: opcional).
- **`player_events`** — histórico de cada ação clicada na convocatória (`tipo`, `valor`, `created_at`), um registo por clique.
- **`wellness_responses`** — questionário diário de um jogador (`dores_musculares`, `stress`, `fadiga`, `sono`, cada um 0-10), no máximo um por dia (`unique (player_id, data)`); só é escrita via a função `submit_wellness()`.
- **`events_normalizado`** — view sobre `events` que junta a 1ª e 2ª parte, rodando 180º os pontos da parte cuja orientação não é a de referência (`x_pct_normalizado`, `y_pct_normalizado`).

Criar/entrar numa equipa passa por duas funções Postgres (`create_team`, `join_team_by_code`) chamadas via RPC, que tratam a criação da equipa + associação do utilizador de forma atómica. Os emblemas ficam num bucket público do Supabase Storage (`team-logos`), com upload restrito a membros da equipa correspondente. Um jogador com login próprio (`players.auth_user_id`) não é `team_member`, mas ganha policies próprias para ver/editar só a sua linha em `players` e as próprias respostas em `wellness_responses` — ver `docs/architecture.md`.

Ver `supabase/schema.sql` para a definição completa.

## Configurar um novo ambiente Supabase (do zero)

1. Criar conta e projeto grátis em [supabase.com](https://supabase.com).
2. **SQL Editor** → colar e correr o conteúdo de `supabase/schema.sql`.
3. **Authentication → Providers → Email** → confirmar que o provider está ativo e que "Allow new users to sign up" está ligado.
4. **Authentication → Providers → Email** → desligar "Confirm email" (evita depender de emails de confirmação).
5. **Settings → API** → copiar o *Project URL* e a *anon public key* e colar em `js/supabase-client.js` (a anon key é pública por definição — a segurança vem das políticas RLS, não de a esconder).

## Desenvolvimento local

Como a app faz pedidos `fetch` ao Supabase, precisa de ser servida por `http://`, não aberta diretamente como `file://` (o browser bloqueia esses pedidos por CORS). Para testar localmente:

```bash
python3 -m http.server 8765
```

e abrir `http://localhost:8765/` (redireciona para `pages/login.html`).

## Ferramentas de desenvolvimento

`scripts/seed-demo-match.mjs` preenche rapidamente uma equipa nova com dados realistas para
demos ou testes — 25 jogadores, um jogo já terminado com 11 titulares + 8 suplentes, cartões
amarelos/vermelho, 2 golos com assistência, e os 5 campos do Registo de Jogo com pontos
tacticamente plausíveis (cantos junto à bandeirola, remates perto da baliza, cruzamentos nas
zonas laterais — sempre a respeitar a orientação de ataque de cada parte). Fala diretamente
com a REST API do Supabase via `fetch` nativo do Node, sem nenhuma dependência nova:

```bash
node scripts/seed-demo-match.mjs <email> <password>
```

Usa uma conta já existente na app (ex: a conta de teste); a palavra-passe também pode vir das
variáveis de ambiente `SEED_EMAIL`/`SEED_PASSWORD`, para não ficar no histórico do terminal.

`scripts/import-plantel.mjs` cria uma equipa nova e importa o plantel a partir de um CSV com as
colunas `Nome;Alcunha;Data de Nascimento` (datas em dd-mm-aaaa) — mesmo padrão de ligação à REST
API do Supabase do script acima, sem dependências novas. A alcunha fica guardada como
`"Nome (Alcunha)"` (não há coluna própria para ela), editável depois na tab Plantel:

```bash
node scripts/import-plantel.mjs <email> <password> [caminho-do-csv] [nome-da-equipa]
```

`scripts/create-team-logins.mjs` cria o login de todos os jogadores de uma equipa que ainda não
têm um (o mesmo que o botão "Criar login" da tab Plantel, um a um) e exporta um CSV local com
Nome/Utilizador/Password — o único momento em que a password ainda é conhecida em texto simples
(o Supabase nunca a guarda de forma recuperável). Só processa jogadores sem login, por isso é
seguro correr outra vez mais tarde (ex: depois de esbarrar no limite de emails do Supabase — ver
"Configurar um novo ambiente Supabase" acima sobre desligar "Confirm email"):

```bash
node scripts/create-team-logins.mjs <email> <password> <join_code> [ficheiro-csv-de-saida]
```

O CSV gerado (`credenciais-*.csv`) fica só local — está no `.gitignore`, nunca é comitado.

## Publicação

O deploy é automático via GitHub Pages sempre que há um `git push` para o branch `main`:

```bash
git add -A
git commit -m "descrição da alteração"
git push
```

Fica disponível em `https://joaoaraujo144-star.github.io/analise_tatica_jogo/` cerca de 1 minuto depois.
