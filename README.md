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
- **Wellness**: tab no dashboard da equipa com a resposta de hoje de cada jogador — dores musculares, stress, fadiga e sono (0-10, com cor verde/amarelo/vermelho consoante o nível), mais o peso em kg (**opcional**, sem cor), ou ❌ se ainda não respondeu — e a **média do dia por métrica** (só sobre quem já respondeu). Cada jogador só pode responder uma vez por dia, na própria conta; ao entrar, vai logo para o questionário do dia (ou para o resumo, se já tiver respondido). O **peso é o único campo editável depois de enviado** — pode atualizá-lo quantas vezes quiser durante o dia (ex: antes/depois do treino), diretamente no resumo.
  - **Dia de treino**: no topo da tab, um interruptor "Hoje é dia de treino" — quando ligado, aparece um campo para a **duração do treino em minutos**. É uma propriedade do dia (por equipa), não de um jogador em concreto.
  - **Carga** (coluna calculada, tabela Wellness): RPE × duração do treino em minutos — só aparece quando as duas estão preenchidas; não é gravada em lado nenhum, é sempre recalculada.
  - **RPE (1-10)**: coluna extra na mesma tabela, preenchida diretamente pelo treinador (input sempre visível, sem confirmação à parte) — ao contrário dos outros campos, **nunca é visível para o jogador**, nem sequer nos dados que chegam ao seu browser (vive numa tabela própria, sem nenhuma política de acesso para ele).
  - **Exportar para Excel**: dois botões, "Exportar diário" (respostas + médias de hoje) e "Exportar semanal" (uma linha por jogador/dia da semana civil atual — segunda a domingo — mais uma folha só com as médias diárias da equipa) — ambos incluem o RPE.
  - **Página por jogador** (botão "Ver" na tabela): 6 gráficos de evolução, um por métrica (Dores/Stress/Fadiga/Sono 0-10, Peso e RPE à parte por terem escalas/preenchimento diferentes), com toggle Semana/Mês/Total (janela deslizante — últimos 7/30 dias, ou tudo), e a tabela de respostas diárias por baixo — onde o treinador pode **corrigir um dia** (ex: o jogador enganou-se a preencher), **criar um dia esquecido**, e preencher o **RPE** desse dia. Dois botões de exportação: "Exportar gráficos (PDF)" (impressão do browser, só os gráficos) e "Exportar tabela (Excel)".
- **Jogos**: dentro de uma equipa, cria e guarda um histórico de jogos (adversário + data). Abrir um jogo leva à sua própria página, com três tabs só disponíveis aí (Jogadores, Registo de Jogo, Relatórios) e um botão "Trocar de jogo" para voltar à lista.
  - **Pré-época**: um checkbox opcional ao criar o jogo, também alternável depois diretamente na listagem. Um jogo de pré-época mantém-se totalmente acessível e intacto (dados, convocatória, Registo de Jogo, relatório próprio), mas fica de fora do agregado da tab Relatórios do dashboard — para não misturar estatísticas de particulares de pré-época com as da época.
