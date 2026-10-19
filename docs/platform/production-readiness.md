# Productiegereedheid

## Runtime

| Onderdeel | Verwacht | Classificatie |
| --- | --- | --- |
| Eén Node-proces, poort 8080 | `tzg-dashboard` | technisch getest in PLATFORM-001–003 |
| PostgreSQL 16, volume `tzg-postgres` | `tzg-postgres` | technisch getest in PLATFORM-003 |
| Backupvolume `tzg-backups` | persistent dump + metadata | PLATFORM-004 |
| Non-root appuser uid 10001 | na entrypoint | PLATFORM-003, herhaald in 004 |
| Read-only rootfilesystem dashboard | `read_only: true` + tmpfs `/tmp` + volumes | PLATFORM-004 |
| PostgreSQL niet op het LAN | bind `127.0.0.1:5432` | PLATFORM-003; LAN-bereikbaarheid PLATFORM-004 |
| Configuratievalidatie bij start | `npm run config:validate` | PLATFORM-004 |
| Live / ready | `/api/health/live`, `/api/health/ready` | PLATFORM-004 |

## Uitzonderingen (bewust)

1. **Entrypoint start als root** om `chown` op de bind-mount `./data` te kunnen doen, daarna `setpriv` naar uid 10001. Zonder die stap faalt schrijven naar `data/` (PLATFORM-002 EACCES). Gedocumenteerd, geen privileged container.
2. **`./data` is schrijfbaar** voor `settings.json`, `config.json`, JSON-export en dieselcache. Applicatiecode onder `/app/dist` zit in de image en is niet als volume gemount.
3. **PostgreSQL-poort op localhost** blijft beschikbaar voor host-side tests (`npm test` tegen `127.0.0.1:5432`). Niet publiceren als `0.0.0.0:5432`.
4. **Geen host-cron als enige backup.** De Compose-service `backup` is de productieweg. Host-scripts blijven beschikbaar als noodgreep.

## Configuratie

Verplicht in productie (`NODE_ENV=production`):

`NODE_ENV`, `PORT`, `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `SCREEN_HEARTBEAT_SECONDS`, `SCREEN_OFFLINE_AFTER_SECONDS`, `BACKUP_RETENTION_DAYS`, `BACKUP_SCHEDULE`, `LOG_LEVEL`.

Lege waarden en placeholders (`change-me`, `changeme`, `secret`, `password`, `replace-me`) zijn ongeldig. Graph-variabelen zijn alleen verplicht als Graph is ingeschakeld (minstens één `GRAPH_*` gezet of `GRAPH_ENABLED=true`).

## Checklist koppeling

De operationele lijst staat in `docs/PRODUCTION-CHECKLIST.md`.
