# Offlinegedrag van de TV-speler

De speler op `/player/:screenToken` haalt publieke configuratie op via `GET /api/player/config` en stuurt `POST /api/player/heartbeat`.

## Cache

Na een succesvolle config met dashboard bewaart de browser:

- publieke dashboarddefinitie (widgets/layout/theme zonder secrets);
- schermnaam/slug/locatie (geen token);
- applicatieversie van de server;
- tijdstip laatste succesvolle lading;
- heartbeat-interval.

Niet in de cache-inhoud: screen-token, Graph-credentials, cookies, Authorization-header, databasegegevens. De localStorage-sleutel is een hash van het token, niet het token zelf.

## Server tijdelijk weg

- Laatst geldige dashboard blijft in beeld.
- Subtiele indicator: offline, plus tijdstip laatste succesvolle update.
- Exponential backoff vanaf 2 s, plafond 60 s. Geen request storm.
- Heartbeat stopt zolang config/heartbeat niet lukt.
- Bij terugkeer: verse config vervangt de cache, indicator verdwijnt, heartbeat hervat.

## Geen cache

Volledig scherm met Teunesen-stijl, tekst:

«De narrowcastingserver is tijdelijk niet bereikbaar.»

Geen wit scherm, geen stacktrace. 401/403 blijven «Dit scherm is niet geautoriseerd.» en gebruiken de cache niet.

Zie ADR `docs/platform/adr/ADR-player-offline-cache.md`.