- **Cronómetro do jogo**: botões "Iniciar 1ª Parte", "Finalizar Parte" e "Iniciar 2ª Parte" (cada um grava a hora exata), um indicador visual (slide) da parte atual, um temporizador grande em minutos:segundos que conta a partir do início da parte em curso (na 2ª parte, o número mostrado começa em **45:00**, como um relógio de jogo normal — só no ecrã, o minuto gravado em cada evento/golo continua a contar a partir de 0 nessa parte, para o CSV e a base de dados não mudarem), e "Recomeçar Jogo" para limpar o cronómetro sem apagar dados. Por cima do temporizador, o **resultado** (nome da equipa e do adversário com o número de golos marcados/sofridos) — calculado sempre a partir de `goals`, atualiza-se sozinho ao marcar, sofrer ou remover um golo. Quando a 2ª parte termina, a tab Registo de Jogo desaparece (troca automaticamente para Relatórios se estiver aberta) e a tab Jogadores fica bloqueada, só de leitura.
- **Edição só com o jogo a decorrer**: enquanto nenhuma parte está em curso (antes de começar, no intervalo, ou depois de terminar uma parte), só é possível convocar/remover jogadores e mudar o Estado (Titular/Suplente) na tab Jogadores; cartões, assistências, golos, substituição e os cliques no Registo de Jogo ficam bloqueados até haver uma parte a decorrer.
- **Orientação do campo**: uma seta clicável define a direção de ataque da equipa na 1ª parte; fica bloqueada assim que "Iniciar 1ª Parte" é premido e inverte automaticamente ao iniciar a 2ª parte. Fica guardada na base de dados (`matches.orientacao_parte1`).
- **Jogadores** (dentro de um jogo): *Convocatória* — escolhe jogadores do plantel para o jogo atual, define Titular/Suplente, e regista por jogador: 2 cartões amarelos, cartão vermelho, assistências, golos e substituição (tudo clicável diretamente na tabela). Marcar os 2 cartões amarelos marca automaticamente o vermelho. O badge de substituição adapta-se ao Estado: um Titular só alterna entre `—` e `Saiu`; um Suplente só entre `—` e `Entrou`. Ao marcar um titular como "Saiu", abre logo um popup com os suplentes ainda no banco para escolheres rapidamente quem entra — sem teres de procurar a linha dele na tabela à parte. Uma coluna **"Em Campo"** (só informativa, calculada a partir do Estado e da Substituição — "Em campo" ou "Banco") mostra de imediato quem está mesmo a jogar naquele momento, sem cruzares as outras duas colunas de cabeça.
  - **Golos ligados a eventos**: clicar no ⚽ de um jogador abre um popup para (opcionalmente) escolher quais eventos recentes do Registo de Jogo deram origem ao golo — ex: um cruzamento e o remate que resultou em golo. Cada golo é o seu próprio registo (não só um número), visível na secção **"Golos do jogo"** logo abaixo da convocatória, com a cadeia de eventos e um botão para editar depois quais eventos estão ligados. Os eventos já ligados a um golo ficam destacados a dourado — tanto no próprio ponto desenhado no campo (anel dourado à volta, mantendo a cor A Favor/Contra) como na linha do log — em qualquer campo do Registo de Jogo, ao vivo ou no Registo de Jogo normalizado dos Relatórios (pós-jogo). Clique direito ou Ctrl+clique no ⚽ remove o golo mais recente desse jogador.
  - **Golos sofridos**: secção própria, "Golos sofridos", com um botão **"+ Golo sofrido"** — mesma lógica de ligação a eventos, mas sem "marcador" (a app não tem lista de jogadores do adversário). Cada golo sofrido é só o minuto + os eventos que mostram como aconteceu (ex: uma falta cometida perto da área que deu num livre perigoso, ou um remate sofrido). "Editar eventos" e "Remover" ficam diretamente no cartão, já que não há linha de convocado onde fazer clique direito.
- **Registo de Jogo**: 5 campos de futebol clicáveis, por esta ordem — Faltas (Realizadas/Sofridas), Perdas de Bola (Ganhos/Perdas), Remates (A Favor/Contra), Cruzamentos (A Favor/Contra) e Cantos (A Favor/Contra) — cada clique marca um ponto no campo com o tipo selecionado, com o minuto do jogo (relativo ao início da parte em curso) e a hora exata. Atalhos de teclado `X`/`Y` trocam de modo no campo onde o rato está; clique direito ou Ctrl+clique desfaz o último ponto. **O registo é por parte**: ao iniciar a 2ª parte (ou ao "Recomeçar Jogo"), os campos mostram-se vazios como um novo registo, mas os pontos da 1ª parte não são apagados — voltam a aparecer ao regressar a essa parte. Só afeta esta tab; a convocatória em Jogadores mantém-se para o jogo todo.
  - **Jogador (opcional)**: depois de marcares um ponto, aparece um popup junto ao clique com números de camisola dos jogadores atualmente em campo (titulares que não saíram + suplentes que já entraram — não os 18/20 convocados todos), para dizeres opcionalmente quem fez a ação. O ponto já ficou gravado antes disso, por isso ignorar o popup não trava o ritmo de quem está a apontar ao vivo. Fecha ao tocar num número, ao tocar fora, ou automaticamente no clique seguinte. O que ficar por atribuir corrige-se depois — na própria tabela de registo de cada campo (durante o jogo) ou na secção "Registo de Jogo normalizado" dos Relatórios (depois de terminar).
