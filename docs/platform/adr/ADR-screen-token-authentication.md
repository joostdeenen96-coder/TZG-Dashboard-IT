# ADR — Screen-token authenticatie

## Status

Aangenomen (PLATFORM-003).

## Context

Elke TV heeft een eigen player-URL nodig zonder gebruikerssessie en zonder Graph- of databasegegevens in de browser.

## Besluit

- Token: `tzg_` + 32 cryptografisch willekeurige bytes (base64url).
- Opgeslagen waarde: SHA-256-hex van het volledige token. Het token is niet terug te rekenen.
- Een hoog-entropietoken maakt SHA-256 hier passend; het token wordt niet uit een kort wachtwoord afgeleid.
- Het plaintext-token wordt één keer in de admin-UI getoond en daarna niet meer door de API teruggegeven.
- Intrekken zet `revoked_at`. Vernieuwen trekt het oude token in en maakt een nieuw token.
- De player stuurt het token alleen als `Authorization: Bearer`.
- Logs redacten `Bearer`, `postgresql://`, `tzg_…` en wachtwoordvelden.
- `index.html` zet `referrer` op `no-referrer` zodat de token-URL niet meelekt.

## Risico's

- De token staat in de player-URL (geschiedenis op het apparaat, schouderkijken). Dat is de gekozen player-route; het apparaat is het scherm zelf.
- Wie het token heeft, kan de publieke dashboardconfiguratie ophalen tot het token wordt ingetrokken. Er zitten geen Graph-secrets in dat antwoord.
- `localStorage` op het scherm bewaart de laatste dashboardconfiguratie voor offline weergave, niet het Graph-token.

## Afwijzing

Geen leesbare tokens in de database, geen tokens in querystrings, geen herhaalde weergave in schermlijsten.
