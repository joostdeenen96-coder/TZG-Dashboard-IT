# Serverbeveiliging (PLATFORM-004)

## Container

- Multi-stage build, runtime `npm ci --omit=dev`.
- Runtimegebruiker `appuser` (uid 10001) na entrypoint.
- Uitzondering: Compose `init: true` start `docker-init` als PID 1 (root). Dat is alleen process-reaping. Het Node-proces draait als uid 10001 (`/proc/$(pgrep -n node)/status`). `docker compose exec dashboard id` toont daardoor root van de exec/init-laag, niet van de applicatie.
- `security_opt: no-new-privileges:true`.
- Geen `privileged`.
- Geen brede hostmounts (`/` of Docker-socket). Alleen `./data` en named volumes.
- Dashboard: `read_only: true`, tmpfs `/tmp`, schrijfbaar: `/app/data`, `/backups`.
- `init: true` voor zombie-reaping en signalen.
- Secrets niet in buildcontext (`.dockerignore` op `.env`).
- PostgreSQL gepubliceerd op `127.0.0.1:5432`, niet op `0.0.0.0`.

## HTTP

- JSON-bodylimiet (standaard 256 KiB).
- Rate limits op login, writes, tokenuitgifte, player-auth, heartbeat (ruim boven 1/min), health/sources.
- Headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`.
- Request-ID (`x-request-id`) in logs en bij 5xx-responses.

## Tokens

Ongewijzigd t.o.v. PLATFORM-003: SHA-256, geen plaintext in de database, eenmalige weergave in admin.

## Reverse proxy

Optioneel. Als een proxy TLS offloadt:

- `TRUST_PROXY=1` (of het aantal hops) zodat rate limits het echte client-IP zien.
- Proxy mag geen `Authorization` loggen.
- Alleen poort 8080 doorzetten; PostgreSQL niet.

Zonder proxy luistert de app zelf op 8080 in het LAN. Dat is de ondersteunde interne-serverinstallatie.

## Logging

Stdout/stderr. Host doet logrotatie. Sanitization dekt Bearer, `postgresql://`, `DATABASE_URL`, Graph/PRTG-secrets, `tzg_`-tokens, cookies.