- **Relatórios**, em dois níveis:
  - Na página de um jogo: estatísticas só dos convocados desse jogo. Quando o jogo termina, aparece também o **Registo de Jogo normalizado**: os pontos da 1ª e 2ª parte juntos, rodados 180º conforme a orientação de ataque de cada parte, para ficarem representados no mesmo sentido de ataque. Cada campo tem um botão para trocar entre a vista de **Pontos** (marcadores individuais) e **Mapa de Calor** (grelha 6×4 sobre o campo, mais intensa onde há mais eventos — pensada para funcionar bem mesmo com poucos pontos por jogo), com um segundo seletor para escolher qual dos dois tipos (ex: "A Favor"/"Contra", "Ganhos"/"Perdas") mostrar de cada vez — misturá-los não faria sentido. A zona de cada ponto (para o mapa de calor) é calculada na base de dados, não no browser, para poder ser consultada diretamente por SQL no futuro. Um botão **"Exportar relatório (PDF)"** abre a vista de impressão do browser (guardar como PDF) já só com a tab Relatórios, mostrando sempre os dois mapas de calor (ex: "Ganhos" e "Perdas") lado a lado por campo, independentemente do que estiver escolhido no ecrã.
  - No dashboard da equipa: totais agregados por jogador (jogos, golos, assistências, cartões) ao longo de **todos** os jogos da equipa, exceto os marcados como **Pré-época**.
  - **Dois relatórios gerados** (botões "Ver Relatório Geral" / "Ver Transições e Cruzamentos" na tab Relatórios de um jogo): domínio por métrica, evolução por parte e por momento, distribuição por zona do campo (grelha 4×3), resumo por bloco de 15 min e por jogador (Relatório Geral); funis de transição defensiva/ofensiva, remates provenientes de cruzamento, e faltas provocadas por perda/ganho de bola com a zona onde caíram (Transições) — mais uma análise em prosa por botão ("Gerar análise"), escrita pela API da Claude a partir dos números já calculados no browser (nunca dados em bruto) através de uma Edge Function do Supabase, e guardada em cache (`report_insights`) para não voltar a chamar a API sempre que o relatório é reaberto. Ver "Relatórios gerados por IA" abaixo para configurar.
- **Histórico de ações**: cada clique na convocatória (cartões, assistências, golos, estado, substituição — incluindo quando desligas/subtrais algo) fica registado com data e hora, tal como já acontecia com cada coordenada marcada no Registo de Jogo.
- **Exportação CSV**: descarrega um único ficheiro com todos os dados do jogo atualmente selecionado — jogadores convocados, os golos marcados e sofridos (minuto, marcador quando há, e a cadeia de eventos que lhes deu origem), todos os cliques dos 5 campos (cada um com uma coluna "Golo", a indicar a que golo esse clique está ligado, se estiver), e o histórico de ações com data/hora.
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
  relatorio.html          Relatório geral de um jogo (domínio, evolução, zonas, por jogador) +
                           análise em prosa gerada por IA — aberto a partir da tab Relatórios.
  transicoes.html         Transições rápidas, remates de cruzamento e faltas provocadas por
                           perda/ganho de bola (com zona do campo) + análise gerada por IA —
                           aberto a partir da tab Relatórios.
  jogador.html            Página do jogador (login criado pelo treinador): questionário de
                           wellness diário — nunca vê o resto da equipa.
  wellness-jogador.html   Página do treinador: evolução do wellness de um jogador (gráficos
                           Chart.js) e edição de um dia — aberta a partir da tab Wellness.
  calendario-jogos.html   Calendário do campeonato (Zona Norte), com links de Vídeo/ZeroZero
                           por jogo — página à parte, sem login, protegida por código de
                           acesso; não aparece em nenhuma navegação da app.
  trial.html              Entrada do modo de teste público — em vez de conta, pede um
                           código e cria uma equipa de teste (1 jogo, expira em 10 dias)
                           via login anónimo do Supabase; a partir daí usa dashboard.html/
                           match.html normalmente.
  trial-admin.html        Painel só para o treinador (código próprio, diferente dos dados
                           ao público) para criar/bloquear códigos de teste e ver as
                           equipas de teste ativas com os dias até expirarem.
