# Schepenplanning

Branch: `feature/schepenplanning-dashboard`  
Bron: planning.teunesen.nl (Tarasa / Simba), server-side.  
Geen credentials in frontend, database, logs of dit document.

## Bewezen datasource

| Item | Waarde |
| --- | --- |
| Auth | `POST /api/user-access/authenticate` met `{ username, password }` |
| TOTP | niet vereist (AUTH PASS, HTTP 200) |
| Route | `#/data/page/e339106e-2bc5-4ed9-9295-d722a78eec3f` |
| Formatter | Readonly schepenplanning |
| formatterType | page |
| componentType | PluginFormatter |
| plugin | `teunesen_plugin` |
| module | `./PlanningScreenReadonly.js` |
| entityTypeId | 255 |
| Query | `POST /api/data/255/query` |

De plugin laadt ritten met:

```text
filter: (laaddatum GEQ <startMs> AND laaddatum LEQ <eindMs>) OR (losdatum GEQ <startMs> AND losdatum LEQ <eindMs>) AND status NEQ "geannuleerd"
pageSize: 999
project: volgorde, ordernummer, laaddatum, losdatum, geplande_hoeveelheid, … laadplaats.zoeknaam, losplaats.naam, product.naam, schip.naam, schip.telefoonnummer_schipper, vervoerder.naam, opmerkingenveld_planning
```

Datumgrenzen zijn Europe/Amsterdam, 00:00:00.000 t/m 23:59:59.000, als epoch-milliseconden. Zowel laaddatum als losdatum, dezelfde OR als de plugin. Geen eigen keuze tussen die twee velden.

## Veldmapping (entity 255)

| Doel | Bron | Opmerking |
| --- | --- | --- |
| sourceOrder | volgorde | expliciete bronvolgorde |
| loadingLocation | laadplaats.zoeknaam | o.a. HOOFDSTRAAT, HOOGVELD(I), GVI CUIJK, TEUNESEN OVERSLAG VENLO, plus elke andere laadplaats van die dag |
| time | laaddatum | plugin toont HH:mm; geen apart tijdveld |
| customer | klant.zoeknaam | |
| unloadingLocation | losplaats.naam | |
| condition | conditie.omschrijving | |
| product | product.naam | |
| quantity | geplande_hoeveelheid | |
| quantityUnit | — | null; de plugin plakt zelf ` t` |
| vessel | schip.naam | |
| orderNumber | ordernummer | detail |
| carrier | vervoerder.naam | detail |
| phoneNumber | schip.telefoonnummer_schipper | detail; niet in logs |
| unloadingDate | losdatum | detail |
| planningRemark | opmerkingenveld_planning | detail |
| sourceUpdatedAt | max editedDate | alleen als het veld in de records staat |

## API

`GET /api/ship-planning?scope=tomorrow`  
`GET /api/ship-planning?scope=today-and-tomorrow`

Antwoord: `{ scope, status, days, retrievedAt }`.  
`status`: `ok` | `stale` | `unavailable` | `disabled`.  
Geen token, refreshToken, wachtwoord, Authorization of sessioncookie.

## Cache

In-process cache, standaard 300 seconden (zelfde orde als de dashboard-refresh).  
Eén tokencache en één query per scope voor alle spelers.  
Bij een storing blijft de laatste geldige planning staan met status `stale`.  
Zonder eerdere geldige response: `unavailable`.  
Uitschakelen in Admin: `disabled`. Een storing maakt `/api/health` niet unhealthy.  
`/api/health/sources` meldt bron `ship-planning` als `healthy` | `stale` | `unavailable` | `disabled`.

## Diagnostiek

```sh
npm run ship-planning:test-query
# of
node dist/server/shipPlanning/testQuery.js
```

Rapporteert recordcount, veldnamen, types en of operationele paden aanwezig zijn. Geen tokens, wachtwoorden of ruwe telefoonnummers.

## Scherm

Alleen het Planning-dashboard. Waterstanden, diesel, gasolie NL/BE, weer (header) en agenda blijven. Wij Teunesen is compacter. Schepenplanning is het brede blok, gegroepeerd per laadplaats in bronvolgorde. Een regel opent een detailpopup.

Weergave: Tomorrow (standaard), TodayAndTomorrow, of Auto. Auto toont vandaag én morgen alleen als beide dagen leesbaar in het 2560×1440-podium passen (schaalt naar 1920×1080, zonder pagina-scroll).
