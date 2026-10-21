# Interrijn / CBRB — Nederlandse gasolieprijs

## Runtimebron

| Veld | Waarde |
| --- | --- |
| Homepage | `https://www.interrijn.com/nl/` |
| Archief-URL | `https://www.interrijn.com/nl/gasolieprijzen-archief/` |
| Machineleesbare feed | **Geen** publieke gasolie-API; WP REST (`wp/v2/pages`) bevat de widget niet; geen custom `wp-json` gasolie-route |
| Extractie | HTML-sectie `table.gas-levels` (laatste optie per preferentievolgorde) |

## Live HTML-structuur (gevalideerd 2026-10-21)

1. Sectie: `<caption>…GASOLIEPRIJS (€/100L CBRB)…</caption>` in `table.gas-levels`
2. Eenheid: caption + `<span class="wt-info">€/100L CBRB | <time …>`
3. Prijsveld-label: `<tr class="gass-price">` → `<span>Prijs</span>` (sr-only)
4. Actuele prijs: `<div class="gas-arrow" data-level="…">` + sibling `<span class="wt-centered">€ …</span>`
5. Publicatie: `<time datetime="DD-MM-YY HH:MM">` in `.wt-info` onder de tabel
6. Prijsstijging/daling: aparte `<tr class="gas-difference">` — **nooit** als prijs gebruiken

## Archief

- Pagina is HTTP-bereikbaar maar toont een **login/registratie-wall**.
- Geen publieke historische CBRB-rijen zonder account.
- Geen Teunesen.nl als vervanging.

## BTW-status

Op de publieke homepage én achter de archief-loginwall (zonder credentials) is **niet** aantoonbaar of de CBRB-prijs exclusief of inclusief BTW is:

- geen “excl. BTW” / “incl. BTW” bij de gasolie-widget;
- geen gestructureerd VAT-veld in JSON.

**Conclusie runtime:** `vatStatus = unknown`.

Daardoor:

- geen productie-toeslag;
- `GET /api/gasoil-surcharges` → NL `status: unavailable`;
- health `interrijn-cbrb` → `unavailable` (niet `healthy`);
- NL9 = **NIET GETEST**.

Optionele override alleen na aantoonbare bronbewijslast:

`GASOIL_NL_CBRB_VAT_STATUS=ex-vat` (of `incl-vat` — incl. vereist eerst gedocumenteerde conversie; nog niet geïmplementeerd).

## Eenheidsconversie (alleen bij bewezen ex-BTW)

`priceExVatPer1000Liters = pricePer100Liters * 10`

Voorbeeld ter controle van de eenheid (niet hardcoden als productieprijs):

`163.55 €/100L → 1635.50 €/1000L`