js/
  supabase-client.js       Inicializa o cliente Supabase — partilhado por todas as páginas.
  login.js, teams.js, dashboard.js, match.js, jogador.js, wellness-jogador.js
                            Lógica de cada página em pages/.
  relatorio-dados.js       Agregação partilhada por relatorio.js/transicoes.js (domínio, timeline,
                            zonas, transições, remates de cruzamento, faltas provocadas) — única
                            exceção à regra "cada página duplica os seus helpers pequenos", por
                            ser lógica grande e igual nas duas páginas.
  relatorio.js, transicoes.js
                            Lógica de pages/relatorio.html e pages/transicoes.html.
  calendario-jogos.js       Lógica de pages/calendario-jogos.html — valida o código de
                            acesso via RPC em vez de Supabase Auth.
  trial.js                  Lógica de pages/trial.html — signInAnonymously() + start_trial(),
                            depois abre a equipa de teste como teams.js abre uma equipa normal.
  trial-admin.js            Lógica de pages/trial-admin.html — valida o código de admin via
                            RPC (admin_*) em vez de Supabase Auth.
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
  migrations/               Migrações incrementais, por ordem (001 a 023) — só necessárias em
                             projetos já existentes, correr uma vez cada uma, por esta ordem:
                             001_teams, 002_team_logos, 003_substituicao, 004_amarelo2,
                             005_player_events, 006_partes, 007_orientacao, 008_events_parte,
                             009_events_normalizado, 010_events_minuto, 011_cruzamentos,
                             012_events_player, 013_events_zona, 014_wellness, 015_wellness_peso,
                             016_wellness_peso_editavel, 017_wellness_coach_update,
                             018_wellness_coach_insert, 019_match_players_numero,
                             020_wellness_rpe, 021_goals, 022_events_normalizado_goal,
                             023_goals_sofridos, 024_training_days, 025_report_insights,
                             026_matches_pre_epoca, 027_competition_calendar,
                             028_competition_video_links, 029_trial_mode,
                             030_trial_resume, 031_trial_admin, 032_trial_admin_delete,
                             033_trial_one_team_per_code.
  functions/
    gerar-insights/index.ts  Edge Function (Deno): gera a análise em prosa dos relatórios
                              Geral/Transições via API da Claude — ver "Relatórios gerados
                              por IA" abaixo. Primeira peça server-side deste projeto.
