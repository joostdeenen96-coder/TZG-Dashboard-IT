# Servermigratie: lokaal TV-dashboard → centrale productiehost

Documentatie bij de gecontroleerde overstap naar één HTTP-server (poort 8080) via productiebuild en Docker Compose. Bestaande providers en schermen blijven intact.

## 1. Huidige architectuur (vóór migratie)

- **Frontend:** React + TypeScript + Vite + Tailwind (`src/`)
- **Backend:** Express + TypeScript (`server/`), in ontwikkeling gestart met `tsx`
- **Schermen:** `/` (planning), `/ict` (PRTG), `/admin` (beheer)
- **API:** `/api/waterlevels`, `/api/dieselsurcharge`, `/api/news`, `/api/agenda`, `/api/prtg`, `/api/config`, `/api/admin/*`
- **Browser → API:** relatieve paden (`/api/...`), geen hardcoded localhost in de client
- **Bronnen:** PEGELONLINE (Kaub, Ruhrort), HVZ (Maxau), Microsoft Graph/SharePoint (diesel, nieuws, agenda), optioneel PRTG
- **Config:** `config.json` (projectroot), `data/settings.json`, `data/diesel-week.json`, geheimen in `.env`

## 2. Huidige startprocedure (lokaal TV)

1. `release/install-dashboard.bat` → `npm install`, `.env` aanmaken
2. `release/start-dashboard.bat` → API op **43124** (`tsx`), Vite op **3000**, Edge-kiosk op `http://localhost:3000/`
3. ICT-variant: `start-dashboard-ict.bat` → zelfde stack, kiosk op `/ict`

Ontwikkeling: `npm run dev` (concurrently api+vite, Vite **43123**).

## 3. Afhankelijkheden

- Node.js (LTS), npm
- Extern: PEGELONLINE, HVZ, Microsoft Graph/SharePoint, optioneel PRTG
- Packages: express, @azure/identity, react, vite (build), tsx (alleen development)

## 4. Huidige poorten

| Poort | Gebruik |
| --- | --- |
| 43123 | Vite dev / preview |
| 43124 | Express API (tsx) tijdens lokale TV/dev |
| 3000 | Vite op Windows-TV via release-scripts |

## 5. Environment variables

| Variabele | Doel |
| --- | --- |
| `GRAPH_TENANT_ID` | Azure AD-tenant |
| `GRAPH_CLIENT_ID` | App-registratie |
| `GRAPH_CLIENT_SECRET` | Geheim (nooit in image/git/frontend) |
| `PRTG_*` | Optioneel ICT/PRTG |
| `PORT` | HTTP-poort (productie standaard 8080) |
| `NODE_ENV` | `production` in container |
| `APP_ROOT` | Optioneel absoluut pad naar app-root |
| `DATA_DIR` | Optioneel pad naar persistente data |

## 6. Risico’s bij centrale hosting

- Padresolutie: gecompileerde code staat in `dist/server/` → root/data moeten via `APP_ROOT`/`DATA_DIR` kloppen
- Vite als “productieserver” is ongeschikt (dev-tooling, twee processen)
- Secrets mogen niet in de image of clientbundle
- LAN-bereikbaarheid: firewall poort 8080, bind op `0.0.0.0`
- Self-signed PRTG/TLS blijft een lokale netwerkkwestie
- Bestaande Windows-kioskscripts blijven Vite gebruiken tot ze naar de centrale URL wijzen

## 7. Geplande wijzigingen (deze story)

1. Productiebuild: Vite → `dist/client`, `tsc` → `dist/server`
2. Eén Node-proces serveert API + statische frontend + SPA-fallback
3. Standaardpoort **8080**
4. Scripts: `build`, `start`, `test`, `typecheck`
5. `GET /api/health` en `GET /api/health/sources`
6. Docker multi-stage + Compose + volume `./data:/app/data`
7. Persistente config onder `data/` (met fallback op root-`config.json`)
8. Gestructureerde logging zonder secrets
9. Installatie-/update-/backupdocumentatie

**Niet in deze story:** PostgreSQL, multi-tenant, drag-and-drop, auth-vervanging, UI-redesign, provider-herschrijving.
