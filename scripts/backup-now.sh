#!/bin/sh
# Handmatige dump via de backupservice (pg_dump 16). Geen wachtwoord in dit script.
set -eu
cd "$(dirname "$0")/.."
docker compose exec -T backup bash -c 'BACKUP_ONCE=1 /backup-loop.sh'
