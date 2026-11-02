#!/bin/bash
# Análise de Jogo — whatsapp-bot/watchdog.sh
# Mata o processo principal (index.mjs) se o bot.log não for atualizado há
# mais de LIMITE_SEGUNDOS — sinal de que ficou preso (já aconteceu mais do
# que uma vez, sem nunca crashar sozinho nem dar erro — ver histórico de
# versão em index.mjs, 2026-10-11/23/25/28). O launchd
# (KeepAlive: true em com.analisejogo.wellness-lembrete.plist) reinicia-o
# sozinho a seguir — não precisa de nenhuma ação aqui além do kill.
#
# IMPORTANTE: LIMITE_SEGUNDOS tem de ficar claramente acima do intervalo
# do heartbeat em index.mjs (3 min) — com 240s (4 min) matava um processo
# perfeitamente saudável antes do heartbeat seguinte chegar, criando um
# ciclo de reinícios a cada ~6 min a noite toda de 2026-10-29 (sem nenhum
# problema real) e, por tabela, 3 envios da mesma hora no mesmo dia.
#
# Corre sozinho a cada poucos minutos via
# com.analisejogo.wellness-lembrete-watchdog.plist (StartInterval) — ver
# "Correr sempre ligado (launchd)" no README.md para instalar.
#
# Versão: 1.1 (2026-10-29)
# Histórico:
#   1.0 (2026-10-29) — criação.
#   1.1 (2026-10-29) — LIMITE_SEGUNDOS 240 -> 600 (ver nota acima).

set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$DIR/bot.log"
LIMITE_SEGUNDOS=600

if [ ! -f "$LOG" ]; then
  exit 0
fi

ULTIMA_MOD=$(stat -f %m "$LOG")
AGORA=$(date +%s)
DIFF=$((AGORA - ULTIMA_MOD))

if [ "$DIFF" -gt "$LIMITE_SEGUNDOS" ]; then
  PID=$(launchctl list | awk '$3 == "com.analisejogo.wellness-lembrete" {print $1}')
  if [ -n "$PID" ] && [ "$PID" != "-" ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) bot.log parado há ${DIFF}s — a matar PID $PID" >> "$DIR/watchdog.log"
    kill -9 "$PID" || true
  fi
fi
