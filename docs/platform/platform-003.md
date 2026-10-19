# PLATFORM-003 — PostgreSQL en schermbeheer

PLATFORM-001 (Docker, één Node-server op poort 8080) en PLATFORM-002 (JSON-dashboards, `/display/:slug`) zijn afgerond. PLATFORM-003 maakt PostgreSQL de primaire productieopslag en voegt centraal schermbeheer toe.

## Architectuur

```
Browser / TV
  /  /ict  /display/:slug     legacy, ondersteund, data uit PostgreSQL
  /player/:screenToken        aanbevolen route voor beheerde schermen
  /admin                      dashboards, schermen, recente audit
        │
        ▼
Node.js (één proces, poort 8080)
  DashboardRepository ── PostgresDashboardRepository   (productie)
                      └─ JsonDashboardRepository       (import/export/expliciet lokaal)
  ScreenRepository / ScreenTokenRepository / HeartbeatRepository / AuditLogRepository
        │
        ▼
PostgreSQL 16  (named volume tzg-postgres)
```

Geen microservices. Geen stille JSON-fallback als PostgreSQL in productie faalt: API-calls geven dan een fout en `/api/health` wordt ongezond.

`DASHBOARD_REPOSITORY=json` forceert JSON, alleen voor lokaal herstel of expliciete ontwikkelmodus zonder database. Zonder `DATABASE_URL` en buiten productie blijft JSON de lokale ontwikkelopslag (PLATFORM-002-gedrag).

## Migratie van JSON naar PostgreSQL

1. Backup: `data/dashboards.json` en `.env` (zie `docs/BACKUP.md`).
2. Start PostgreSQL en de applicatie: `docker compose up -d` (entrypoint voert migraties uit, niet vanuit API-requests).
3. Controleer: `npm run db:migrate:status`.
4. Dry-run: `npm run db:import-json -- --dry-run`.
5. Import: `npm run db:import-json` (maakt eerst een kopie `data/dashboards.json.bak-<tijdstip>`).
6. Controleer `/display/planning` en `/display/ict`.

De import is idempotent op `(organisatie, slug)`. Bestaande database-rijen worden niet overschreven, tenzij `--force`.

## Rollback

1. Zet `DASHBOARD_REPOSITORY=json` alleen op een herstelomgeving, niet als stille productie-fallback.
2. Herstel `data/dashboards.json` uit de `.bak`-kopie of via `npm run db:export`.
3. Database herstellen: `scripts/restore-postgres.sh` (zie backupdocumentatie).
4. Zonder `--force` laat een nieuwe import bestaande PostgreSQL-rijen staan.

## Schermen

Zie [screen-registration.md](./screen-registration.md) en [postgresql-data-model.md](./postgresql-data-model.md).

## Beveiliging

- Graph-secrets, databasewachtwoord, connection strings en screen-tokens worden niet gelogd en niet naar React-bundles geschreven.
- Screen-tokens worden alleen als SHA-256-hash opgeslagen en één keer getoond.
- `organizationId` zit in het model; er is nog geen multi-organisatiebeheer. Standaardorganisatie: Teunesen / `teunesen`.

## Wat deze story niet bouwt

Drag-and-drop editor, multi-tenant beheerinterface, licenties, abonnementen, mobiele app, losse microservices.
