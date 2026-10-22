# Architectuur planningscherm

Het scherm is opgezet voor 2560×1440 en schaalt naar het venster. De browser praat alleen met onze API. Er gaat geen request naar ELWIS, PEGELONLINE, HVZ of SharePoint.

## Waterstanden

`GET /api/waterlevels` levert altijd de drie stations. Faalt één bron, dan krijgt dat station een `error` en blijven de andere stations gevuld. Er worden geen stille testdata ingevuld.

```json
{
  "kaub": {
    "id": "kaub",
    "name": "Kaub",
    "river": "Rijn",
    "levelCm": 19,
    "changeCm": -2,
    "trend": "dalend",
    "status": "laag",
    "updatedAt": "2026-10-13T16:30:00+02:00",
    "source": "PEGELONLINE",
    "error": null
  },
  "ruhrort": {},
  "maxau": {}
}
```

`ruhrort` en `maxau` hebben dezelfde velden. Een lege `{}` is hier alleen een verkorting in dit document.

| Veld | Betekenis |
| --- | --- |
| `levelCm` | Actuele waterstand in centimeter, afgerond |
| `status` | `laag`, `normaal` of `hoog` |
| `trend` | `stijgend`, `dalend` of `gelijk`, afgeleid van `changeCm` |
| `changeCm` | Verschil met de waterstand van ongeveer een dag eerder, in cm |
| `updatedAt` | Tijdstip van de actuele meting, ISO 8601 met offset |
| `source` | Naam van de bron |
| `series` | Uitgedunde meetreeks van de laatste vier dagen, `{ timestamp, levelCm }` |
| `forecast` | PEGELONLINE-tijdreeks `WV`: `kind` is `verwacht` of `inschatting` |
| `forecastError` | `null` als de verwachting geladen is, anders een tekst. De actuele stand blijft staan |
| `graphPath` | `null`. De kaarten tekenen zelf de donkere grafiek uit `series` en `forecast` |
| `error` | `null` bij een geslaagde meting, anders een tekst en lege getallen |

`useWaterLevels()` in `src/services/waterLevelService.ts` leest alleen `/api/waterlevels` en zet het object om naar de drie kaarten. Een station met `error` toont de fout op die kaart.

### Providers

`WaterLevelProvider` heeft `getCurrentData()`. De route en de frontend kennen de bron niet. Welke klasse een station vult, staat op één plek: `server/services/waterLevelService.ts`.

| Station | Provider | Bron | Live |
| --- | --- | --- | --- |
| Kaub | `KaubProvider` | PEGELONLINE, kortnaam `KAUB` | ja |
| Ruhrort | `RuhrortProvider` | PEGELONLINE, kortnaam `DUISBURG-RUHRORT` | ja |
| Maxau | `MaxauProvider` | HVZ Baden-Württemberg, pegel `09016` | ja |

### Kaub en Ruhrort — ELWIS / PEGELONLINE

ELWIS toont deze peilen, maar heeft geen eigen meet-API. De officiële REST-API is PEGELONLINE versie 2, zonder sleutel:

`https://www.pegelonline.wsv.de/webservices/rest-api/v2/`

Bevestigde stations op water `RHEIN`, tijdreeks `W` (Wasserstand Rohdaten), eenheid `cm`:

| Kortnaam | UUID | Kaart |
| --- | --- | --- |
| `KAUB` | `1d26e504-7f9e-480a-b52c-5932be6549ab` | Kaub |
| `DUISBURG-RUHRORT` | `c0f51e35-d0e8-4318-afaf-c5fcbc29f4c1` | Ruhrort |

Per station twee JSON-aanroepen, geen HTML:

- `GET /stations/{uuid}/W.json?includeCurrentMeasurement=true` — actuele waarde, tijdstip en `stateMnwMhw`
- `GET /stations/{uuid}/W/measurements.json?start=P4D` — ruwe reeks van de laatste vier dagen, uitgedund tot de grafiek
- `GET /stations/{uuid}/WV/measurements.json` — waterstandverwachting. `forecast` wordt `verwacht`, `estimate` wordt `inschatting`. Faalt deze reeks, dan blijft de actuele stand staan en vult `forecastError`

Het verschil is de actuele centimeter minus de meting die het dichtst bij 24 uur eerder ligt. Ligt die meting meer dan 90 minuten van dat tijdstip af, dan faalt het station. `stateMnwMhw` wordt `low` → `laag`, `normal` → `normaal`, `high` → `hoog`. Andere toestanden (`unknown`, `commented`, `out-dated`) worden een fout, geen verzonnen status.

