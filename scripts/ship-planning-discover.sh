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
mkdir -p data docs

echo "Schepenplanning discovery (geen secrets in deze output)"

if [ -f dist/server/shipPlanning/discoverAuthenticated.js ]; then
  echo "Modus: lokale node dist (host)"
  SHIP_PLANNING_DISCOVERY_OUT="$(pwd)/data/ship-planning-discovery.md"
  export SHIP_PLANNING_DISCOVERY_OUT
  node dist/server/shipPlanning/discoverAuthenticated.js
  echo "Rapport: data/ship-planning-discovery.md"
  if grep -q '^AUTH: PASS' "$SHIP_PLANNING_DISCOVERY_OUT" 2>/dev/null; then
    echo "AUTH PASS — sync samenvatting niet automatisch naar docs/ (beoordeel data-rapport eerst)."
  fi
  exit 0
fi

echo "Modus: docker compose run dashboard"
# Bouw indien image/dist in container ontbreekt na code-update.
if ! $DOCKER compose images dashboard 2>/dev/null | grep -q dashboard; then
  echo "dashboard-image ontbreekt — build…"
  $DOCKER compose build dashboard
fi

$DOCKER compose run --rm --no-deps \
  -e SHIP_PLANNING_DISCOVERY_OUT=/app/data/ship-planning-discovery.md \
  -e SHIP_PLANNING_FORCE_DATA_OUT=1 \
  dashboard \
  node dist/server/shipPlanning/discoverAuthenticated.js

if [ -f "$OUT_HOST" ]; then
  cp "$OUT_HOST" docs/SCHEPENPLANNING-AUTH.md
  echo "Rapport: $OUT_HOST en docs/SCHEPENPLANNING-AUTH.md"
else
  echo "Rapport verwacht op $OUT_HOST (data-volume)"
fi