scripts/
  seed-demo-match.mjs       Ferramenta de dev: preenche uma equipa + jogo completo com dados
                             realistas para demos rápidas — ver "Ferramentas de desenvolvimento".
  import-plantel.mjs        Ferramenta de dev: cria uma equipa e importa o plantel a partir
                             de um CSV (Nome;Alcunha;Data de Nascimento).
  create-team-logins.mjs    Ferramenta de dev: cria o login de todos os jogadores de uma
                             equipa sem login ainda, e exporta as credenciais para CSV local.
  seed-wellness.mjs         Ferramenta de dev: gera vários dias de wellness de teste para
                             um jogador (equipa/jogador encontrados por nome).
  fix-orientacao.sql        Ferramenta de dev: corrige o sentido de ataque de uma só
                             parte de um jogo já jogado, sem trocar de lado a outra.
  fix-marcador-golo.sql     Ferramenta de dev: corrige o marcador de um golo já
                             registado (goals.player_id + contador em match_players).
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
- **`match_players`** — convocatória e estatísticas de um jogador num jogo específico (`numero`: opcional, sobrepõe-se ao número de `players` só nesse jogo; `estado`, `amarelo`, `amarelo2`, `vermelho`, `assistencias`, `golo`, `substituicao`: vazio, `Saiu` ou `Entrou`).
- **`events`** — cliques nos 5 campos (`tracker_id`, `parte`: 1 ou 2, `minuto`, `tipo`, `x_pct`, `y_pct`, `player_id`: opcional, `goal_id`: opcional — liga o evento a um golo, ver `goals`).
- **`goals`** — um registo por golo (não só o número em `match_players.golo`), com `tipo` (`marcado` ou `sofrido`), `player_id` (marcador — vazio nos sofridos, a app não tem lista de jogadores do adversário), `parte`, `minuto`. Um evento só pode contribuir para um golo, por isso a ligação é uma FK direta em `events.goal_id`, não uma tabela de junção.
- **`player_events`** — histórico de cada ação clicada na convocatória (`tipo`, `valor`, `created_at`), um registo por clique.
- **`wellness_responses`** — questionário diário de um jogador (`dores_musculares`, `stress`, `fadiga`, `sono`, cada um 0-10), no máximo um por dia (`unique (player_id, data)`); só é escrita via a função `submit_wellness()`.
- **`wellness_rpe`** — RPE (1-10, perceção de esforço) de um dia, preenchido só pelo treinador. Tabela própria, separada de `wellness_responses` de propósito: a RLS é por linha, não por coluna, por isso uma coluna `rpe` na tabela que o jogador já lê ficaria visível a ele também — como tabela à parte, sem nenhuma policy para o jogador, fica inacessível a nível de base de dados, não só escondida na interface.
- **`training_days`** — flag "dia de treino" (`treino`) + `duracao_minutos`, por equipa por dia (`unique (team_id, data)`) — sem `player_id`, é uma propriedade do dia, não de um jogador.
- **`report_insights`** — cache da análise em prosa dos relatórios Geral/Transições, gerada pela Edge Function `gerar-insights` (`conteudo` jsonb, um registo por `match_id`+`tipo`) — ver "Relatórios gerados por IA" abaixo.
- **`events_normalizado`** — view sobre `events` que junta a 1ª e 2ª parte, rodando 180º os pontos da parte cuja orientação não é a de referência (`x_pct_normalizado`, `y_pct_normalizado`).
- **`competition_matches`**/**`competition_access`**/**`competition_match_videos`** — calendário do campeonato usado só por `pages/calendario-jogos.html` (ver secção própria abaixo). Sem `team_id`/`user_id`, e sem **nenhuma** policy de RLS (ao contrário de todas as tabelas acima) — só acessíveis via funções `security definer` que validam um código, não pertença a uma equipa. Um jogo pode ter vários links de vídeo (`competition_match_videos`, um registo por link) e um único link de ZeroZero (`competition_matches.zerozero_url`).

Criar/entrar numa equipa passa por duas funções Postgres (`create_team`, `join_team_by_code`) chamadas via RPC, que tratam a criação da equipa + associação do utilizador de forma atómica. Os emblemas ficam num bucket público do Supabase Storage (`team-logos`), com upload restrito a membros da equipa correspondente. Um jogador com login próprio (`players.auth_user_id`) não é `team_member`, mas ganha policies próprias para ver/editar só a sua linha em `players` e as próprias respostas em `wellness_responses` — nunca em `wellness_rpe` — ver `docs/architecture.md`.

Ver `supabase/schema.sql` para a definição completa.

## Configurar um novo ambiente Supabase (do zero)

