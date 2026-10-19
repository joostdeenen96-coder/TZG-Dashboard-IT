# Disaster recovery

Geen verzonnen RTO/RPO. Onderstaande stappen zijn de bedoelde procedure. Wat tijdens PLATFORM-004 daadwerkelijk is gedraaid, staat in het acceptatierapport als **technisch getest**.

## Backupstrategie

- Formaat: PostgreSQL custom (`pg_dump -Fc`), extensie `.dump`.
- Bestandsnaam: `tzg-YYYYMMDDTHHMMSSZ.dump`.
- Schrijven naar tijdelijk bestand, daarna atomaire rename. Incomplete bestanden tellen niet als succes.
- Metadata JSON ernaast (grootte, tijdstip, status, formaat). Geen credentials.
- Volume: `tzg-backups` → `/backups` (configureerbaar via `BACKUP_DIRECTORY`).
- Retentie: `BACKUP_RETENTION_DAYS` (voorbeeld 14). Ouder dan de retentie wordt gecontroleerd verwijderd.
- Schema: `BACKUP_SCHEDULE` cron-achtig (voorbeeld `0 2 * * *`).
- `BACKUP_ENABLED=false` slaat geplande runs over; handmatige `npm run backup:create` blijft mogelijk.

Zie ADR `docs/platform/adr/ADR-backup-retention.md`.

## Restorestrategie

### Restore-test (standaard, veilig)

`npm run backup:restore-test` (of `scripts` in de backupcontainer):

1. Maakt database `tzg_restore_test` (of een unieke testdatabase).
2. Herstelt de gekozen dump daarin.
3. Controleert tabellen, aantallen, planning/ICT, tokenhashes (geen plaintext `tzg_`).
4. Verwijdert de testdatabase.
5. Weigert als de doeldatabase de geconfigureerde productiedatabase is.

### Productierestore (destructief)

Vereist:

- `RESTORE_CONFIRM=yes`
- expliciete `RESTORE_HOST` (of Compose-service)
- expliciete `RESTORE_DB`

Anders stopt het script. Geen automatische schemadowngrade.

## Scenario’s

### Linux Docker-host

1. `./scripts/preflight-linux.sh`
2. Backupvolume en `tzg-postgres` blijven bij `docker compose down` (zonder `-v`).
3. Restore: zie `docs/BACKUP.md` en `scripts/restore-postgres.sh`.

### Windows Docker-host

Zelfde Compose-stack. PowerShell-varianten: `scripts/preflight-windows.ps1`, `scripts/update-production.ps1`, `scripts/rollback-production.ps1`. **Alleen gedocumenteerd** tot een Windows-host is meegenomen in de runtime-test.

### Nieuwe server

1. Docker + Compose installeren.
2. Repository of release uitpakken.
3. `.env` vanuit kluis, geen Git.
4. Preflight, `docker compose up -d`, migraties via entrypoint.
5. Optioneel: dump restoren naar nieuwe lege volume, daarna dashboards controleren.

### Bestaand volume defect

1. Nieuw volume, PostgreSQL starten.
2. Recentste geverifieerde dump restoren met expliciete bevestiging.
3. `.env` en `data/settings.json` uit aparte secret-backup.

### Applicatieversie rollback

Applicatierollback = vorige image tag starten **zonder** database-downgrade. Als de nieuwe release migraties heeft toegepast die de oude code niet leest: databaseherstel uit dump van vóór de update, of vooruit blijven op de nieuwe app. Scripts proberen geen destructieve downgrade.

## Secrets

`.env` en `data/settings.json` zitten niet in `pg_dump`. Die horen in een kluis, niet in dezelfde tar als de dump als dat vermijdbaar is.
