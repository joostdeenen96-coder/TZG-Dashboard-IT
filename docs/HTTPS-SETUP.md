# HTTPS via NGINX reverse proxy

## Architectuur

```
Browser / TV-kiosk
        │
        │  http://nc.teunesen.nl  (poort 80)
        │  → /.well-known/acme-challenge/ (Let's Encrypt)
        │  → overig: 301 redirect naar HTTPS
        │
        │  https://nc.teunesen.nl (poort 443)
        ▼
   tzg-nginx (container)
        │  TLS 1.2/1.3, HSTS, security headers
        │  limit_req (publiek + admin-login)
        │  X-Forwarded-Proto / X-Forwarded-For / X-Real-IP
        │  WebSocket Upgrade-headers, gzip, keep-alive
        ▼
   tzg-dashboard:8080  (Express, HTTP intern, TRUST_PROXY=1)
        │
        ▼
   tzg-postgres
```

- Extern: **80** en **443** via `tzg-nginx`.
- Intern: dashboard op **8080** (HTTP) op het Docker-netwerk (`expose`).
- Host-poort **8080**: standaard gepubliceerd (`EXPOSE_INTERNAL_PORT=true`). Optioneel uit te zetten.
- PostgreSQL blijft alleen op `127.0.0.1:5432`.
- Express: `app.set("trust proxy", 1)` zodat `req.ip`, `req.secure` en rate limits het echte client-IP gebruiken.

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
| `/var/www/certbot/` | `tzg-acme-www` | ACME HTTP-01 webroot |

Het volume `tzg-certs` blijft bestaan bij `docker compose down` **zonder** `-v`.

## Automatische self-signed

Bij start van `tzg-nginx`: als `fullchain.pem` of `privkey.pem` ontbreekt, maakt het entrypoint een self-signed certificaat:

- CN = `CERT_CN` (standaard `nc.teunesen.nl`)
- RSA 4096
- geldigheid `CERT_DAYS` (standaard 3650 dagen)
- SAN DNS = dezelfde CN

```bash
chmod +x scripts/generate-selfsigned-cert.sh
./scripts/generate-selfsigned-cert.sh ./certs
docker compose exec nginx openssl x509 -in /etc/nginx/certs/fullchain.pem -noout -subject -dates
```

## TLS en security headers

HTTPS-server:

- `ssl_protocols TLSv1.2 TLSv1.3`
- `ssl_session_timeout 1d` / `ssl_session_cache shared:SSL:10m` / `ssl_session_tickets off`
- Mozilla Intermediate cipher-suite voor TLS 1.2
- Headers: `Strict-Transport-Security`, `X-Frame-Options SAMEORIGIN`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`

`X-Frame-Options SAMEORIGIN` blokkeert inbedding op andere origins; admin, display en player op dezelfde host blijven werken.

## Rate limiting (nginx)

| Zone | Rate | Toepassing |
| --- | --- | --- |
| `tzg_public` | 30 r/s, burst 80 | Alle HTTPS-verkeer behalve login |
| `tzg_login` | 10 r/m, burst 5 | `POST/GET /api/admin/login` |

Limieten zijn ruim genoeg voor TV-polling; ze dempen simpele scans en brute-force op login.

## Host-poort 8080 (`EXPOSE_INTERNAL_PORT`)

| Waarde | Gedrag |
| --- | --- |
| `true` (standaard) | Host publiceert `${PORT:-8080}:8080` (huidige gedrag) |
| `false` | Alleen nginx 80/443; dashboard niet via `host:8080` |

Uitschakelen (nog niet de standaard):

```bash
# In .env:
EXPOSE_INTERNAL_PORT=false
COMPOSE_FILE=docker-compose.yml:docker-compose.expose-internal.off.yml

docker compose up -d
```

Of eenmalig:

```bash
docker compose -f docker-compose.yml -f docker-compose.expose-internal.off.yml up -d
```

## Certificaat verversen (self-signed)

```bash
docker compose stop nginx
docker compose run --rm -v tzg-certs:/etc/nginx/certs nginx \
  sh -c 'rm -f /etc/nginx/certs/fullchain.pem /etc/nginx/certs/privkey.pem'
docker compose up -d nginx
```

## Let's Encrypt (HTTP-01 ready)

NGINX serveert al `/.well-known/acme-challenge/` vanaf `/var/www/certbot` (volume `tzg-acme-www`) **vóór** de HTTPS-redirect. Geen nginx-configwijziging nodig voor certbot webroot.

Voorbeeld (host of sidecare):

```bash
certbot certonly --webroot -w /pad/naar/acme-www -d nc.teunesen.nl
# Kopieer fullchain.pem + privkey.pem naar volume tzg-certs
docker compose exec nginx nginx -s reload
```

Of mount het certbot-webroot op het volume `tzg-acme-www` en schrijf LE-certs naar `tzg-certs`.

## Healthchecks

- Dashboard: `GET /api/health/ready` in de container.
- NGINX: `GET http://127.0.0.1/nginx-health`.
- Via proxy: `curl -k https://127.0.0.1/api/health/ready`
- ACME-pad smoke: `curl -fsS http://127.0.0.1/.well-known/acme-challenge/` (404 zonder token is OK; geen redirect naar HTTPS).

## Firewall

Open naar het LAN: **80** en **443**. Poort **8080** optioneel (debug). PostgreSQL **5432** niet op `0.0.0.0`.

## Troubleshooting

| Symptoom | Actie |
| --- | --- |
| Browser: certificaat onbetrouwbaar | Self-signed; importeer CA of negeer op kiosk |
| `502 Bad Gateway` | `docker compose ps` / `docker compose logs dashboard nginx` |
| Redirect-loop | `TRUST_PROXY=1` en `X-Forwarded-Proto` |
| `429` op dashboards | Burst verhogen in `nginx/nginx.conf` (zone `tzg_public`) |
| ACME redirect naar HTTPS | Challenge-location moet vóór `location /` staan (al zo) |