1. Criar conta e projeto grátis em [supabase.com](https://supabase.com).
2. **SQL Editor** → colar e correr o conteúdo de `supabase/schema.sql`.
3. **Authentication → Providers → Email** → confirmar que o provider está ativo e que "Allow new users to sign up" está ligado.
4. **Authentication → Providers → Email** → desligar "Confirm email" (evita depender de emails de confirmação).
5. **Settings → API** → copiar o *Project URL* e a *anon public key* e colar em `js/supabase-client.js` (a anon key é pública por definição — a segurança vem das políticas RLS, não de a esconder).

## Calendário do campeonato (página sem login)

`pages/calendario-jogos.html` é uma página independente do resto da app — não está
associada a nenhuma equipa, jogador ou treinador com conta, não aparece em nenhum menu
ou navegação, e não usa Supabase Auth. Mostra **uma jornada de cada vez** (por omissão,
a mais próxima da data atual) do campeonato (Zona Norte, Campeonato Distrital 1.ª
Divisão 2026/2027), com setas ‹ › e um seletor para mudar de jornada. Cada jogo tem um
botão para abrir um popup e adicionar/remover **links de vídeo** (podem ser vários por
jogo — ex: câmaras diferentes) e outro para o link do **ZeroZero** (só um por jogo);
cada link já guardado tem o seu próprio botão para abrir diretamente numa nova aba.

Em vez de conta, o acesso é feito por um **código partilhado** (guardado no browser
depois de introduzido uma vez, para não ter de o repetir a cada visita). Do lado da
base de dados, `competition_matches`/`competition_access`/`competition_match_videos` têm
RLS ativa sem nenhuma policy — ninguém lhes acede diretamente, nem autenticado; todo o
acesso passa por funções `security definer` (`competition_list_matches`,
`competition_list_videos`, `competition_add_video_link`,
`competition_delete_video_link`, `competition_set_zerozero_link`) que só devolvem ou
alteram dados depois de validar o código (hash bcrypt, `crypt()` do `pgcrypto`) — ver
`supabase/migrations/027_competition_calendar.sql`/`028_competition_video_links.sql` e
"Acesso por código (sem login)" em `docs/architecture.md`.

**Depois de correr a migração 027, troca imediatamente o código de exemplo**
(`MUDA-ISTO`) no SQL Editor do Supabase:

```sql
update competition_access
  set code_hash = crypt('O_TEU_CODIGO_AQUI', gen_salt('bf'))
  where id = 1;
```

## Modo de teste público (1 jogo, 10 dias)

`pages/trial.html` (ver `docs/architecture.md` § "Modo de teste público") deixa
alguém experimentar a app sem conta: entra com um **código de acesso** (podes ter vários
códigos ativos ao mesmo tempo, ex: um por clube/pessoa — ver `trial_codes` em
`supabase/data-model.md`), o browser faz login anónimo do Supabase
(`supabase.auth.signInAnonymously()`) e `start_trial()` dá-lhe acesso à **equipa fixa**
desse código — cria-a na 1ª vez que o código é usado; a partir daí, entrar com o mesmo
código, de qualquer dispositivo, leva sempre à mesma equipa (útil, por ex., para vários
membros de um clube experimentarem juntos a mesma equipa de teste). `dashboard.html`/
`match.html` funcionam sem nenhuma alteração, com dois limites reforçados na base de
dados: **só 1 jogo** (trigger em `matches`) e **10 dias** (depois disso, um job `pg_cron`
diário apaga a equipa e tudo o que lhe pertence, em cascata).

Configurar (uma vez por projeto):

1. **Authentication → Sign In / Providers → Anonymous Sign-Ins** → ligar (vem desligado
   por omissão; sem isto `signInAnonymously()` falha).
2. Correr `supabase/migrations/029_trial_mode.sql`, `030_trial_resume.sql`,
   `031_trial_admin.sql`, `032_trial_admin_delete.sql` e
   `033_trial_one_team_per_code.sql` no SQL Editor, por esta ordem.
3. **Criar pelo menos um código** — mais fácil pelo painel `pages/trial-admin.html` (ver
   secção própria abaixo) do que por SQL direto.
4. **Reimplantar a Edge Function** (só se já a tinhas implantado antes desta versão —
   ver "Relatórios gerados por IA" abaixo): `supabase functions deploy gerar-insights`.
   Sem isto, o bloqueio da IA para contas de teste não entra em vigor (o resto do modo
   de teste não depende da Edge Function e funciona sem este passo).

Numa equipa de teste, a tab Wellness e "Criar login" (Plantel) ficam escondidas, e o botão
"Gerar análise" (relatórios com IA) fica escondido — a própria Edge Function
`gerar-insights` recusa (403) qualquer pedido de uma conta anónima (todas as contas do
modo de teste são anónimas por construção), para nunca chamar (e pagar) a API da Claude a
partir de uma equipa de teste.

## Painel de administração do teste

`pages/trial-admin.html` é só para ti — nunca partilhes o link nem o código com quem vai
experimentar a app. Deixa: criar um código novo (com uma nota tua e um **limite de usos**
opcional — quantos *dispositivos/pessoas diferentes* se podem juntar, todos à **mesma**
equipa, através desse código; não tem nada a ver com dias), bloquear/reativar um código já
criado sem o apagar (mantém o histórico de quem o usou), ver as equipas de teste ativas —
de que código vieram, quantos jogos já têm, e quantos dias faltam para expirarem sozinhas
(10 dias por equipa, sempre, fixo) — e **apagar uma equipa de teste na hora**, sem esperar
pelos 10 dias (o código volta a ficar "por estrear": a próxima vez que for usado cria uma
equipa nova).

Protegido por um **código próprio**, diferente dos códigos que dás ao público
(`trial_codes`) — não vem nenhum por omissão, define-se depois de correr a migração 031:

```sql
insert into admin_access (id, code_hash) values (1, crypt('O_TEU_CODIGO_AQUI', gen_salt('bf')))
  on conflict (id) do update set code_hash = excluded.code_hash;
```

## Relatórios gerados por IA (Edge Function)

Os botões "Gerar análise" em `pages/relatorio.html`/`pages/transicoes.html` chamam a
API da Claude para escrever a análise em prosa a partir dos números já calculados no
browser. Como o site é 100% estático (sem backend próprio — ver `docs/architecture.md`),
essa chamada não pode sair diretamente do browser (exporia a chave da API a qualquer
visitante) — passa por uma **Supabase Edge Function**
(`supabase/functions/gerar-insights/index.ts`), a única peça deste projeto que corre no
servidor e guarda um segredo verdadeiro.

Configurar (uma vez por projeto Supabase, precisa do [Supabase CLI](https://supabase.com/docs/guides/cli) instalado e autenticado — `supabase login`):

```bash
supabase link --project-ref <ref-do-teu-projeto>   # Settings → General → Reference ID
supabase functions deploy gerar-insights
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # chave da tua conta Anthropic
```

Sem isto configurado, os dois botões "Gerar análise" mostram um erro (`ANTHROPIC_API_KEY
não configurada`) mas o resto de cada relatório (gráficos, zonas, tabelas) funciona à
mesma — a função só serve a secção de insights. A verificação de sessão (só um
utilizador já autenticado na app consegue chamar a função) é feita automaticamente pelo
Supabase antes do pedido lá chegar, sem código extra.

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

`scripts/seed-wellness.mjs` gera vários dias de respostas de wellness de teste para um jogador
(encontra a equipa e o jogador por nome aproximado, `ilike`) — útil para testar os gráficos de
`pages/wellness-jogador.html` sem esperar dias reais. Precisa da policy
`wellness_team_member_insert` (migração 018):

```bash
node scripts/seed-wellness.mjs <email> <password> <nome-da-equipa> <nome-do-jogador> [dias]
```

`scripts/fix-orientacao.sql` corrige o sentido de ataque de **uma só parte** de um jogo já jogado
— para o caso em que as duas equipas não trocaram de lado ao intervalo (as duas partes atacam no
mesmo sentido real, mas só uma ficou registada ao contrário). O botão de orientação na app
(`js/match.js`, `wireOrientacao`) fica permanentemente bloqueado assim que o jogo arranca
(`parte1_inicio` definido). Corre-se diretamente no **SQL Editor do Supabase**, sem precisar de
login/password da app: um select para encontrar o id do jogo pelo nome do adversário, e um update
que roda 180º (`100 - x_pct`, `100 - y_pct`) as coordenadas em bruto só dos eventos da parte
errada, sem tocar em `orientacao_parte1` nem na outra parte — porque esse campo assume sempre que
a 2ª parte ataca no sentido oposto da 1ª (troca de lado normal), e trocá-lo estragaria a parte que
já estava certa.

`scripts/fix-marcador-golo.sql` corrige o marcador de um golo já registado (ex: atribuído ao
jogador errado ao clicar). Um golo é o seu próprio registo em `goals` (`player_id`), não só um
número em `match_players.golo` — por isso corrigir só a primeira tabela não chega: o contador em
`match_players` (usado na convocatória, no plantel e nos exports CSV) também tem de ser ajustado,
um a menos no jogador errado e um a mais no certo. Corre-se no SQL Editor do Supabase: selects para
encontrar o `goal_id` e o id do jogador certo, um update a `goals.player_id`, e dois updates a
`match_players.golo`.

## Publicação

O deploy é automático via GitHub Pages sempre que há um `git push` para o branch `main`:

```bash
git add -A
git commit -m "descrição da alteração"
git push
```

Fica disponível em `https://joaoaraujo144-star.github.io/analise_tatica_jogo/` cerca de 1 minuto depois.
