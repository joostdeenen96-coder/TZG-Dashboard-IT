#!/bin/sh
# Controleert of deze Linux-host klaar is voor productie. Toont geen secrets.
set -eu
cd "$(dirname "$0")/.."
fail=0
say() { printf '%s\n' "$1"; }
need() {
  if command -v "$1" >/dev/null 2>&1; then
    say "OK $1"
  else
    say "FAIL $1 ontbreekt"
    fail=1
  fi
}
DOCKER="docker"
if ! command -v docker >/dev/null 2>&1; then
  say "FAIL docker ontbreekt"
  fail=1
elif docker info >/dev/null 2>&1; then
  say "OK docker"
elif sudo docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
  say "OK docker (sudo)"
else
  say "FAIL docker daemon"
  fail=1
fi
if $DOCKER compose version >/dev/null 2>&1; then
  say "OK docker compose"
else
  say "FAIL docker compose ontbreekt"
  fail=1
fi
if [ -f .env ]; then
  say "OK .env aanwezig"
else
  say "FAIL .env ontbreekt"
  fail=1
fi
space=$(df -Pm . | awk 'NR==2 {print $4}')
if [ "${space:-0}" -ge 2048 ]; then
  say "OK vrije schijfruimte ${space}MB"
else
  say "FAIL onvoldoende vrije schijfruimte"
  fail=1
fi
if command -v ss >/dev/null 2>&1; then
  if ss -ltn | grep -q ':8080 '; then
    say "WARN poort 8080 is in gebruik"
  else
    say "OK poort 8080 vrij"
  fi
fi
mkdir -p backups
if touch backups/.preflight 2>/dev/null; then
  rm -f backups/.preflight
  say "OK backupdirectory schrijfbaar"
else
  say "FAIL backupdirectory niet schrijfbaar"
  fail=1
fi
if NODE_ENV=production npm run config:validate >/tmp/tzg-config-validate.json 2>/tmp/tzg-config-validate.log; then
  say "OK productieconfiguratie"
else
  say "FAIL productieconfiguratie"
  fail=1
fi
if timedatectl status >/dev/null 2>&1 || date -u >/dev/null; then
  say "OK tijd beschikbaar: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
if $DOCKER info >/dev/null 2>&1; then
  say "OK docker daemon"
else
  say "FAIL docker daemon"
  fail=1
fi
exit "$fail"
