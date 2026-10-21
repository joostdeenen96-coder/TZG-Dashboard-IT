# Update productie

Niet: `git pull && docker compose up` als enige stap.

Linux: `./scripts/update-production.sh`

Volgorde (geen `tsx` op de host):

1. Preflight (`./scripts/preflight-linux.sh`)
2. Huidige versie noteren (`/api/version`)
3. Databasebackup in de container: `docker compose exec -T dashboard node dist/server/scripts/backup-create.js`
4. Nieuwe image bouwen (`BUILD_COMMIT`, `BUILD_DATE`)
5. Nieuwe image valideren: `docker compose run --rm --no-deps -T dashboard node dist/server/scripts/config-validate.js`
6. Containers vervangen (migraties via entrypoint)
7. `/api/health/ready` en `/api/version`
8. Player en legacy-routes controleren
9. Bij fout: `docs/ROLLBACK.md`

Migraties zijn vooruit. Scripts proberen geen schemadowngrade.
