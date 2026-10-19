# PLATFORM-004 — Production hardening

PLATFORM-001 (Docker, poort 8080), PLATFORM-002 (JSON-dashboards) en PLATFORM-003 (PostgreSQL, schermbeheer, player-tokens) zijn afgerond. PLATFORM-004 maakt dezelfde applicatie geschikt voor betrouwbare installatie op een interne Linux- of Windows-server. Er komen geen nieuwe dashboards, widgets, organisaties of microservices.

## 1. Huidige productiearchitectuur

Eén Node.js-proces (Express + React-build) en PostgreSQL 16 in Docker Compose.

```
TV / browser
  /  /ict  /display/:slug     legacy, data uit PostgreSQL
  /player/:screenToken        beheerde speler
  /admin                      dashboards, schermen, audit
        │
        ▼
tzg-dashboard  (Node 22, poort 8080, na entrypoint uid 10001)
  PostgresDashboardRepository (productie)
  JsonDashboardRepository     (import/export, DASHBOARD_REPOSITORY=json)
        │  DATABASE_URL intern naar host "postgres"
        ▼
tzg-postgres   (postgres:16-bookworm, named volume tzg-postgres)
```

Migraties draaien in `docker-entrypoint.sh` bij start, niet vanuit API-requests. Screen-tokens staan alleen als SHA-256-hash. Heartbeats bepalen Online/Offline via `SCREEN_HEARTBEAT_SECONDS` en `SCREEN_OFFLINE_AFTER_SECONDS`.

## 2. Huidige risico’s (vóór PLATFORM-004)

| Risico | Status bij start PLATFORM-004 |
| --- | --- |
| Geen centrale productievalidering; placeholder `change-me` werd in Compose geaccepteerd | bekend |
| Geen live/ready-scheiding; Docker HEALTHCHECK hing van `/api/health` af | bekend |
| Geen automatische PostgreSQL-backup of retentie | bekend |
| Restore overschrijft de productiedatabase als `RESTORE_CONFIRM=yes` | bekend |
| Geen gestructureerde JSON-logs, geen request-ID | bekend |
| Geen graceful shutdown van HTTP-server en pool | bekend |
| Root-entrypoint alleen voor `chown` van `./data`; daarna drop naar appuser | bekend, nodig voor bind-mount |
| Inter-containerverkeer kan falen als de Docker-host `iptables-legacy FORWARD DROP` heeft | getest in PLATFORM-003-omgeving |
| Playercache bewaarde de volledige playerpayload; token stond in de localStorage-sleutel | bekend |
| Admin-sessies in geheugen; verloren bij herstart | geaccepteerd, geen extra store in PLATFORM-004 |

## 3. Gewenste productiearchitectuur

Zelfde één-procesmodel, plus:

- startvalidatie van verplichte productievariabelen;
- live- versus readiness-health;
- backupservice in Compose met persistent volume `tzg-backups`;
- restore-test naar een tijdelijke database, nooit stilzwijgend naar productie;
- JSON-logs, request-ID, rate limits, requestgroottegrenzen;
- read-only rootfilesystem waar praktisch, `no-new-privileges`, non-root runtime;
- preflight-, update- en rollbackscripts;
- versie-endpoint (`APP_VERSION`, `BUILD_COMMIT`, `BUILD_DATE`).

## 4. Afhankelijkheden

- Docker Engine en Docker Compose v2
- Image `postgres:16-bookworm` (bevat `pg_dump` / `pg_restore`)
- Image-build `tzg-dashboard:local` (Node 22)
- Hostbestanden: `.env` (niet in Git), map `data/`, named volumes
- Optioneel: Microsoft Graph, PRTG (alleen als geconfigureerd)
- Externe bronnen: PEGELONLINE, HVZ (publiek HTTP)

## 5. Recoverydoelstellingen

Er zijn geen gemeten RTO/RPO-contracten. Wat wél vastligt:

- PostgreSQL-data zit in volume `tzg-postgres` (overleeft containerrestart en image-rebuild; **niet** `docker compose down -v`).
- Backups zitten in volume `tzg-backups` plus optionele kopie buiten de host.
- Een restore-test raakt de productiedatabase niet.
- Productierestore vereist `RESTORE_CONFIRM=yes` én expliciete host/databasenaam.

Geteste hersteltijden worden in het acceptatierapport opgenomen als observatie, niet als garantie.

## 6–7. Backup- en restorestrategie

Zie `docs/platform/disaster-recovery.md` en `docs/platform/adr/ADR-backup-retention.md`. Kort: `pg_dump -Fc`, atomair schrijven, retentie via `BACKUP_RETENTION_DAYS`, verify met `pg_restore --list`, restore-test naar `tzg_restore_test`.

## 8. Monitoringmodel

Zie `docs/platform/monitoring.md` en `docs/platform/adr/ADR-production-health-model.md`. Live, ready, samenvatting, bronnen, schermen, backups. Geen e-mail of Teams.

## 9. Offlinegedrag spelers

Zie `docs/platform/offline-player.md` en `docs/platform/adr/ADR-player-offline-cache.md`.

## 10. Update en rollback

Zie `docs/UPDATE-PRODUCTION.md` en `docs/ROLLBACK.md`. Backup eerst; geen blinde `git pull && docker compose up`; geen automatische schemadowngrade.

## 11–12. Installatie

- Linux: `docs/INSTALL-PRODUCTION-LINUX.md`
- Windows: `docs/INSTALL-PRODUCTION-WINDOWS.md`
- Checklist: `docs/PRODUCTION-CHECKLIST.md`

## 13–14. Firewall en Docker-netwerk

- Alleen TCP 8080 naar de LAN-clients (TV’s, beheerwerkplek).
- PostgreSQL luistert intern op het Compose-netwerk. Publicatie is `127.0.0.1:5432` (localhost op de host), niet `0.0.0.0`.
- Bij hostreboot controleren of containers starten (`restart: unless-stopped`) en of de Docker FORWARD-policy inter-containerverkeer toestaat. Zie `docs/TROUBLESHOOTING.md`.

## 15. Secrets management

Secrets staan in `.env` en eventueel `data/settings.json`, niet in Git, niet in image layers (`.dockerignore` sluit `.env` uit), niet in React. Logs redigeren wachtwoorden, connection strings, Bearer-headers, Graph-secrets, PRTG-secrets en `tzg_`-tokens.

## 16. Resterende risico’s na PLATFORM-004

- Admin-sessie verdwijnt bij containerherstart.
- Player-URL bevat het token; wie de URL heeft, is de speler. Token staat niet in de cache-inhoud.
- Externe bronnen (PEGELONLINE, HVZ, Graph, PRTG) blijven best-effort; ready hangt daar niet van af.
- Automatische backup faalt stil op de host als het backupvolume vol is — health/backups wordt dan unhealthy/degraded.
- Deze documentatie belooft geen 99,x % beschikbaarheid.

Classificatie in overige docs: **technisch getest** / **alleen gedocumenteerd** / **niet getest**.

## 17. Acceptatiecriterium 26 (Windows-preflight syntaxis)

Criterium: *preflight Windows syntactisch gevalideerd*.

Extern gecontroleerd op een Windows-pc in `C:\TZG-Dashboard`. Parserresultaat:

```
Aantal syntaxfouten: 0
```

`$errors | Format-List` produceerde geen regels. Daarmee is criterium 26 **PASS**. PSScriptAnalyzer-uitvoer en de volledige runtime van `preflight-windows.ps1` zijn in die controle niet aangeleverd; die vallen buiten dit criterium.
