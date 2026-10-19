# Rollback

Drie niveaus, niet door elkaar halen.

## 1. Applicatierollback zonder schemadowngrade

Vorige image starten. Database blijft staan.

```bash
./scripts/rollback-production.sh tzg-dashboard:<vorige>
docker tag tzg-dashboard:<vorige> tzg-dashboard:local
docker compose up -d dashboard
curl -fsS http://127.0.0.1:8080/api/health/ready
```

Alleen veilig als de nieuwe release geen onomkeerbare migratie heeft toegepast die de oude code breekt. PLATFORM-004 voegt geen extra schema-migratie toe t.o.v. PLATFORM-003 (`001_init.sql`).

## 2. Databaseherstel uit backup

Destructief. Expliciet:

```bash
RESTORE_CONFIRM=yes RESTORE_DB=tzg ./scripts/restore-postgres.sh backups/tzg-....dump
```

Secrets in `.env` worden niet uit de dump gehaald.

## 3. Volledige disaster recovery

Nieuwe host of nieuw volume: `docs/platform/disaster-recovery.md`.
