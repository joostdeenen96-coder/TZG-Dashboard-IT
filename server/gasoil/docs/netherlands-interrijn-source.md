# Interrijn / CBRB — Nederlandse gasolieprijs

## Runtimebron

| Veld | Waarde |
| --- | --- |
| Homepage | `https://www.interrijn.com/nl/` |
| Archief | `https://www.interrijn.com/nl/gasolieprijzen-archief/` (loginwall publiek) |
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

De homepage-dagprijs mag **alleen** gebruikt worden wanneer de publicatiedatum exact de peildatum (15e) is.

Historische peildatums: bij voorkeur Interrijn-archief. Zonder archieftoegang → fail-closed (geen verzonnen dagprijs).

## Business acceptance fixtures (tests only)

Teunesen-referentie (niet runtime):

| Maand | Peildatum | €/1000L ex BTW | Toeslag |
| --- | --- | --- | --- |
| okt 2026 | 2026-09-15 | 1686.50 | €2,00 |
| nov 2026 | 2026-10-15 | 1642.60 | €1,90 |

Deze bedragen worden niet gehardcode als actuele runtimewaarde.

## Verboden runtimebronnen

- Teunesen.nl
- be.STAT
- mock/hardcoded maandprijzen of toeslagen
