# Schepenplanning — integratieanalyse (STOP)

Branch: `feature/schepenplanning-dashboard`  
Bron: https://planning.teunesen.nl/  
Besluit: **STOP** — geen UI.  
TEU-NC-01 live: **AUTH PASS / DATASET FAIL**.  
Route bevestigd: `#/data/page/e339106e-2bc5-4ed9-9295-d722a78eec3f` = **page/formatter id**, niet dataTypeId.  
Open: echte `dataTypeId` uit formatter-config, query, veldmapping — zie `docs/SCHEPENPLANNING-AUTH.md`.

Authenticated discovery (TEU-NC-01, **geen tsx** op de host):

```sh
# na image/build met dist:
npm run ship-planning:discover
# of:
./scripts/ship-planning-discover.sh
# of expliciet:
node dist/server/shipPlanning/discoverAuthenticated.js
```

Docker (als host-`dist` ontbreekt): het script valt terug op  
`docker compose run … node dist/server/shipPlanning/discoverAuthenticated.js`  
met `SHIP_PLANNING_*` uit `.env` via compose.

Rapport: `docs/SCHEPENPLANNING-AUTH.md` of `data/ship-planning-discovery.md`  
(geen credentials/tokens/username in logs of rapport).

## 1. Integratieanalyse

| Vraag | Bevinding |
| --- | --- |
| Applicatie | **Tarasa / Simba** SPA (React + Vite + Module Federation) op Azure Static Website + ASP.NET API |
| Publieke shell | `GET /` → HTML “Tarasa”; assets op same-origin blob |
| Tenant | `GET /api/user-access/application/fromDomain` → `applicationId: 9`, `name: "Teunesen"`, `domainName: "planning.teunesen.nl"`, `primaryLocale: "nl-NL"`, `primaryTimeZone: "Europe/Amsterdam"` |
| Officiële OpenAPI/Swagger | niet publiek (`/swagger`, `/openapi.json` → 404) |
| Schepenplanning-endpoint | **nog niet vastgesteld** — TEU AUTH PASS; dataset/sitemap/query-discovery loopt (`discoverAuthenticated`) |
| Preferentie | JSON/XHR van de pagina zelf (`/api/data` / `/api/data/v2/{id}/query`) — aanwezig in bundles; niet bereikbaar zonder token |

## 2. Authenticatiemethode

| Item | Detail |
| --- | --- |
| Login | `POST /api/user-access/authenticate` |
| Body | `{ "username", "password", "totp" }` |
| Ongeldige login (probe zonder echte credentials) | HTTP **400** `{ "password": "auth.invalidcredentials" }` |
| Tokengebruik | Axios `Authorization: Bearer <token>` (ook SignalR) |
| Refresh | `POST /api/user-access/refresh-token` met `{ applicationRoleId }` → response bevat `token` |
| Logout | `POST /api/user-access/logout` |
| SSO | `ssoProviders: []` voor dit domein (geen Entra/B2C actief op fromDomain) |
| MFA/TOTP | Endpoints aanwezig (`enable-totp*`, `lost-totp`, …). Of het serviceaccount TOTP verplicht is: **onbekend zonder account** |
| API-key | Client kent `add-api-key` / `delete-api-login` — mogelijk beter voor serviceaccount; niet getest |
| Session | Bearer-token + refresh; exacte TTL: **onbekend zonder login** |

**Niet toegestaan / niet gedaan:** CAPTCHA/MFA omzeilen, credentials hardcoden, frontend-login, iframe zonder toestemming.

## 3. Gevonden endpoints (zonder auth)

| Methode | Pad | Auth | Resultaat |
| --- | --- | --- | --- |
| GET | `/api/user-access/application/fromDomain` | nee | 200 JSON tenantmeta |
| POST | `/api/user-access/authenticate` | nee | 405 op GET; POST accepteert JSON |
| GET | `/api/user-access/account-settings` | ja | 401 |
| GET | `/api/live` (SignalR) | ja | 401 |
| GET/POST | `/api/data`, `/api/data/v2/{id}/query` | ja | 404/401 zonder geldig type+token |
| GET | `/api/config` | ? | 500 zonder bruikbare body |

Data-URL helpers in de SPA:

- `/api/data/{id}` of `/api/data/v2/{id}`
- `/api/data/{id}/query` of `/api/data/v2/{id}/query`
- `/api/config/data-types/{id}` of `/api/config/v2/data-types/{id}`

Lijsten gebruiken o.a. `orderBy.field`, `orderBy.dir`, Redux-achtige acties `simba/data/*`.

## 4. Responsevelden schepenplanning

**Niet vastgesteld** (geen login). SPA-contract voor data na auth (uit bundles):

