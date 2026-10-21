#!/bin/sh
# Update: preflight, backup, image bouwen, production-safe validatie, replace, ready.
# Geen tsx, vite of development node_modules op de host.
set -eu
cd "$(dirname "$0")/.."

DOCKER="docker"
if ! docker info >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
fi

echo "1. preflight"
./scripts/preflight-linux.sh

echo "2. huidige versie vastleggen"
PREV_VERSION="$($DOCKER compose exec -T dashboard node -e "console.log(process.env.APP_VERSION||'onbekend')" 2>/dev/null || echo onbekend)"
PREV_COMMIT="$($DOCKER compose exec -T dashboard node -e "console.log(process.env.BUILD_COMMIT||'unknown')" 2>/dev/null || echo unknown)"
echo "huidig: version=${PREV_VERSION} commit=${PREV_COMMIT}"
curl -fsS http://127.0.0.1:8080/api/version 2>/dev/null || true
echo

echo "3. databasebackup"
if $DOCKER compose ps --status running --services 2>/dev/null | grep -qx dashboard; then
  $DOCKER compose exec -T dashboard node dist/server/scripts/backup-create.js
elif $DOCKER compose ps --status running --services 2>/dev/null | grep -qx backup; then
  $DOCKER compose exec -T backup bash -c 'BACKUP_ONCE=1 /backup-loop.sh'
else
  echo "FAIL geen draaiende dashboard- of backupcontainer voor backup" >&2
  exit 1
fi

echo "4. nieuwe productie-image bouwen"
export BUILD_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
export BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
$DOCKER compose build dashboard

echo "5. nieuwe image production-safe valideren (vóór replace)"
if ! $DOCKER compose run --rm --no-deps -T dashboard \
  node dist/server/scripts/config-validate.js \
  >/tmp/tzg-config-validate-new.json \
  2>/tmp/tzg-config-validate-new.log; then
  echo "FAIL nieuwe image-configuratie ongeldig — productiecontainer niet vervangen" >&2
  echo "Zie /tmp/tzg-config-validate-new.log" >&2
  echo "Rollbackinstructie: docs/ROLLBACK.md en ./scripts/rollback-production.sh" >&2
  exit 1
fi
echo "OK nieuwe image-configuratie"

echo "6. containers gecontroleerd vervangen"
$DOCKER compose up -d

echo "7. readiness controleren"
i=0
while [ "$i" -lt 40 ]; do
  if curl -fsS http://127.0.0.1:8080/api/health/ready >/dev/null; then
    echo "8. versie controleren"
    curl -fsS http://127.0.0.1:8080/api/version
    echo
    echo "ready — vorige: ${PREV_VERSION}/${PREV_COMMIT}"
    echo "Bij latere fout: zie docs/ROLLBACK.md en ./scripts/rollback-production.sh ${PREV_COMMIT}"
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done
echo "FAIL ready. Start rollbackprocedure: docs/ROLLBACK.md"
echo "Vorige versie: ${PREV_VERSION} commit=${PREV_COMMIT}"
exit 1
