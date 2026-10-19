# Backup van persistente bestanden

## Wat bewaren

Op de host, in de projectmap:

| Pad | Inhoud |
| --- | --- |
| `data/settings.json` | Beheerinstellingen, o.a. Graph/PRTG-velden (kan geheimen bevatten) |
| `data/config.json` | Dashboardconfig (SharePoint-paden, PRTG-filter, refresh) |
| `data/diesel-week.json` | Cache dieseltoeslag |
| `.env` | Omgevingsgeheimen (Graph/PRTG); staat buiten git |

Optioneel: hele map `data/` + `.env`.

## Voorbeeld

```bash
mkdir -p ~/backups/tzg-dashboard
cp -a data ~/backups/tzg-dashboard/data-$(date +%F)
cp -a .env ~/backups/tzg-dashboard/env-$(date +%F)
```

Windows (PowerShell):

```powershell
$stamp = Get-Date -Format "yyyy-MM-dd"
New-Item -ItemType Directory -Force -Path ".\backups\$stamp" | Out-Null
Copy-Item -Recurse .\data ".\backups\$stamp\data"
Copy-Item .\.env ".\backups\$stamp\.env"
```

## Herstel

1. Stop de stack: `docker compose down`
2. Zet `data/` en `.env` terug
3. Start: `docker compose up -d`

Bewaar backups buiten de server (NAS/USB) en behandel ze als vertrouwelijk: ze kunnen client secrets en wachtwoorden bevatten.
