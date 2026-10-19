# ADR — PostgreSQL als dashboardrepository

## Status

Aangenomen (PLATFORM-003).

## Context

PLATFORM-002 bewaart dashboards in `data/dashboards.json` via `JsonDashboardRepository`. Meerdere TV-schermen, tokens en audit vragen om relationele opslag, transactions en constraints. De applicatie blijft één Node-proces.

## Besluit

- `PostgresDashboardRepository` is de productie-implementatie achter `DashboardRepository`.
- PostgreSQL is primair zodra `DATABASE_URL` gezet is, en altijd in `NODE_ENV=production`.
- Een databasefout in productie valt niet stil terug op JSON. De API meldt succes pas nadat de transactie is gecommit.
- `JsonDashboardRepository` blijft bestaan voor import, export, backupherstel en expliciet `DASHBOARD_REPOSITORY=json`.
- Migraties zijn SQL-bestanden met een eigen runner (`schema_migrations`), gestart via `npm run db:migrate` of het entrypoint.

## Gevolgen

- Deploy vereist een bereikbare database en een gelukte migratie.
- Lokale ontwikkeling zonder `DATABASE_URL` kan JSON blijven gebruiken.
- Rollback is een bewuste configuratie- of restore-stap, geen automatisch vangnet.
