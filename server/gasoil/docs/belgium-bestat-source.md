# be.STAT bron — Belgische gasolieprijs

## Gekozen historische bron

| Veld | Waarde |
| --- | --- |
| Endpoint | `https://bestat.statbel.fgov.be/bestat/api/views/f8d4c0ce-bec4-4f58-b2a2-4f6b8667ad24/result/JSON` |
| UI | `https://bestat.statbel.fgov.be/bestat/crosstable.xhtml?view=f8d4c0ce-bec4-4f58-b2a2-4f6b8667ad24` |
| Dataset | Officieel tarief van de aardolieproducten in euro (be.STAT / FOD Economie) |
| Productveld | `Product` |
| Productidentifier | `Gasolie verwarming (H0/H7) (vanaf 2000 l) (€/L)` |
| Prijsveld | `Prijs incl. BTW` |
| Datumveld | `Dag` (labels zoals `15sep26`) |
| BTW-status | **inclusief BTW** (geen historische excl.-kolom in deze view) |
| Eenheid | €/L |
| Historisch bereik | ~365 kalenderdagen (rolling window) |

## Aanvullende view (alleen peildatum = laatste publicatiedag)

| Veld | Waarde |
| --- | --- |
| Endpoint | `https://bestat.statbel.fgov.be/bestat/api/views/c42c9c16-9330-437b-9608-13781b795ec1/result/JSON` |
| Prijsvelden | `Prijs excl. BTW`, `Prijs incl. BTW` |
| BTW-status | native excl. + incl. |
| Bereik | alleen de laatst gepubliceerde dag |

## Bewust niet gebruikt als primaire historie

- `ef2a5bfb-a361-47a6-b113-e3df26563404` — “laatste 30 wijzigingen”; mist o.a. `15sep26` wanneer vandaag `21okt26` is.
- Teunesen.nl — uitsluitend testfixtures, nooit runtime.

## Productvalidatie (fixtures, geen runtime)

Teunesen BE 2026-referentieprijzen (ex BTW / 1000 L) vergeleken met H0/H7 vanaf 2000 l via `incl / 1.21 × 1000`:

- Exact: jan–apr, jun–aug, okt, nov (o.a. okt **1262.30**, nov **1294.70**)
- ±0,10 door afronding: mei (1096.40 vs 1096.50), sep (1089.80 vs 1089.90)
- Alternatiefproduct “Gasolie Diesel Verwarming (vanaf 2000 l)” wijkt af van de novemberfixture.

## BTW-conversie

Historische JSON bevat geen excl. BTW. Conversie alleen wanneer native excl. ontbreekt:

1. Voorkeur: `Prijs excl. BTW` uit dagview wanneer peildatum overeenkomt.
2. Anders: `priceExVatPer1000Liters = round(round(incl / VAT_DIVISOR, 4) * 1000, 1)`.

`VAT_DIVISOR` default **1.21** (21% BTW):

- bevestigd door dagview-ratio excl→incl ≈ 1.21 voor H0/H7;
- standaard BTW-tarief aardolieproducten (geen stilzwijgende aanname zonder documentatie);
- configureerbaar via env `GASOIL_BE_VAT_DIVISOR`.

## Peildatumregel

`getReferenceDate(applicableMonth)` → 15e van de vorige kalendermaand.

Geen fallback als de 15e ontbreekt in de officiële dataset → status `unavailable`.
Historische data toont wel systematisch noteringen op de 15e; geen andere publicatieregel bewezen.
