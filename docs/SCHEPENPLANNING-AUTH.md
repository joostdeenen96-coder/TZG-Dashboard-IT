# Schepenplanning — authenticated discovery

## TEU-NC-01 LIVE (laatste bekende run)

AUTH: **PASS**  
DATASET: **FAIL**  
dataTypeId: *(niet vastgesteld)*  
tomorrow query: vastgesteld nee  
today query: vastgesteld nee  

Credentials/serviceaccount werken. **Authenticatie niet opnieuw ontwerpen.**

Blokkade (uitsluitend dataset-discovery):

1. Schepenplanning-dataset identificeren (sitemap / data-types / formatters)
2. `dataTypeId` vaststellen
3. Query voor vandaag/morgen (DataFilter) vinden
4. Echte veldmapping vaststellen

Gesanitiseerd live-rapport op de host: `data/ship-planning-discovery.md`  
(niet in Cloud Agent zonder upload; discovery leest dit lokaal als prior hint).

## Cloud Agent / deze checkout (geen secrets)

AUTH: FAIL  
DATASET: FAIL  
dataTypeId:  
tomorrow query: vastgesteld nee  
today query: vastgesteld nee  

Geen `SHIP_PLANNING_*` in deze runtime. Geen UI gebouwd.

## Discovery-uitbreiding (na AUTH PASS)

Auth-flow ongewijzigd (`POST /api/user-access/authenticate` → Bearer → optioneel refresh).

Toegevoegd voor dataset-finding (SPA Tarasa):

| Probe | Doel |
| --- | --- |
| `GET /api/config/data-types` | Volledige typelijst |
| `GET /api/ui-config/sitemap` | Menu → `entityTypeId` / labels |
| `GET /api/ui-config/formatters` | `dataTypeId` + `menuLabel` |
| `GET /api/config/profile-data-types` | Profieltypes |
| Schema + `/flattened` | Attribuutnamen voor datumvelden |
| Query **v1** (`/api/data/{id}/query`) bij numerieke id | SPA `data-url-helpers` |
| Query **v2** bij niet-numerieke id | idem |
| Open query + contentScore | Hoofdstraat/Hoogveld/Venlo/Cuijk e.d. |
| Datumfilters | `EQ "yyyy-mm-dd"` en `BETWEEN [ms,ms]` |

## Opnieuw draaien op TEU-NC-01

Secrets staan lokaal in `.env` en mogen niet gelogd, gecommit of naar de frontend.

```sh
git fetch origin feature/schepenplanning-dashboard
git checkout feature/schepenplanning-dashboard
git pull origin feature/schepenplanning-dashboard

docker compose build dashboard
# of: npm run build

./scripts/ship-planning-discover.sh
```

Alternatieven:

```sh
npm run ship-planning:discover
node dist/server/shipPlanning/discoverAuthenticated.js
```

Docker-only (script doet dit automatisch als host-`dist` ontbreekt):

```sh
docker compose run --rm --no-deps \
  -e SHIP_PLANNING_DISCOVERY_OUT=/app/data/ship-planning-discovery.md \
  -e SHIP_PLANNING_FORCE_DATA_OUT=1 \
  dashboard \
  node dist/server/shipPlanning/discoverAuthenticated.js
```

Na een geslaagde run: beoordeel `data/ship-planning-discovery.md` (of kopie naar `docs/SCHEPENPLANNING-AUTH.md`) op:

- AUTH / DATASET
- dataTypeId + dataTypeName
- tomorrow/today query (exacte filterstring)
- veldmapping + laadplaatsen
- volledige data-types/sitemap-lijst (als DATASET nog FAIL: welke namen/scores)

Commit **alleen** het gesanitizeerde rapport; nooit `.env`. Geen credentials/tokens/username in logs of rapport.

**Let op:** `ship-planning-discover.sh` schrijft bij lokale `dist` naar `docs/SCHEPENPLANNING-AUTH.md`. Bewaar eerst het TEU-live-rapport uit `data/ship-planning-discovery.md` voordat je die docs overschrijft, of zet `SHIP_PLANNING_DISCOVERY_OUT` expliciet.

## STOP

Geen UI tot DATASET PASS met vast `dataTypeId` en werkende dagquery.