| Item | Detail |
| --- | --- |
| Query | `POST /api/data/v2/{entityTypeId}/query` |
| Body (bekend) | `filter`, `orderBy` (`field:asc\|desc`), `pageSize` (default 50), `continuationToken`, `join`, `project` |
| Filtertaal | Simba `DataFilter`: `field EQ "…"`, `AND`/`OR`, `BETWEEN`, `IN`, … |
| Schema | `GET /api/config/v2/data-types/{id}` |
| Aggregate | `POST /api/data/v2/{id}/aggregate`, `POST /api/data/v2/aggregate-batch` |
| Live | SignalR `/api/live` |

Nog te bepalen na AUTH PASS: welk `entityTypeId` = Schepenplanning; welk filterveld = laad-/plandatum (`EQ` ymd en/of `BETWEEN` ms); bronvolgorde; laadplaatsgroepering; echte veldnamen. Numerieke ids gebruiken `/api/data/{id}/query` (v1), niet v2.

## 5. Ontbrekende technische toegang

1. **Dedicated serviceaccount** (geen persoonlijk medewerkersaccount) met leesrechten op schepenplanning.
2. Bij voorkeur: **API-key** óf password **zonder** interactieve MFA; anders TOTP-secret voor het serviceaccount.
3. Bevestiging welke laadplaatsen/dataType de planning gebruikt (Hoofdstraat, Hoogveld, Venlo, Cuijk + dynamische groeves).
4. Optioneel: korte sessieopname / network HAR na login (zonder wachtwoord in screenshots) om exacte XHR vast te leggen.

Zonder dit: geen betrouwbare genormaliseerde feed → **geen widget-implementatie**.

## 6. Credentialsopslag (gepland, nog niet gebouwd)

Bestaande secretpatronen in TZG:

- Graph/PRTG: environment + `data/settings.json` met `*Set`-flags naar frontend;
- Adminwachtwoord: scrypt-hash in `settings.json`;
- Logs: sanitization in `server/log.ts`.

Voor schepenplanning (wanneer hervat):

- wachtwoord/API-key **niet** in `settings_json` / leesbare PG-kolom;
- env of versleutelde server-side secret file; encryptiesleutel buiten Git/PG;
- Admin UI: “Credential ingesteld”; nooit plaintext terug;
- audit zonder geheime waarden;
- Test verbinding: veilige status + request-ID.

## 7–10. API / cache / layout

Nog niet geïmplementeerd (STOP). Concept blijft zoals in de feature-eis:

- `GET /api/ship-planning?scope=tomorrow|today-and-tomorrow`
- status `ok|stale|unavailable|disabled` + health source
- Auto-layout: morgen verplicht; vandaag alleen als leesbaar

## 11. Screenshots

Geen authenticated Planning-screenshots (geen credentials). Geen loginpoging met echte of geraden accounts.

## 12. Gewijzigde bestanden (deze PR)

- `docs/SCHEPENPLANNING.md` (dit document)
- `server/shipPlanning/shipPlanningAcceptance.test.ts` (SP1–SP40 scorecard; live = NIET GETEST)
- `package.json` (testsuite)

## 13. Acceptatie SP1–SP40

Zie testoutput / PR. Live auth/data = **NIET GETEST**. Structurele STOP-documentatie = PASS waar van toepassing.

## 14. Niet getest

Alles wat login, dataType-discovery, normalisatie, widget, Admin-sectie, cache, player en regressie-UI vereist.

## 15. Risico’s

- TOTP op serviceaccount blokkeert headless refresh.
- `dataTypeId` kan wijzigen bij Tarasa-configuratie.
- Zonder dedicated account dreigt hergebruik van persoonlijke credentials (afgewezen).
- HTML-scrape is fragiel; vermijden zolang `/api/data/v2/.../query` beschikbaar is na auth.

## 16. Update-instructie TEU-NC-01

1. Zet in `/pad/naar/repo/.env` (niet in Git):
   - `SHIP_PLANNING_USERNAME`
   - `SHIP_PLANNING_PASSWORD`
   - optioneel `SHIP_PLANNING_TOTP_SECRET`
2. Checkout `feature/schepenplanning-dashboard`, build dashboard-image of lokale `dist`:
   - `docker compose build dashboard` **of** `npm run build`
3. Discovery (geen UI):
   - `./scripts/ship-planning-discover.sh`
4. Beoordeel `docs/SCHEPENPLANNING-AUTH.md` / `data/ship-planning-discovery.md`  
   (AUTH/DATASET/dataTypeId/mapping). Commit alleen het **gesanitizeerde** rapport.
5. Pas daarna widget/provider ontwerpen — niet eerder.
