# Schermregistratie

## Aanmaken

In `/admin` → Schermen: naam, slug, locatie, optioneel dashboard, actief/inactief.

## Player-URL

`/player/{screenToken}`

Het token wordt één keer getoond bij genereren of vernieuwen. De database bevat alleen `token_hash`. De URL kan daarna niet opnieuw worden opgebouwd; genereer een vervangend token.

## Authenticatie

`GET /api/player/config` en `POST /api/player/heartbeat` met `Authorization: Bearer {screenToken}`.

De server:

1. hasht het token (SHA-256);
2. zoekt de hash;
3. weigert ingetrokken of verlopen tokens;
4. weigert uitgeschakelde schermen;
5. levert alleen publieke playerconfiguratie (scherm + dashboarddefinitie, geen secrets).

Teksten:

- geen dashboard: «Dit scherm is nog niet gekoppeld aan een dashboard.»
- ongeldig, ingetrokken of uitgeschakeld: «Dit scherm is niet geautoriseerd.»

## Heartbeat en status

| Variabele | Standaard | Betekenis |
| --- | --- | --- |
| `SCREEN_HEARTBEAT_SECONDS` | 60 | interval dat de player van de server krijgt |
| `SCREEN_OFFLINE_AFTER_SECONDS` | 180 | daarna is een actief scherm offline |
| `SCREEN_HEARTBEAT_RETENTION_DAYS` | 14 | ouder dan dit wordt verwijderd |

Status:

- **Uitgeschakeld** — `screens.enabled = false`
- **Nooit verbonden** — geen `last_seen_at`
- **Offline** — laatste heartbeat ouder dan `SCREEN_OFFLINE_AFTER_SECONDS`
- **Online** — recente heartbeat

Elke heartbeat werkt `last_seen_at` bij. Per scherm blijven maximaal 500 heartbeats bewaard, plus de retentie in dagen. Opruimen gebeurt gecontroleerd bij een heartbeat (hooguit eens per 10 minuten globaal).

Heartbeat-body mag alleen `appVersion`, `dashboardId`, `status` en beperkte metadata (`player`) bevatten. Geen Graph-token, cookies, secrets of apparaatvingerafdruk.

## Offline player

Bij een netwerkfout gebruikt de player de laatst succesvolle configuratie uit `localStorage`, toont «Offline — laatste configuratie», en probeert opnieuw met backoff (2s, verdubbelen, maximum 60s). Een 401/403 toont de weigering en gebruikt de cache niet.

## Legacy routes

`/`, `/ict`, `/display/planning` en `/display/ict` blijven werken en lezen dashboarddefinities uit PostgreSQL zodra die de actieve repository is. `/player/:screenToken` is de aanbevolen route voor geregistreerde TV's.
