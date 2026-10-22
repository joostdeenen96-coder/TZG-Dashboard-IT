# Interrijn / CBRB — Nederlandse gasolieprijs

## Runtimebron

| Veld | Waarde |
| --- | --- |
| Homepage | `https://www.interrijn.com/nl/` |
| Archief | `https://www.interrijn.com/nl/gasolieprijzen-archief/` (**loginwall** publiek) |
| Label | `CBRB/KBN via Interrijn` |
| Widget | `table.gas-levels` / `GASOLIEPRIJS (€/100L CBRB)` |
| Eenheid | €/100L CBRB |
| Conversie | `priceExVatPer1000Liters = pricePer100Liters × 10` (geen BTW-correctie) |

## BTW (business confirmation)

De CBRB/KBN-prijs die Interrijn publiceert is voor Teunesen de officiële NL-basis en wordt behandeld als **exclusief BTW**.

Production default:

`GASOIL_NL_CBRB_VAT_STATUS=ex-vat`

## Maandlogica

Peildatum = 15e van de vorige maand → toepassingsmaand.

| Peildatum | Toepassingsmaand |
| --- | --- |
| 15 september | oktober |
| 15 oktober | november |
| 15 november | december |

Vanaf de 15e (Europe/Amsterdam) toont het dashboard de **volgende** toepassingsmaand.

De homepage-dagprijs mag **alleen** als peildatumprijs worden gebruikt wanneer de publicatiedatum exact de 15e is.

## Persistentie (productie)

Interrijn toont voortdurend actuele dagprijzen. Het dashboard moet een hele maand dezelfde vastgestelde toeslag tonen.

Daarom:

1. Elke succesvolle homepage-parse schrijft een **dagobservatie** (`gasoil-days-nl.json` + optioneel PostgreSQL `gasoil_day_prices`) met `publishedDate` uit de bron.
2. Zodra er een geldige prijs voor peildatum 15e beschikbaar is (archief of day-history of exacte homepage-match), wordt een **immutable maandobservatie** geschreven (`gasoil-months-nl.json` + PostgreSQL `gasoil_month_observations`).
3. Latere dagelijkse Interrijn-prijzen mogen een vastgezette maand **niet** overschrijven.
4. De volgende peildatum (volgende 15e) maakt een nieuwe `applicableMonth`.

Migratie: `server/db/migrations/002_gasoil_months.sql`.

### Archief

Het publieke archief vereist registratie/login. Zonder credentials worden **geen** historische prijzen verzonnen. Oktober 2026 business-acceptance blijft dan **NIET GETEST** tot er een echte peildatumobservatie is vastgelegd.

## Business acceptance fixtures (tests only)

Teunesen-referentie (niet runtime):

| Maand | Peildatum | €/1000L ex BTW | Toeslag |
| --- | --- | --- | --- |
| okt 2026 | 2026-09-15 | 1686.50 | €2,00 |
| nov 2026 | 2026-10-15 | 1642.60 | €1,90 |

Rekenfixture (niet hardcoden als runtime):

`163.55 €/100L × 10 = 1635.50 → staffel €1625–€1649,99 → €1,90 / ton`

## Verboden runtimebronnen

- Teunesen.nl
- be.STAT
- mock/hardcoded maandprijzen of toeslagen
