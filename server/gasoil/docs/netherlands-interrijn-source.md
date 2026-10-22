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

1. **Dagelijkse capture** (in-process scheduler in de dashboardcontainer, elke 6u + bij start) haalt Interrijn server-side op en schrijft een **dagobservatie** (`gasoil-days-nl.json` + PostgreSQL `gasoil_day_prices`). Idempotent per `publishedDate`+source. Mislukte fetch verwijdert historie niet.
2. Wanneer de publicatiedatum de **15e** is, wordt automatisch een **immutable maandobservatie** vastgelegd (`sourceType=automatic`).
3. Latere dagelijkse Interrijn-prijzen mogen een vastgezette maand **niet** overschrijven.
4. Geen stille fallback op 14e/16e/dichtstbijzijnde/huidige prijs.
5. Ontbrekende historische peildatums (bijv. november 2026 na late go-live): **manual bootstrap** via Beheer (`sourceType=manual-bootstrap`), met preview + audit `gasoil.monthly_observation_manual_created`. Admin voert alleen peildatum + CBRB €/100L + bronnotitie in — toeslag altijd via ×10 + staffel.

Migraties: `002_gasoil_months.sql`, `003_gasoil_capture.sql`.

Env (optioneel):

- `GASOIL_CAPTURE_ENABLED=0` schakelt de scheduler uit
- `GASOIL_CAPTURE_INTERVAL_MS` (default 6 uur)

### Archief

Het publieke archief vereist registratie/login. Zonder credentials worden **geen** historische prijzen verzonnen.

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
