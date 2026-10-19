# ADR: player-offlinecache

## Besluit

De browser bewaart de laatst succesvolle *publieke* playerconfiguratie in `localStorage`. De sleutel is afgeleid (hash) van het screen-token; de waarde bevat het token niet. Bij netwerkfout blijft het dashboard in beeld met een subtiele indicator. Zonder cache: vaste fouttekst, geen wit scherm.

## Alternatieven

- Service worker / Cache API: extra complexiteit, lastig te debuggen op TV-browsers, niet nodig voor één JSON-config.
- IndexedDB: overkill voor één record.
- Token in de cachewaarde: onnodig lek via DevTools-export.

## Gevolgen

Heartbeat pauzeert tijdens offline. Backoff 2 s … 60 s. Na herstel vervangt verse config de cache. 401/403 gebruiken de cache niet (token ongeldig is geen “server weg”).
