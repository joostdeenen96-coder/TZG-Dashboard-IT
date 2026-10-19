# Dashboard model

Domainmodel voor configureerbare narrowcasting-dashboards (PLATFORM-002).

## DashboardDefinition

| Veld | Type | Betekenis |
| --- | --- | --- |
| `id` | string | Stabiele identifier (UUID of vaste seed-id) |
| `name` | string | Weergavenaam |
| `slug` | string | URL-vriendelijk, uniek (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) |
| `description` | string | Korte toelichting |
| `enabled` | boolean | Inactief → display toont “niet geconfigureerd” |
| `theme` | `DashboardTheme` | `mode` (`dark`/`light`), `glass` |
| `layout` | `DashboardLayout` | Preset + stage-afmetingen |
| `widgets` | `DashboardWidget[]` | Geordende widgetlijst |
| `createdAt` / `updatedAt` | ISO-8601 | Timestamps |

## DashboardLayout

- `preset`: `planning` \| `ict` \| `stack`
- `stageWidth` / `stageHeight`: TV-canvas (standaard 2560×1440)

Presets `planning` en `ict` behouden de bestaande TV-layouts. `stack` stapelt enabled widgets via de WidgetRegistry.

## DashboardTheme

- `mode`: `dark` of `light`
- `glass`: liquid-glass achtergrond aan/uit (voorkeur; bestaande display-toggles blijven werken)

## Runtime validatie

Servermodule: `server/dashboards/model.ts`.

- Ongeldige of corrupte `dashboards.json` laat de Node-app **niet** crashen.
- Bij leesfouten worden standaarddashboards (`planning`, `ict`) geladen en opnieuw weggeschreven.
- Schrijven valideert altijd vóór persistente opslag.

## Persistence

Zie [platform-002.md](./platform-002.md). Bestand: `data/dashboards.json` (Docker: `/app/data/dashboards.json`).
