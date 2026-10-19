# Update productie

Niet: `git pull && docker compose up` als enige stap.

Linux: `./scripts/update-production.sh`

Volgorde:

1. Configuratie valideren
2. Databasebackup (`npm run backup:create` / backupservice)
3. Huidige versie noteren (`/api/version`)
4. Nieuwe image bouwen (`BUILD_COMMIT`, `BUILD_DATE`)
5. Migraties via entrypoint (niet vanuit API)
6. Containers vervangen
7. `/api/health/ready`
8. Player en legacy-routes controleren
9. Bij fout: `docs/ROLLBACK.md`

Migraties zijn vooruit. Scripts proberen geen schemadowngrade.
