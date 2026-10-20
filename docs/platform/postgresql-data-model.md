# PostgreSQL-datamodel

Migraties staan in `server/db/migrations` en worden bijgehouden in `schema_migrations`. Ze draaien via `npm run db:migrate` of het container-entrypoint, niet vanuit gewone API-requests.

Op een lege productiedatabase seeden het entrypoint en `node dist/server/scripts/db-seed.js` daarna de organisatie Teunesen en de ontbrekende standaarddashboards planning/ict uit `server/dashboards/seed.ts`. Bestaande rijen worden niet overschreven. `tsx` is in de productie-image niet aanwezig.

## Tabellen

### organizations

| Kolom | Type |
| --- | --- |
| id | uuid PK |
| name | text |
| slug | text unique |
| created_at / updated_at | timestamptz |

Standaardrij: Teunesen, slug `teunesen`, vaste uuid `11111111-1111-4111-8111-111111111111`.

### dashboards

| Kolom | Type |
| --- | --- |
| id | uuid PK |
| organization_id | uuid FK |
| name, slug, description | text |
| enabled | boolean |
| theme_json | jsonb |
| layout_json | jsonb (preset, stageWidth, stageHeight; nodig voor de bestaande TV-layouts) |
| created_at / updated_at | timestamptz |

Uniek: `(organization_id, slug)`.

### dashboard_widgets

| Kolom | Type |
| --- | --- |
| id | uuid PK |
| dashboard_id | uuid FK cascade |
| type, title | text |
| enabled | boolean |
| position | integer (sorteervolgorde) |
| layout_json | jsonb (area, width, row, column, span) |
| data_source_json | jsonb |
| settings_json | jsonb |
| refresh_interval_seconds | integer |
| created_at / updated_at | timestamptz |

Index op `dashboard_id`.

### screens

| Kolom | Type |
| --- | --- |
| id | uuid PK |
| organization_id | uuid FK |
| dashboard_id | uuid FK nullable, ON DELETE SET NULL |
| name, slug, location | text |
| enabled | boolean |
| last_seen_at | timestamptz nullable |
| created_at / updated_at | timestamptz |

Uniek: `(organization_id, slug)`. Index op `dashboard_id` en `last_seen_at`.

### screen_tokens

| Kolom | Type |
| --- | --- |
| id | uuid PK |
| screen_id | uuid FK cascade |
| token_hash | text unique (SHA-256 hex, nooit het token zelf) |
| expires_at | timestamptz nullable |
| revoked_at | timestamptz nullable |
| created_at | timestamptz |

Index op `screen_id` en `revoked_at`.

### screen_heartbeats

| Kolom | Type |
| --- | --- |
| id | uuid PK |
| screen_id | uuid FK cascade |
| reported_at | timestamptz |
| app_version | text |
| status | text |
| metadata_json | jsonb |

### audit_logs

| Kolom | Type |
| --- | --- |
| id | uuid PK |
| organization_id | uuid FK |
| action | text |
| entity_type | text |
| entity_id | text |
| actor | text |
| details_json | jsonb |
| created_at | timestamptz |

## Verbinding

`pg.Pool` via `DATABASE_URL`. Het wachtwoord en de connection string worden niet gelogd.

## Persistentie

Docker named volume `tzg-postgres` op `/var/lib/postgresql/data`. `data/` blijft het volume voor JSON-export, settings en de importbron `dashboards.json`.
