# Backup en restore

## Wat wel en niet in Git staat

| Pad | In Git | Inhoud |
| --- | --- | --- |
| `.env`, `.env.production` | nee | databasewachtwoord, `DATABASE_URL`, Graph- en PRTG-secrets |
| `.env.production.example` | ja | alleen placeholders zoals `change-me` |
| `data/` | nee | `settings.json`, `config.json`, `dashboards.json`, dieselcache, JSON-export |
| Docker-volume `tzg-postgres` | nee | PostgreSQL-data (dashboards, schermen, tokenhashes, audit, heartbeats) |

Secrets horen apart van de database-dump, op een andere plek (wachtwoordkluis). Een dump bevat geen Graph-secrets; die staan in `.env` en `data/settings.json`.

## PostgreSQL-backup

Vanaf de projectmap, zonder wachtwoord in het script:

```bash
chmod +x scripts/backup-postgres.sh scripts/restore-postgres.sh scripts/export-dashboard-config.sh
./scripts/backup-postgres.sh
```

Dat schrijft `backups/tzg-postgres-<tijdstip>.sql` via `pg_dump` in de container. Het volume heet `tzg-postgres`.

JSON-export van dashboarddefinities (naast de SQL-dump):

```bash
./scripts/export-dashboard-config.sh
```

Resultaat op de host: `data/dashboards.export.json`. Bewaar ook `data/dashboards.json` (importbron) en de `.bak`-bestanden die `npm run db:import-json` maakt.

## PostgreSQL-restore

```bash
docker compose up -d postgres
RESTORE_CONFIRM=yes ./scripts/restore-postgres.sh backups/tzg-postgres-YYYYMMDD.sql
```

Daarna de applicatie starten: `docker compose up -d`. Migraties zijn idempotent. Dashboardconfiguratie die alleen in JSON stond en nog niet in de dump zit, opnieuw importeren met `npm run db:import-json` (zonder `--force` worden bestaande slugs overgeslagen).

## Overige bestanden

```bash
mkdir -p ~/backups/tzg-dashboard
cp -a data ~/backups/tzg-dashboard/data-$(date +%F)
cp -a .env ~/backups/tzg-dashboard/env-$(date +%F)
```

| Pad | Inhoud |
| --- | --- |
| `data/settings.json` | Beheerinstellingen, kan geheimen bevatten |
| `data/config.json` | SharePoint-paden, PRTG-filter, refresh |
| `data/dashboards.json` | JSON-bron voor import — verplicht in backup |
| `data/dashboards.export.json` | Export uit PostgreSQL |
| `data/diesel-week.json` | Cache dieseltoeslag |
| `.env` | Omgevingsgeheimen, buiten git |

## Windows (PowerShell, Docker Compose)

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path ".\backups" | Out-Null
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | Set-Content -Encoding utf8 ".\backups\tzg-postgres-$stamp.sql"
Copy-Item -Recurse .\data ".\backups\data-$stamp"
Copy-Item .\.env ".\backups\env-$stamp"
```

Restore in PowerShell:

```powershell
$env:RESTORE_CONFIRM = "yes"
Get-Content .\backups\tzg-postgres-YYYYMMDD.sql -Raw | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose up -d
```

Stop eerst de stack alleen als je het volume zelf vervangt: `docker compose down`. Het named volume blijft bestaan bij `down` zonder `-v`. `docker compose down -v` wist PostgreSQL.

Bewaar backups buiten de server. Behandel ze als vertrouwelijk.
