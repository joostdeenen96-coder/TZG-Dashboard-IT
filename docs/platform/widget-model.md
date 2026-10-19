# Widget model

## DashboardWidget

| Veld | Type | Betekenis |
| --- | --- | --- |
| `id` | string | Uniek binnen het dashboard |
| `type` | discriminated union | Zie hieronder |
| `title` | string | Kop / label |
| `enabled` | boolean | Uit = niet gerenderd op display |
| `position` | `{ order, row?, column?, span? }` | Volgorde (en optionele grid-hints) |
| `layout` | `{ area, width? }` | `header` / `main` / `footer` / `sidebar` |
| `dataSource` | builtin of none | Welke server-API de widget voedt |
| `settings` | object | Type-specifieke opties (bijv. tekstbody) |
| `refreshIntervalSeconds` | number | 15–3600 |

## Widget types

| Type | Bron | UI |
| --- | --- | --- |
| `waterlevels` | `/api/waterlevels` | Peilkaarten Maxau/Kaub/Ruhrort |
| `diesel` | `/api/dieselsurcharge` | Dieseltoeslagkaart |
| `weather` | bestaande weerfeed | Header / WeatherWidget |
| `news` | `/api/news` | WijTeunesen-nieuws |
| `slideshow` | bestaande slides | SlideshowCard |
| `clock` | clienttijd | Klok |
| `text` | `settings.body` | Vrije tekst |
| `prtg` | `/api/prtg` | ICT-monitoring |
| `agenda` | `/api/agenda` | Agendabalk |

## WidgetRegistry (frontend)

`src/widgets/WidgetRegistry.tsx` mappt type → component.

- Geen grote `switch` met businesslogica in de display-renderer.
- Onbekend type: widget toont nette foutstatus; browser logt een waarschuwing; app blijft draaien.
- Providers en Graph-geheimen blijven server-side; widgets blijven via bestaande `/api/*` endpoints werken.
