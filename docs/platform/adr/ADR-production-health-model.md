# ADR: productie-healthmodel

## Besluit

Drie lagen:

1. **live** — proces luistert, geen I/O naar PostgreSQL of bronnen.
2. **ready** — configuratie geldig, PostgreSQL `SELECT 1`, migraties bij, dashboardrepository gezond.
3. **health** — samenvatting voor bestaande clients; in productie 503 als de database unhealthy is (PLATFORM-003-contract).

Bronnen, schermen en backups zijn aparte paden zodat een trage PEGELONLINE ready niet blokkeert. Docker HEALTHCHECK wijst naar ready.

## Alternatieven

- Eén endpoint voor alles: bron-timeouts maken Compose-restarts onnodig agressief.
- Ready inclusief Graph/PRTG: optionele integraties zouden de hele stack unready maken.

## Gevolgen

Orchestratie mag live gebruiken om de container niet te killen tijdens een kort PostgreSQL-herstart, en ready om verkeer/werven te sturen. Admin toont alle lagen.
