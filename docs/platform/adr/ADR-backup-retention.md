# ADR: backupretentie

## Besluit

Automatische PostgreSQL-backups draaien in een aparte Compose-service, schrijven custom-format dumps naar volume `tzg-backups`, en verwijderen bestanden ouder dan `BACKUP_RETENTION_DAYS` (voorbeeld 14). Incomplete dumps (tijdelijk bestand) worden nooit als succes geteld.

## Alternatieven

- Alleen host-cron: extra afhankelijkheid van de Windows/Linux-taakplanner; makkelijk vergeten na herinstallatie.
- Continu WAL-archiving: te zwaar voor één interne server, geen extra PostgreSQL-expertise vereist in PLATFORM-004.
- Dumps in Git of in `./data`: verkeerde plaats, secrets-risico, geen retentiebeheer.

## Gevolgen

De applicatie leest alleen metadata (laatste succes, leeftijd, grootte, status). Health `/api/health/backups` bevat geen dumpinhoud. Productierestore blijft een apart, bevestigd pad.
