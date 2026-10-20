# HTTPS via NGINX reverse proxy

## Architectuur

```
Browser / TV-kiosk
        │
        │  http://nc.teunesen.nl  (poort 80)
        │  → 301 redirect naar HTTPS
        │
        │  https://nc.teunesen.nl (poort 443)
        ▼
   tzg-nginx (container)
        │  TLS (self-signed of later Let's Encrypt)
        │  X-Forwarded-Proto / X-Forwarded-For / X-Real-IP
        │  WebSocket Upgrade-headers
        │  gzip, keep-alive
        ▼
   tzg-dashboard:8080  (Express, HTTP intern)
        │
        ▼
   tzg-postgres
```

- Extern: **80** en **443** via `tzg-nginx`.
- Intern: dashboard blijft op **8080** (HTTP). Compose publiceert 8080 nog steeds voor lokaal debug (`http://127.0.0.1:8080`).
- PostgreSQL blijft alleen op `127.0.0.1:5432`.
- Dashboard `TRUST_PROXY` staat standaard op `1` zodat rate limits het echte client-IP zien.

Gewenste URLs:

- `https://nc.teunesen.nl`
- `https://nc.teunesen.nl/admin`
- `https://nc.teunesen.nl/ict`
- `https://nc.teunesen.nl/display/planning`
- `https://nc.teunesen.nl/player/<token>`

## Locaties certificaten

| Pad in container | Named volume | Inhoud |
| --- | --- | --- |
| `/etc/nginx/certs/fullchain.pem` | `tzg-certs` | Certificaat (+ chain) |
| `/etc/nginx/certs/privkey.pem` | `tzg-certs` | Private key |

Het volume `tzg-certs` blijft bestaan bij `docker compose down` **zonder** `-v`. Alleen `docker compose down -v` of `docker volume rm` wist certificaten.

## Automatische self-signed

Bij start van `tzg-nginx`: als `fullchain.pem` of `privkey.pem` ontbreekt, maakt het entrypoint een self-signed certificaat:

- CN = `CERT_CN` (standaard `nc.teunesen.nl`)
- RSA 4096
- geldigheid `CERT_DAYS` (standaard 3650 dagen)
- SAN DNS = dezelfde CN

Handmatig op de host (zelfde parameters):

```bash
chmod +x scripts/generate-selfsigned-cert.sh
./scripts/generate-selfsigned-cert.sh ./certs
# daarna naar het volume kopiëren, of laten genereren door de nginx-container
```

Inspecteren in de container:

```bash
docker compose exec nginx openssl x509 -in /etc/nginx/certs/fullchain.pem -noout -subject -dates
```

Browsers en Edge-kiosks tonen een waarschuwing bij self-signed. Voor interne TV’s: certificaat importeren in de trust store, of later vervangen door een CA-certificaat.

## Certificaat verversen (self-signed)

1. Backup van het volume of de PEM-bestanden.
2. Bestanden verwijderen uit het volume (of volume opnieuw laten vullen):

```bash
docker compose stop nginx
docker compose run --rm -v tzg-certs:/etc/nginx/certs nginx \
  sh -c 'rm -f /etc/nginx/certs/fullchain.pem /etc/nginx/certs/privkey.pem'
docker compose up -d nginx
```

3. Controleer subject/datums opnieuw met `openssl x509` zoals hierboven.

Of genereer op de host met `scripts/generate-selfsigned-cert.sh` en kopieer naar het volume.

## Vervangen door Let's Encrypt (toekomst)

Self-signed is voldoende voor een gesloten LAN. Voor een publiek of AD-vertrouwd certificaat:

1. Zorg dat `nc.teunesen.nl` naar de server wijst en poort 80 vanaf internet of de ACME-validator bereikbaar is (of gebruik DNS-01).
2. Voeg een ACME-client toe (bijv. Certbot, of Caddy/Traefik). Voor de huidige NGINX-opzet: Certbot in een sidecare of op de host.
3. Plaats Let's Encrypt-bestanden als:

   - `/etc/nginx/certs/fullchain.pem`
   - `/etc/nginx/certs/privkey.pem`

4. Herlaad nginx: `docker compose exec nginx nginx -s reload` (of herstart de service).
5. Houd HSTS en TLS1.2+ zoals in `nginx/conf.d/tzg.conf`.

HTTP→HTTPS redirect op poort 80 blijft; ACME HTTP-01 vereist dan een aparte `location /.well-known/acme-challenge/` vóór de redirect (nog niet actief in deze release).

## Healthchecks

- Dashboard: `GET /api/health/ready` in de container.
- NGINX: `GET http://127.0.0.1/nginx-health` (geen backend nodig).
- Via proxy: `curl -k https://127.0.0.1/api/health/ready`

## Firewall

Open naar het LAN: **80** en **443**. Poort **8080** mag intern blijven voor beheer; PostgreSQL **5432** niet publiceren op `0.0.0.0`.

## Troubleshooting

| Symptoom | Actie |
| --- | --- |
| Browser: certificaat onbetrouwbaar | Verwacht bij self-signed; importeer CA of negeer op kiosk |
| `502 Bad Gateway` | `docker compose ps` — dashboard healthy? Logs: `docker compose logs dashboard nginx` |
| Redirect-loop | Controleer `TRUST_PROXY=1` en dat nginx `X-Forwarded-Proto` zet |
| Oud certificaat na vernieuwen | Volume niet gewist; zie “Certificaat verversen” |
