# Monitoring

## Endpoints

| Pad | Doel | Externe afhankelijkheden |
| --- | --- | --- |
| `GET /api/health/live` | Proces leeft | geen |
| `GET /api/health/ready` | Config, PostgreSQL, migraties, dashboardrepository | database |
| `GET /api/health` | Samenvatting; bestaande clients blijven dit gebruiken | database (geen trage bronnen) |
| `GET /api/health/sources` | PEGELONLINE, HVZ, PRTG/Graph/SharePoint indien geconfigureerd | ja, korte timeout, beperkte concurrency |
| `GET /api/health/screens` | Totalen: actief, online, offline, uitgeschakeld, nooit verbonden | database |
| `GET /api/health/backups` | Laatste succes, leeftijd, grootte, status, retentie | backupvolume |
| `GET /api/version` | versie, commit, builddatum, omgeving | geen |

Docker HEALTHCHECK gebruikt `/api/health/ready`.

## Statuswaarden

`healthy` | `degraded` | `unhealthy` | `disabled`

Bronnen die niet geconfigureerd zijn: `disabled`, geen unhealthy. Foutcategorieën zijn kort (timeout, http, auth, niet bereikbaar) zonder URL-met-token, secrets of stacktraces.

## Admin

`/admin` toont een operationeel overzicht (server, database, backup, bronnen, schermen) en waarschuwingen:

- actief scherm offline;
- laatste backup ouder dan `BACKUP_MAX_AGE_HOURS`;
- database degraded/unhealthy;
- geconfigureerde databron herhaaldelijk ongezond.

Geen e-mail of Teams in PLATFORM-004.

## Logs

Productie: JSON-regels op stdout/stderr. Rotatie is een **host**-verantwoordelijkheid (`/etc/docker/daemon.json` `log-opts max-size/max-file`, of systemd). De container schrijft geen logbestanden in de image.

Velden: `timestamp`, `level`, `message`, `service`, `version`, `requestId`, `event`, optioneel `screenId`, `dashboardId`, `durationMs`.
