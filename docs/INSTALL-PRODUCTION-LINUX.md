# Productie-installatie Linux

1. Docker Engine en Docker Compose v2 installeren.
2. Deze repository of een release op de server plaatsen. Niet als root-appuser bouwen zonder `.env`.
3. `.env.production.example` kopiëren naar `.env`. Wachtwoorden uit een kluis, geen `change-me`.
4. `chmod +x scripts/*.sh`
5. `./scripts/preflight-linux.sh`
6. `NODE_ENV=production npm run config:validate` (of via preflight).
7. Firewall: alleen TCP **8080** vanaf het LAN. PostgreSQL **niet** publiceren op `0.0.0.0`. Compose bindt 5432 op `127.0.0.1`.
8. `docker compose up -d`
9. `curl -fsS http://127.0.0.1:8080/api/health/ready`
10. `curl -fsS http://127.0.0.1:8080/api/version`
11. Controleer vanaf een andere host: `http://<server-ip>:8080` (planning/ICT/admin).
12. Controleer dat `http://<server-ip>:5432` **niet** bereikbaar is.
13. Na hostreboot: `docker compose ps` — `restart: unless-stopped` moet beide services terugbrengen. Als de dashboardcontainer PostgreSQL niet bereikt: zie `docs/TROUBLESHOOTING.md` (Docker FORWARD-policy).

Volumes: `tzg-postgres`, `tzg-backups`, bind `./data`. DNS-alias is optioneel (interne naam naar de server). Tijd: NTP/chrony of `timedatectl`.
