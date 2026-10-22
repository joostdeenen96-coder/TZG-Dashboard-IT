# Schepenplanning — authenticated discovery

## Cloud Agent / deze checkout

AUTH: FAIL  
DATASET: FAIL  
dataTypeId:  
tomorrow query: vastgesteld nee  
today query: vastgesteld nee  

Geen `SHIP_PLANNING_*` in deze runtime. Geen UI gebouwd.

## TEU-NC-01 (waar `.env` de credentials bevat)

Secrets staan lokaal in `.env` en mogen niet gelogd, gecommit of naar de frontend.

```sh
git fetch origin feature/schepenplanning-dashboard
git checkout feature/schepenplanning-dashboard
git pull origin feature/schepenplanning-dashboard

# Image of dist bijwerken
docker compose build dashboard
# of: npm run build

# Discovery zonder tsx op de host
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

Na een geslaagde run bevat dit bestand (of `data/ship-planning-discovery.md`) het gesanitizeerde rapport met:

- AUTH / DATASET
- dataTypeId
- tomorrow/today query
- veldmapping
- laadplaatsen

Commit **alleen** het gesanitizeerde rapport; nooit `.env`. Geen credentials/tokens/username in logs of rapport.
