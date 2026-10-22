# Schepenplanning — authenticated discovery

## TEU-NC-01 LIVE (bekend)

AUTH: **PASS** (Login HTTP 200, TOTP required: no)  
DATASET: **FAIL** (page/formatter GUID werd eerder als dataTypeId gequeried → 404)

Credentials werken. **Authenticatie niet herontwerpen.**

## Bevestigde SPA-route

```
https://planning.teunesen.nl/#/data/page/e339106e-2bc5-4ed9-9295-d722a78eec3f
```

| Identifier | Rol (SPA MainRouter-bewijs) |
| --- | --- |
| `e339106e-2bc5-4ed9-9295-d722a78eec3f` | **page path GUID / formatter.id** — niet automatisch `dataTypeId` |
| sitemap `type: "page"` | component `Dn({ formatterId, pageName })` |
| pad `/data/page/{guid}` | strip `/data/` → route `page/{guid}` |
| `props.formatterId` | laadt formatter; daarna `settings.pluginConfig` (PluginFormatter) |

Query `/api/data/v2/e339106e-…/query` → **404** is consistent met “verkeerde identifier”, niet met auth-falen.  
`GET /api/config/data-types` → **403** is een apart autorisatieprobleem op config-listing.

## Cloud Agent / deze checkout (geen secrets)

AUTH: FAIL  
DATASET: FAIL  

Geen `SHIP_PLANNING_*` in deze runtime. Geen UI gebouwd.

## Discovery-gedrag (na deze update)

1. Auth-flow ongewijzigd.
2. Sitemap-entry voor Schepenplanning / path-GUID → veilige props (`label`, `path`, `type`, `formatterId`, `pageName`, `menuLabel`, `hasSubroutes`, `props`).
3. Formatterobject `id == e339…` of `name == Schepenplanning` → structureel gerapporteerd.
4. **Alleen** `formatter.dataTypeId` (+ nested list/entry formatters) als query-kandidaten — **nooit** `formatter.id` als dataTypeId.
5. Rapport default: `data/ship-planning-discovery.md`; host-leesbare kopie: `ship-planning-discovery.md` (mode 640, owner = script-aanroeper).

## Opnieuw draaien op TEU-NC-01

```sh
git fetch origin feature/schepenplanning-dashboard
git checkout feature/schepenplanning-dashboard
git pull origin feature/schepenplanning-dashboard

docker compose build dashboard
./scripts/ship-planning-discover.sh

# Lees het host-owned rapport (niet het eventuele uid-10001 data-volume bestand):
less ship-planning-discovery.md
```

Beoordeel in het rapport:

- Schepenplanning route / Page/formatter id / Resolved dataTypeId / Resolved query endpoint
- Acceptatie S1–S24
- tomorrow/today filter + veldmapping

Commit **alleen** een gesanitizeerd uittreksel indien nodig; nooit `.env`.  
`ship-planning-discovery.md` staat in `.gitignore`.

## STOP

Geen widget / Admin credentials UI tot S6–S20 PASS (echt dataTypeId + query + mapping).
