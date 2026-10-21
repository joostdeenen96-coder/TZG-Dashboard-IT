# Productie-installatie Linux

1. Docker Engine en Docker Compose v2 installeren.
2. Deze repository of een release op de server plaatsen. Niet als root-appuser bouwen zonder `.env`.
3. `.env.production.example` kopiëren naar `.env`. Wachtwoorden uit een kluis, geen `change-me`.
4. `chmod +x scripts/*.sh`
5. `./scripts/preflight-linux.sh` (valideert productieconfiguratie via `docker compose exec … node dist/server/scripts/config-validate.js` — geen `tsx` op de host).
6. Optioneel handmatig: `docker compose exec -T dashboard node dist/server/scripts/config-validate.js`.
7. Firewall: TCP **80** en **443** vanaf het LAN (HTTPS via NGINX). Optioneel **8080** (`EXPOSE_INTERNAL_PORT=true`, standaard). PostgreSQL **niet** publiceren op `0.0.0.0`. Compose bindt 5432 op `127.0.0.1`.
8. `docker compose up -d`
9. Het entrypoint wacht op PostgreSQL, voert migraties uit en seedt ontbrekende standaarddata (organisatie Teunesen, dashboards planning/ict). Bestaande dashboards worden niet overschreven.
10. NGINX (`tzg-nginx`) luistert op 80/443, redirect HTTP→HTTPS (met ACME `/.well-known/acme-challenge/`), TLS 1.2/1.3, security headers, basis rate limits, en proxyt naar `tzg-dashboard:8080`. Zet `TRUST_PROXY=1` (standaard in Compose). Ontbreekt een certificaat in volume `tzg-certs`, dan maakt het entrypoint automatisch een self-signed certificaat (`CN=nc.teunesen.nl`, RSA 4096, 3650 dagen). Zie `docs/HTTPS-SETUP.md`.
11. Controles (lokaal, self-signed: `-k`):

```bash
curl -fsS http://127.0.0.1:8080/api/health/ready
curl -fsSI http://127.0.0.1/ | head -n 5          # 301 → https
curl -kfsS https://127.0.0.1/api/health/ready
curl -kfsS https://127.0.0.1/api/version
curl -kfsS https://127.0.0.1/api/dashboards        # planning + ict
```

12. Handmatig in de **productiecontainer** (geen `tsx`; die zit niet in de image):

```bash
docker compose exec dashboard node dist/server/scripts/db-migrate.js
docker compose exec dashboard node dist/server/scripts/db-migrate-status.js
docker compose exec dashboard node dist/server/scripts/db-seed.js
docker compose exec dashboard node dist/server/scripts/db-import-json.js
```

Of via npm in de image: `npm run db:seed:prod` (en `db:migrate:prod`, `db:migrate:status:prod`, `db:import-json:prod`). Op de ontwikkelhost blijven `npm run db:seed` / `db:migrate` met `tsx` beschikbaar.

13. Controleer vanaf een andere host: `https://nc.teunesen.nl` (of `https://<server-ip>`; browser waarschuwing bij self-signed is verwacht). Routes: `/admin`, `/ict`, `/display/planning`, `/player/<token>`.
14. Controleer dat `http://<server-ip>:5432` **niet** bereikbaar is.
15. Na hostreboot: `docker compose ps` — `restart: unless-stopped` moet postgres, dashboard, nginx en backup terugbrengen. Als de dashboardcontainer PostgreSQL niet bereikt: zie `docs/TROUBLESHOOTING.md` (Docker FORWARD-policy).

Volumes: `tzg-postgres`, `tzg-backups`, `tzg-certs`, `tzg-acme-www`, bind `./data`. DNS: `nc.teunesen.nl` naar de server. Tijd: NTP/chrony of `timedatectl`. Host-poort 8080 uitzetten: `EXPOSE_INTERNAL_PORT=false` + `docker-compose.expose-internal.off.yml` (zie HTTPS-SETUP).