### Maxau — HVZ Baden-Württemberg

HVZ publiceert geen REST- of JSON-API voor de actuele waterstand. Gecontroleerd: `pegel.html`, losse paden als `php/getPegel.php`, `data/pegel.json` en `fsk/files/data/xml/hvz.xml` geven geen dataset. De HTML-pagina wordt niet gescrapet.

De publieke dataset die de HVZ-site zelf ververst, bestaat uit twee gestructureerde bestanden:

- `https://www.hvz.baden-wuerttemberg.de/js/hvz_peg_stmn.js` — actuele waterstand van pegel `09016` Maxau, eenheid `cm`, plus MNW (index 43) en de laagste hoogwaterstand (index 30)
- `https://www.hvz.baden-wuerttemberg.de/js/dat-peg-tmv.js` — dagwaarde (Tagesmittel) van de vorige kalenderdag, sleutel `9016`

`changeCm` is de actuele centimeter minus die dagwaarde. De dagwaarde moet op de kalenderdag vóór de meting staan. Status volgt dezelfde grenzen als PEGELONLINE: op of onder MNW is `laag`, op of boven de laagste hoogwaterstand is `hoog`, daartussen `normaal`. Ontbreekt een van die getallen, of staat de waterstand niet in centimeter, dan faalt Maxau.

De kaart tekent dezelfde donkere grafiek als Kaub en Ruhrort. De lijn komt uit de PEGELONLINE-tijdreeks `W` van station `b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea`, de laatste vier dagen, uitgedund tot 48 punten. De actuele centimeter, status en daggemiddelde blijven van HVZ. PEGELONLINE heeft voor Maxau geen tijdreeks `WV`, dus de kaart toont geen verwachtingscijfers en geen fouttekst daarover. Faalt de reeks, dan blijft de HVZ-stand staan en is `series` leeg.

HVZ toont op de peilpagina een tab **Vorhersage**, maar vult die alleen met een GIF (`gifs/09016-2001.GIF` via `mgr_peg.js`). Er is geen machineleesbare HVZ/LUBW-forecastfeed gevonden (JSON/XML/CSV/XHR). Daarom blijft `maxau.forecast` leeg; er wordt geen forecast verzonnen en geen OCR op de GIF toegepast. Details: `docs/MAXAU-FORECAST.md`. HVZ labelt de data als "Ungeprüfte Rohdaten!".

## Dieseltoeslag

`DieselSurchargeProvider` heeft `getCurrentData()`. De registratie staat in `server/services/dieselSurchargeService.ts`. Standaard is SharePoint actief:

```ts
const activeDieselSource: DieselSource = "sharepoint";
```

`SharePointDieselProvider` leest de lijst uit `config.json`: standaard `Dieseltoeslagen Asvervoer` op `https://teunesen.sharepoint.com/sites/Facturatie`. Die waarden wijzigt het verborgen beheer op `/admin`. De tenant blijft `ca0e0118-1eb1-4661-bd22-8ca64479f1d3`. Het record met `Actief = true` is de actuele toeslag. Bij meerdere actieve records wint de laatste peildatum. `weken` bevat hoogstens de laatste vier ISO-weken uit de lijst, chronologisch, één record per week (de laatste peildatum in die week). Ontbreken er weken, dan blijven die weg. Er worden geen percentages bijverzonnen.

De dieselkaart toont die vier weken als blokken, nieuwste bovenaan. Het weeknummer op een blok is de ISO-week van de maandag na de peildatum, zodat peildatum 7 oktober als week 42 verschijnt. De lijst wordt één keer per ochtend gelezen. Een venster begint om 07:00 Amsterdam-tijd. Tot de volgende ochtend komt `GET /api/dieselsurcharge` uit `data/diesel-week.json`. Het scherm vraagt de API elke paar minuten; de eerste aanvraag na 07:00 leest SharePoint. Dat bestand blijft lokaal.

De dieselkaart gebruikt die lijst via Microsoft Graph. `server/services/graphClient.ts` haalt het token op met `ClientSecretCredential` uit `@azure/identity` (client credentials, geen gebruikerslogin). De variabelen zijn `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` en `GRAPH_CLIENT_SECRET`, zie `.env.example`. Ontbreken ze, of weigert Graph de lijst, dan valt de service terug op de bewaarde week of op de mock. Het token wordt hergebruikt tot het verloopt.

