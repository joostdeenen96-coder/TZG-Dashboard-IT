#!/bin/bash
# Geplande pg_dump. Geen wachtwoord in logs. Root alleen om /backups schrijfbaar te maken.
set -euo pipefail

DIR="${BACKUP_DIRECTORY:-/backups}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DIR"
  chmod 1777 "$DIR" || true
  if id postgres >/dev/null 2>&1; then
    exec gosu postgres "$0" "$@"
  fi
fi

mkdir -p "$DIR"
chmod 1777 "$DIR" 2>/dev/null || true

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}

field_ok() {
  local token="$1"
  local value="$2"
  local part
  IFS=',' read -r -a parts <<< "$token"
  for part in "${parts[@]}"; do
    if [ "$part" = "*" ]; then return 0; fi
    if [ "${part#*/}" != "$part" ] && [ "${part%/*}" = "*" ]; then
      local step="${part#*/}"
      if [ "$step" -gt 0 ] && [ $((value % step)) -eq 0 ]; then return 0; fi
    elif [ "${part#*-}" != "$part" ]; then
      local start="${part%-*}"
      local end="${part#*-}"
      if [ "$value" -ge "$start" ] && [ "$value" -le "$end" ]; then return 0; fi
    elif [ "$part" = "$value" ]; then
      return 0
    fi
  done
  return 1
}

cron_match() {
  set -- $1
  if [ "$#" -ne 5 ]; then return 1; fi
  local minute hour day month weekday
  minute=$(date -u +%-M)
  hour=$(date -u +%-H)
  day=$(date -u +%-d)
  month=$(date -u +%-m)
  weekday=$(date -u +%w)
  field_ok "$1" "$minute" && field_ok "$2" "$hour" && field_ok "$3" "$day" && field_ok "$4" "$month" && field_ok "$5" "$weekday"
}

run_dump() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  tmp="$DIR/tzg-$stamp.dump.tmp"
  final="$DIR/tzg-$stamp.dump"
  log "backup starten"
  if pg_dump -Fc -f "$tmp"; then
    if [ -s "$tmp" ]; then
      mv "$tmp" "$final"
      size=$(wc -c < "$final" | tr -d ' ')
      printf '{"file":"%s","createdAt":"%s","size":%s,"format":"custom","status":"ok"}\n' \
        "$final" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$size" > "$final.meta.json"
      log "backup klaar"
      return 0
    fi
  fi
  rm -f "$tmp"
  log "backup mislukt"
  return 1
}

cleanup() {
  days="${BACKUP_RETENTION_DAYS:-14}"
  find "$DIR" -maxdepth 1 -name 'tzg-*.dump' -mtime +"$days" -print -delete 2>/dev/null || true
  find "$DIR" -maxdepth 1 -name 'tzg-*.dump.meta.json' -mtime +"$days" -delete 2>/dev/null || true
}

if [ "${BACKUP_ONCE:-}" = "1" ]; then
  run_dump
  cleanup
  exit 0
fi

if [ "${BACKUP_ENABLED:-true}" != "true" ]; then
  log "backup uitgeschakeld, wacht"
  while true; do sleep 3600; done
fi

last=""
while true; do
  now=$(date -u +%Y%m%d%H%M)
  schedule="${BACKUP_SCHEDULE:-0 2 * * *}"
  if cron_match "$schedule"; then
    if [ "$last" != "$now" ]; then
      run_dump || true
      cleanup || true
      last="$now"
    fi
  fi
  sleep 20
done
