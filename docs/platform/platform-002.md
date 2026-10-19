# PLATFORM-002 — Configureerbare dashboards (JSON)

Doel: meerdere dashboards naast elkaar zonder PostgreSQL, zonder drag-and-drop editor, zonder multi-tenant/rechtenbeheer.

## Architectuur

```
data/dashboards.json
        ↑
JsonDashboardRepository  ←  GET/POST/PUT/DELETE /api/dashboards*
        ↑
DisplayPage (/display/:slug) + Admin Dashboards-sectie
        ↑
WidgetRegistry → bestaande cards/providers
```

- Één Node-server op poort **8080** (productie).
- Bestaande providers (waterstanden, diesel, Graph/SharePoint, PRTG, nieuws, agenda) ongewijzigd in functie.
- Geen secrets in de frontend; Graph/PRTG-credentials blijven in `.env` / `data/settings.json`.

## Routing

| URL | Gedrag |
| --- | --- |
| `/` | Bestaand planningsscherm (`DashboardPage`) — backward compatible |
| `/ict` | Bestaand ICT-scherm (`IctDashboardPage`) — backward compatible |
| `/display/:slug` | Dynamisch scherm op basis van `DashboardDefinition` |
| `/admin` | Beheer + nieuwe sectie **Dashboards** |

Onbekend of uitgeschakeld dashboard op `/display/:slug`: fullscreenmelding *“Dit scherm is niet geconfigureerd.”* (geen stacktrace, geen wit scherm).

## API

| Methode | Pad | Auth | Statuscodes |
| --- | --- | --- | --- |
| GET | `/api/dashboards` | nee | 200 |
| GET | `/api/dashboards/:id` | nee | 200 / 404 |
| GET | `/api/dashboards/by-slug/:slug` | nee | 200 / 404 |
| POST | `/api/dashboards` | admin | 201 / 400 / 401 |
| PUT | `/api/dashboards/:id` | admin | 200 / 400 / 401 / 404 |
| DELETE | `/api/dashboards/:id` | admin | 204 / 401 / 404 |

Foutresponses: `{ "error": "…" }` zonder interne details of secrets.

## Persistence

- Pad: `./data/dashboards.json` (dev) / `/app/data/dashboards.json` (Docker via `DATA_DIR`).
- Atomische write: temp-bestand + `rename`.
- Validatie vóór opslaan; corrupt bestand → seed `planning` + `ict`, app blijft up.

## Health

`GET /api/health` bevat `services.dashboardRepository` (`healthy` / `unhealthy`). Geen dashboardinhoud of secrets in het antwoord.

## Admin

Sectie **Dashboards**: lijst (naam, slug, status, aantal widgets), nieuw, dupliceren, bewerken (naam/slug/actief/widget zichtbaarheid/volgorde), verwijderen met bevestiging, preview `/display/{slug}`.

Geen grid-editor.

## Migratie naar PostgreSQL (PLATFORM-003 voorstel)

Vervang `JsonDashboardRepository` door `PostgresDashboardRepository` achter dezelfde interface (`getAll`, `getById`, `getBySlug`, `create`, `update`, `delete`). Importeer bestaande `dashboards.json` eenmalig. Voeg daarna optioneel een layout-editor en rechten toe — niet in deze story.
