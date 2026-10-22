# Maxau voorspellingslijn — brononderzoek (STOP)

Branch: `feature/maxau-forecast-line`  
Doel: Maxau dezelfde voorspellende grafieklijn geven als Kaub/Ruhrort, uitsluitend op officiële HVZ/LUBW machineleesbare data.

## Besluit

**STOP — geen betrouwbare machineleesbare HVZ/LUBW-forecastbron gevonden.**

- De bestaande Maxau-actuele waterstand blijft ongewijzigd (HVZ `hvz_peg_stmn.js` / `dat-peg-tmv.js`).
- Er is **geen** forecastparsing, geen OCR, geen GIF-pixelanalyse, en geen verzonnen forecastpunten toegevoegd.
- `GET /api/waterlevels` → `maxau.forecast` blijft `[]`; `forecastError` blijft `null` (geen PEGELONLINE-`WV` voor Maxau).
- Runtime-forecastcriteria (M4–M9, M18–M23, M34 forecastdeel): **NIET GETEST** / niet geïmplementeerd.
- Automatisch mergen is niet aan de orde.

HVZ labelt meetdata op de peilpagina als **"Ungeprüfte Rohdaten!"**.

## Analyse bestaande implementatie

| Onderdeel | Bevinding |
| --- | --- |
| 1. Bron Kaub | PEGELONLINE REST v2, UUID `1d26e504-7f9e-480a-b52c-5932be6549ab`, tijdreeksen `W` + `WV` |
| 2. Bron Ruhrort | PEGELONLINE REST v2, UUID `c0f51e35-d0e8-4318-afaf-c5fcbc29f4c1`, `W` + `WV` |
| 3. Forecastvelden | `forecast: WaterForecastPoint[]` met `kind: "verwacht" \| "inschatting"`; `forecastError` |
| 4. Grafiek | `src/components/WaterChart.tsx` — meetlijn `stroke-water`, verwachting gestippeld `stroke-gold`, inschatting `stroke-mist` |
| 5. Maxau-bron (actueel) | HVZ `js/hvz_peg_stmn.js` pegel `09016` + `js/dat-peg-tmv.js`; serie via PEGELONLINE `W` UUID `b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea` |
| 6. Maxau-response | Zelfde `WaterStationResult`; `forecast: []`, `forecastError: null` |
| 7. Ontbrekend | Machineleesbare forecastpunten voor Maxau |
| 8. Minimale wijziging | Alleen mogelijk na officiële JSON/CSV/XML-feed; die is niet beschikbaar → geen codepad |

Frontend praat alleen met `/api/waterlevels` (`src/services/waterLevelService.ts`). Geen directe HVZ-call vanuit React.

Optioneel bestaat al `GET /api/waterlevels/maxau/graph` → proxy van het HVZ-GIF `gifs/09016-2001.GIF`. Dat is **geen** machineleesbare forecastfeed en wordt **niet** gebruikt voor de Planning-lijn.

## Officieel HVZ-onderzoek (pegel 09016)

Pagina: `https://www.hvz.baden-wuerttemberg.de/pegel.html?id=09016`  
Station: Maxau / Rhein · Pegel-ID `09016`

### Hoe "Vorhersage" wordt gevuld

- UI-tab roept `HVZ_Site.PEG_Win(2)` aan.
- `js/mgr_peg.js` (`PEG_FilterV`) bouwt alleen een `<img src="… .GIF">`.
- Geen XHR/fetch naar JSON/XML/CSV voor Vorhersage.

| Item | Waarde |
| --- | --- |
| Endpoint | `GET https://www.hvz.baden-wuerttemberg.de/gifs/09016-2001.GIF` |
| HTTP-methode | GET |
| Parameters | geen (station in bestandsnaam `09016`) |
| Stationidentifier | `09016` |
| Responseformaat | `image/gif` (~18 KB), signature `GIF` |
| Timestampveld | niet machineleesbaar |
| Waterstandsveld | niet machineleesbaar |
| Eenheid | niet machineleesbaar (grafiekbeeld) |
| Timezone | niet machineleesbaar |
| Forecast horizon | alleen visueel in GIF |
| Meting vs forecast | alleen via UI-tab / aparte GIF’s |
| Kwaliteit/status | HTML-disclaimer "Ungeprüfte Rohdaten!" |

