# Schepenplanning — authenticated discovery

## TEU-NC-01 LIVE

AUTH: **PASS** (Login HTTP 200, TOTP: no)  
Refresh HTTP 401 (`auth.token.missing`) mag worden genegeerd zolang de login-Bearer werkt — auth niet herontwerpen.

Route:

```
#/data/page/e339106e-2bc5-4ed9-9295-d722a78eec3f
```

| Id | Rol |
| --- | --- |
| `e339106e-…` | page / **formatter.id** (PluginFormatter) — **geen** dataTypeId |

## SPA call chain (productiebundels)

1. Sitemap `type:"page"` + `props.formatterId`
2. `Dn({ formatterId })` (MainRouter)
3. Formatter uit `/api/ui-config/formatters`
4. `PluginContext.Ye(pluginConfig)` → URL `.js` → `.t2.js`, `loadRemote(scope/module)`
5. Remote `Formatter` + `tarasaConfiguration`
6. Datasource-queries zitten in de **plugin-module**

Discovery volgt uitsluitend deze keten. Geen generieke formatter-id probing.

## Opnieuw op TEU-NC-01

```sh
git pull origin feature/schepenplanning-dashboard
docker compose build dashboard
./scripts/ship-planning-discover.sh
less ship-planning-discovery.md
```

Beoordeel: volledig formatterobject, `pluginConfig`, plugin-source API-paden, resolved `dataTypeId`, S1–S24.

Host-leesbaar rapport: `ship-planning-discovery.md` (mode 640).  
Data-volume `data/ship-planning-discovery.md` kan uid 10001 blijven — gebruik het host-bestand.

## Productie

De provider gebruikt deze keten en `POST /api/data/255/query`.  
Diagnostiek: `npm run ship-planning:test-query`.  
Geen nieuwe auth. Refresh-401 blijft negeren.
