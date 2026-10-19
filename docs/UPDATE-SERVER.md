# Server bijwerken vanuit GitHub

Op de host waar Docker Compose draait:

```bash
cd /pad/naar/TZG-Dashboard-IT
git pull
docker compose build
docker compose up -d
docker compose ps
curl -s http://127.0.0.1:8080/api/health
```

Op Windows PowerShell hetzelfde met `curl.exe`.

## Belangrijk

- Map `data/` niet verwijderen; die bevat persistente config.
- Bestand `.env` blijft lokaal; die zit niet in git.
- Oude containers worden vervangen; het volume `./data:/app/data` blijft.
- Controleer na update `/` en `/ict` in een browser op het LAN.