Faalt Graph (ontbrekende variabelen, token, site, lijst of geen actief record) en er is nog geen ochtendcache, dan logt de service de fout en valt terug op `MockDieselProvider`. Die fallback blijft de laatste lokale cijfers: peildatum 2026-10-13, toeslag 12,4 procent, actief. Er is geen dieselprijs in die fallback (`dieselPrijs` is 0). `weken` bevat dan alleen die ene bekende week. Bestaat de cache wel, dan blijft die staan.

`GET /api/dieselsurcharge` geeft:

```json
{
  "peildatum": "2026-10-13",
  "dieselPrijs": 0,
  "toeslagPercentage": 12.4,
  "actief": true,
  "weken": [
    {
      "peildatum": "2026-10-13",
      "dieselPrijs": 0,
      "toeslagPercentage": 12.4,
      "actief": true
    }
  ]
}
```

`src/services/dieselService.ts` leest alleen dat pad. Componenten en `dashboardService` importeren geen dieselprovider.

## Wat live is en wat nog mock

| Gegeven | Herkomst | Status |
| --- | --- | --- |
| Kaub, Ruhrort | PEGELONLINE via onze API | live |
| Maxau | HVZ-dataset via onze API | live |
| Dieseltoeslag | SharePoint via Microsoft Graph, mock alleen bij een Graph-fout | live zodra de Graph-variabelen gezet zijn |
| Weer | `src/services/dashboardService.ts` | mock, klein in de balk links van de klok. Plaatsnaam via `/admin` |
| WijTeunesen-nieuws | `GET /api/news`, site `https://teunesen.sharepoint.com/sites/wt-nieuws` | nieuwspagina's met `PromotedState` 2 en `Nieuws taal` NL, de laatste vijftien van de hele site, inclusief Lief en leed. De categorie staat klein bij de titel. Het vlak wisselt elke 20 seconden. Een foto gaat via `GET /api/news/:id/image`. Zonder Graph-gegevens toont het scherm voorbeeldtekst |
| WijTeunesen-agenda | `GET /api/agenda`, site `https://teunesen.sharepoint.com/sites/HR-NL`, lijst Gebeurtenissen | komende Nederlandse afspraken, dezelfde bron als het webpart “Belangrijke data” op de WijTeunesen-startpagina. De lege kalender op wt-nieuws en de Duitse lijst Events DE worden niet gelezen. De onderbalk toont ze naast elkaar |

## ICT-scherm en PRTG

`/` blijft het planningsscherm. `/ict` deelt Header, nieuws en agenda, maar vervangt waterstanden en dieseltoeslag door PRTG-monitoring. De browser praat alleen met `GET /api/prtg`.

```json
{
  "connected": false,
  "configured": false,
  "filterReady": false,
  "source": "PRTG",
  "fetchedAt": null,
  "error": "PRTG niet gekoppeld",
  "alarms": [],
  "servers": []
}
```

| Veld | Betekenis |
| --- | --- |
| `alarms` | Actuele Warning, Down, Unusual, Down (partial) en bevestigde storingen (`downAcknowledged`) |
| `servers` | Per apparaat cpu, geheugen en opslag met percentage en PRTG-status |
| `configured` | `true` als `PRTG_BASE_URL` en `PRTG_PASSHASH` gezet zijn |
| `filterReady` | `true` als `config.json` → `prtg.groupId` of `prtg.tag` gezet is |
| `error` | Lege of fouttekst; bij een latere fout blijft de laatste geslaagde payload staan |

De provider leest PRTG `table.json` ongeveer eens per minuut. Sensortypes voor cpu, geheugen en schijf worden uit type, naam of tag herkend. Credentials komen uit `.env` en worden niet gelogd of naar de browser gestuurd. Zonder filter blijft de response leeg: er worden geen sensoren van het hele netwerk getoond.

## Permanent scherm

`createPollingFeed` in `src/services/tvFeed.ts` haalt waterstanden, dieseltoeslag, nieuws, agenda en op `/ict` ook PRTG op. Het interval komt uit de schermconfiguratie en is standaard 300 seconden. Een mislukte oproep bewaart de laatste geslaagde response in `localStorage` en plant een nieuwe poging na 5, 15, 30 en daarna 60 seconden. `online` start meteen opnieuw. De balk toont “Vernieuwen” zolang een feed loopt, en “Laatste update” of “Laatste bekende gegevens” met het tijdstip van de laatste geslaagde leesactie.

Elke tegel zit in `WidgetBoundary`. Een renderfout blijft op die tegel. `ScreenGuard` houdt de achtergrond donker als de pagina zelf stopt. Logregels gebruiken het voorvoegsel `[teunesen-tv]`.
