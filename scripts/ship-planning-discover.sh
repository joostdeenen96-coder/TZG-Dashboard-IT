#!/bin/sh
# Authenticated Schepenplanning discovery op TEU-NC-01 (Node dist of Docker image).
# Secrets komen uit .env / compose-environment; worden niet geëchood.
set -eu
cd "$(dirname "$0")/.."

DOCKER="docker"
if ! docker info >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
fi

OUT_HOST="data/ship-planning-discovery.md"
# Host-owned leesbaar rapport (geen world-writable; geen sudo nodig voor lezen).
OUT_READABLE="ship-planning-discovery.md"
mkdir -p data docs

echo "Schepenplanning discovery (geen secrets in deze output)"

if [ -f dist/server/shipPlanning/discoverAuthenticated.js ]; then
  echo "Modus: lokale node dist (host)"
  SHIP_PLANNING_DISCOVERY_OUT="$(pwd)/data/ship-planning-discovery.md"
  export SHIP_PLANNING_DISCOVERY_OUT
  node dist/server/shipPlanning/discoverAuthenticated.js
  echo "Rapport: data/ship-planning-discovery.md"
  if [ -f "$OUT_HOST" ]; then
    cp "$OUT_HOST" "$OUT_READABLE"
    chmod 640 "$OUT_READABLE" 2>/dev/null || chmod 600 "$OUT_READABLE" || true
    echo "Leesbaar rapport (host-owner): $OUT_READABLE"
  fi
  exit 0
fi

echo "Modus: docker compose run dashboard"
# Bouw indien image/dist in container ontbreekt na code-update.
if ! $DOCKER compose images dashboard 2>/dev/null | grep -q dashboard; then
  echo "dashboard-image ontbreekt — build…"
  $DOCKER compose build dashboard
fi

# Eén container-run:
# - schrijft rapport naar data-volume (persistent)
# - streamt rapportinhoud naar host-stdout → host-owned file (leesbaar zonder sudo)
# Node console (AUTH/DATASET) gaat naar stderr zodat $OUT_READABLE puur markdown blijft.
set +e
$DOCKER compose run --rm --no-deps \
  -e SHIP_PLANNING_DISCOVERY_OUT=/app/data/ship-planning-discovery.md \
  -e SHIP_PLANNING_FORCE_DATA_OUT=1 \
  dashboard \
  sh -c 'node dist/server/shipPlanning/discoverAuthenticated.js >&2; ec=$?; chmod 640 /app/data/ship-planning-discovery.md 2>/dev/null || true; cat /app/data/ship-planning-discovery.md; exit $ec' \
  > "${OUT_READABLE}.tmp"
ec=$?
set -e

if [ -s "${OUT_READABLE}.tmp" ]; then
  mv "${OUT_READABLE}.tmp" "$OUT_READABLE"
  chmod 640 "$OUT_READABLE" 2>/dev/null || chmod 600 "$OUT_READABLE" || true
  echo "Leesbaar rapport (host-owner): $OUT_READABLE (mode $(stat -c %a "$OUT_READABLE" 2>/dev/null || echo '?'))"
else
  rm -f "${OUT_READABLE}.tmp" 2>/dev/null || true
  echo "WAARSCHUWING: host-leesbaar rapport niet geschreven" >&2
fi

if [ -f "$OUT_HOST" ]; then
  echo "Rapport data-volume: $OUT_HOST (mogelijk uid 10001 — gebruik $OUT_READABLE)"
fi

exit "$ec"
