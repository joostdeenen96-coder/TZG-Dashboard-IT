# Productie-installatie Windows

Doel: Docker Desktop of Docker Engine op Windows Server, dezelfde Compose-stack.

1. Docker Desktop / Engine + Compose v2.
2. Repository uitpakken.
3. Kopieer `.env.production.example` naar `.env` en vul echte secrets in (niet committen).
4. `powershell -File .\scripts\preflight-windows.ps1`
5. Windows Firewall: poort **8080** inbound vanaf het LAN. **5432 niet** openzetten naar het LAN.
6. `docker compose up -d` — entrypoint migreert en seedt ontbrekende planning/ict (niet overschrijven).
7. `Invoke-WebRequest http://127.0.0.1:8080/api/health/ready`
8. In de productiecontainer (geen tsx): `docker compose exec dashboard node dist/server/scripts/db-seed.js`
9. Vanaf een andere PC: `http://<server-ip>:8080`. PostgreSQL op 5432 mag daar niet openen.

PowerShell-backup staat in `docs/BACKUP.md`. Update: `.\scripts\update-production.ps1`. Rollback: `.\scripts\rollback-production.ps1`.

**Classificatie:** de Windows-scripts zijn syntactisch aanwezig. Of ze op een echte Windows-host slagen is **niet getest** tot een Windows-runtime is meegenomen.