Gerelateerde GIF’s gecontroleerd: `-2002` 200; `-2003`/`-2004` 404; meet-GIF’s `-140`/`-340` 200.

### Machineleesbare paden (allemaal geen forecastfeed)

Werkend (actueel/historisch, **geen** forecast):

- `js/mgr_peg.js`, `js/hvz_peg_stmn.js`, `js/dat-peg-tmv.js`, `js/dat-peg-pic.js` → 200

404 of onbruikbaar o.a.:

- `js/dat-peg-vhs.js`, `dat-peg-vw.js`, `dat-peg-fc.js`, `dat-peg-vor.js`, `dat-peg-whm.js`, `dat-peg-series.js`, `hvz_peg_vhs.js`
- `data/09016.json`, `data/pegel/09016.json`, `data/vorhersage/09016.json`
- `php/getPegel.php?id=09016`, `php/getVorhersage.php?id=09016`
- `fsk/files/data/xml/hvz.xml`
- `gifs/09016-2001.{dat,csv,json,xml}`
- `new/gifs/VW_RHB_MAXAU.GIF`
- directory listing `gifs/` → 403

PDF `pdf/Hinweise-WHM-Vorhersage.pdf` → 200 (documentatie, geen API).

In `hvz_peg_stmn.js` staan flags `POS_FVW`/`POS_FVQ` = 1 voor Maxau (Vorhersage W/Q “aan”), maar de UI laadt alsnog alleen GIF’s.

### PEGELONLINE / andere officiële probes

| Probe | Resultaat |
| --- | --- |
| PEGELONLINE Maxau `…/WV/measurements.json` | **404** `Timeseries does not exist.` |
| Beschikbare Maxau-tijdreeksen | alleen `W` en `Q` |
| `hochwasserzentralen.de/api/v1/stations/MAXAU` | 404 |
| ELWIS Maxau-pagina | 200, geen numerieke forecastfeed |
| LUBW rips-u | geen bruikbare forecastfeed gevonden |

## Wat bewust niet is gedaan

- OCR / pixelanalyse van `09016-2001.GIF`
- Browser-side scraping vanuit React
- Verzonnen of geschatte forecastwaarden
- Niet-officiële weers- of waterstandsproviders
- Functionele wijzigingen aan Kaub, Ruhrort, diesel, gasolie, weer, ICT, NGINX, certificaten, PostgreSQL

## Update-instructie TEU-NC-01

Geen runtime-deploy nodig voor deze branch zolang forecast niet geïmplementeerd is (geen gedragswijziging t.o.v. main voor Maxau-lijn).

Wanneer HVZ/LUBW later een machineleesbare forecast publiceert:

1. Documenteer endpoint, methode, velden, eenheid, timezone en horizon in dit bestand.
2. Breid `MaxauProvider` / HVZ-provider server-side uit; vul `forecast` met echte punten in cm.
3. Hergebruik `WaterChart` en bestaande overgangslogica; frontend blijft alleen `/api/waterlevels` aanroepen.
4. Behoud actuele meting bij forecastfout; stale-cache volgens bestaande waterstandscache.
5. Herhaal acceptatie M1–M34 met live HVZ-data; markeer forecastcriteria alleen PASS met echte punten.
6. Deploy via bestaande Docker Compose-flow op TEU-NC-01 (`docker compose build dashboard && docker compose up -d dashboard`).

## Acceptatie (samenvatting)

Zie PR-beschrijving en `server/providers/maxauForecastAcceptance.test.ts` voor M1–M34.

Forecastimplementatie: **niet uitgevoerd** na STOP.
