# Interactieve weersverwachting

## Analyse (vóór deze feature)

| Onderdeel | Bevinding |
| --- | --- |
| Weerprovider | Geen live provider — hardcoded mock in `src/services/dashboardService.ts` |
| Endpoint | Ontbrak (`/api/weather` bestond niet) |
| Datamodel | `WeatherReport` + `ForecastDay[]` (alleen frontend-mock) |
| Refresh | Geen — statische mock via `readWeather()` |
| Meerdaagse forecast | Alleen 4 verzonnen dagen in mock |
| Externe bron | Geen |
| Backend nodig | Ja |

## Keuze provider

**Open-Meteo** (nieuw, noodzakelijk):

- Geen API-key (geen secrets client- of server-side voor weer).
- Dagelijkse forecast tot 16 dagen; wij tonen **maximaal 7 dagen inclusief vandaag**.
- Geocoding via Open-Meteo geocoding API op basis van `config.weer.plaatsnaam` (standaard Gennep).

Risico: nieuwe externe afhankelijkheid. Alternatief (mock houden) voldoet niet aan “geen verzonnen weersgegevens”.

## API

`GET /api/weather?location=Gennep`

Response bevat o.a. `current`, `days[]`, `generatedAt`, `source`, `status`, plus compatvelden (`temperatureC`, `icon`, `forecast`).

Server-cache: standaard 300 s (`WEATHER_CACHE_SECONDS`). Bij bronfout: stale cache tot 6 uur.

## Widgetsettings (`settings` JSON)

| Veld | Default |
| --- | --- |
| `popupEnabled` | `true` |
| `forecastDays` | `7` |
| `popupAutoCloseSeconds` | `60` (`0` = uit) |
| `showPrecipitation` | `true` |
| `showWind` | `true` |
| `showSunriseSunset` | `false` |

Bestaande widgets zonder deze velden blijven werken (defaults).

## Updateprocedure TEU-NC-01

1. Merge deze featurebranch naar `main` (niet auto-merge).
2. Op de host: `git pull` in de deploy-directory.
3. `docker compose build dashboard && docker compose up -d dashboard`.
4. Controleer: `GET /api/health/ready`, `GET /api/weather`, Planning- en ICT-display.
5. Open de weerwidget op het TV-scherm; controleer popup (Escape / sluitknop / auto-close 60s).
6. Geen database-migratie vereist (settings blijven in bestaande widget-`settings` JSON).

## Voorgestelde versietag

`v0.5.0` — interactieve weekverwachting (Open-Meteo) + `GET /api/weather`.
