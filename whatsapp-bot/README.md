# Bot de WhatsApp — resumo do Wellness no grupo da equipa

Nas horas configuradas em `HORAS_ENVIO` (por omissão **10:00,12:30**, hora
de Lisboa), posta no grupo de WhatsApp da equipa uma mensagem tipo "Bom
dia, 9 de 21 jogador(es) já responderam ao Wellness de hoje."

**Importante — lê antes de instalar:** isto **não** é a API oficial do
WhatsApp Business — liga-se a uma sessão pessoal de WhatsApp (como o
WhatsApp Web) via [Baileys](https://github.com/WhiskeySockets/Baileys),
porque a API oficial não permite publicar em grupos, só conversas 1-para-1
(ver `docs/architecture.md`/histórico de decisão). Isto **viola os Termos
de Serviço do WhatsApp** — o risco de o número usado ser bloqueado é baixo
para um volume de poucas mensagens/dia, mas é real. Recomenda-se usar um
número secundário (não o teu principal) se tiveres um disponível. Corre só
localmente, sempre neste Mac — não faz parte do site nem do deploy.

**Fiabilidade do envio:** uma rede instável pode deixar tanto a ligação ao
WhatsApp como os pedidos ao Supabase (a contagem de quem já respondeu)
pendurados para sempre, sem erro nenhum a aparecer no log — foi o que
aconteceu aos envios das 12h de 2026-10-11 (WhatsApp) e das 10h de
2026-10-23 (Supabase). Por isso cada passo (WhatsApp e Supabase) tem
agora o seu próprio limite de 20s, e o envio de cada hora agendada tenta
outra vez 30s depois se falhar à 1ª. Se mesmo assim falhar (2 tentativas),
fica um erro bem visível em `bot.error.log` — vale a pena espreitar esse
ficheiro de vez em quando.

Mesmo assim, o envio de 2026-10-25 falhou sem nenhum erro registado —
confirmado ao vivo no dia seguinte: o processo ficava a **0% CPU** (não
preso num ciclo, bloqueado à espera de algo que nunca mais vinha) sempre a
coincidir com rajadas de "failed to decrypt message". Causa mais provável:
o bot, por estar ligado como dispositivo do WhatsApp pessoal do
treinador, tinha de processar/desencriptar **toda** a atividade normal
dessa conta (outros chats, outros grupos), não só o grupo da equipa — o
suficiente para por vezes monopolizar o processo na hora errada. Como o
bot só precisa de **enviar**, nunca de ler nada, `shouldIgnoreJid`
(Baileys) faz-o ignorar completamente tudo o que não seja o grupo da
equipa, sem gastar tempo nenhum a desencriptar o resto. `bot.log` também
ganhou um "A tentar enviar..." no início de cada tentativa e um heartbeat
a cada 10 min, para qualquer falha futura deixar mais pistas.

Ainda assim, o envio de 2026-10-28 voltou a falhar — desta vez sem
nenhuma rajada de "failed to decrypt" (a correção acima resultou para
essa causa), mas com **10 quedas/reconexões seguidas em 2h20**, muito
mais severo que das vezes anteriores. Em vez de continuar a perseguir
causas uma a uma, há uma **rede de segurança** independente da causa
exata: o agendamento tenta enviar até **15 min depois** da hora exata
(não só no minuto certo), e um **watchdog** à parte (`watchdog.sh`, via
`com.analisejogo.wellness-lembrete-watchdog.plist`) mata o processo
principal se `bot.log` ficar sem atualizações por muito tempo — o
`launchd` do processo principal reinicia-o sozinho a seguir.

A causa real acabou por ser outra: o Mac estava a adormecer/fazer Power
Nap periodicamente (`pmset -g` mostrava `powernap 1`) — cada vez que
acordava, o Wi-Fi tinha de se reassociar, derrubando a ligação; e durante
o sono em si, nada corre, nem o próprio relógio do bot, o que explicava
os silêncios "impossíveis" no log. Corrigido com
`sudo pmset -c sleep 0 && sudo pmset -c powernap 0` (o Mac está sempre à
corrente, por isso `-c` chega).

Ironia: logo depois dessa correção, o próprio **watchdog** causou 3
envios da mesma hora no mesmo dia (2026-10-29) — o seu limite (4 min) era
mais curto do que o heartbeat do bot (10 min), por isso matava sempre um
processo perfeitamente saudável antes do heartbeat seguinte conseguir
provar que estava vivo, a cada ~6 min, a noite toda; e cada reinício
esquecia-se (só em memória) de que já tinha enviado hoje. Corrigido: o
heartbeat passa a 3 em 3 min, o limite do watchdog sobe para 10 min (bem
acima), e "já enviei hoje" passa a ficar gravado em `estado.json`, não só
em memória — um reinício dentro da janela de tolerância deixa de poder
duplicar o envio, seja qual for a causa.

## Configurar (uma vez)

1. **Instalar dependências:**
   ```bash
   cd whatsapp-bot
   npm install
   ```

2. **Criar o `.env`** (pode ficar vazio por agora, só precisa de existir):
   ```bash
   cp .env.example .env
   ```

3. **1º login no WhatsApp** (mostra um QR code no terminal):
   ```bash
   node --env-file=.env index.mjs
   ```
   Lê o QR code com o WhatsApp do número que vais usar (**Definições →
   Dispositivos ligados → Ligar dispositivo**). A sessão fica guardada em
   `whatsapp-bot/auth/` (nunca comitada, está no `.gitignore`). Depois de
   ligar, o script vai dizer que faltam variáveis no `.env` e sair — é
   normal, ainda não as preenchemos.

4. **Descobrir o JID do grupo da equipa** (reaproveita a sessão já ligada):
   ```bash
   npm run list-groups
   ```
   Copia o `JID` (algo como `123456789012345678@g.us`) do grupo certo.

5. **Preencher o `.env`:**
   - `SUPABASE_EMAIL`/`SUPABASE_PASSWORD` — uma conta já existente na app,
     membro da equipa (treinador ou adjunto).
   - `TEAM_ID` — o id da equipa (`select id, nome from teams;` no SQL
     Editor do Supabase, ou o UUID no URL do dashboard).
   - `WHATSAPP_GROUP_JID` — o JID copiado no passo 4.
   - `HORAS_ENVIO` (opcional) — horas de envio, separadas por vírgula (ex:
     `10:00,12:00,13:00`). Se não definires, usa `10:00,12:30` por omissão.
     Também serve para testar o agendamento real (correr sem `--now` e
     pôr horas a 1-2 minutos do momento atual) sem editar o código.

6. **Testar um envio imediato** (ignora a hora, envia já e sai):
   ```bash
   node --env-file=.env index.mjs --now
   ```
   Confirma que a mensagem chega ao grupo certo, com a contagem certa
   (compara com a tab Wellness do dashboard).

## Correr sempre ligado (launchd)

Para o bot ficar a correr sozinho, sempre, mesmo depois de reiniciar o Mac:

```bash
cp com.analisejogo.wellness-lembrete.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.analisejogo.wellness-lembrete.plist
```

Confirma que ficou a correr:
```bash
launchctl list | grep analisejogo
```

Logs em `whatsapp-bot/bot.log`/`bot.error.log`.

**Watchdog** (recomendado — ver "Fiabilidade do envio" acima): mata o
bot e deixa o `launchd` reiniciá-lo se ficar preso sem dar erro:
```bash
cp com.analisejogo.wellness-lembrete-watchdog.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.analisejogo.wellness-lembrete-watchdog.plist
```
Log próprio em `whatsapp-bot/watchdog.log` (só escreve algo quando mata o
processo).

**Para parar/desinstalar** (bot principal + watchdog):
```bash
launchctl unload ~/Library/LaunchAgents/com.analisejogo.wellness-lembrete.plist
launchctl unload ~/Library/LaunchAgents/com.analisejogo.wellness-lembrete-watchdog.plist
rm ~/Library/LaunchAgents/com.analisejogo.wellness-lembrete.plist
rm ~/Library/LaunchAgents/com.analisejogo.wellness-lembrete-watchdog.plist
```

**Para desligar a sessão do WhatsApp** (ex: trocar de número): no
telemóvel, **Definições → Dispositivos ligados** → remove o dispositivo;
depois apaga a pasta `whatsapp-bot/auth/` localmente e repete o passo 2.
