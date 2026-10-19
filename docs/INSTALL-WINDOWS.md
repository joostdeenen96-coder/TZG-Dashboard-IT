# Installatie op Windows Server (Docker)

Doel: dezelfde productiecontainer als op Linux, op een Windows-host met Docker.

## Vereisten

- Windows 10/11 of Windows Server met **Docker Desktop** (of vergelijkbare Docker Engine + Compose)
- Poort **8080** vrij
- Git (optioneel; anders ZIP van de repo)

## Stappen

1. Installeer [Docker Desktop](https://www.docker.com/products/docker-desktop/) en start Docker.
2. Open PowerShell:

```powershell
git clone https://github.com/joostdeenen96-coder/TZG-Dashboard-IT.git
cd TZG-Dashboard-IT
Copy-Item .env.production.example .env
# Vul GRAPH_* (en eventueel PRTG_*) in .env met Kladblok
New-Item -ItemType Directory -Force -Path data | Out-Null
docker compose up -d --build
```

3. Controle:

```powershell
docker compose ps
curl.exe -s http://127.0.0.1:8080/api/health
```

## TV’s op het netwerk

```text
http://<server-ip>:8080/
http://<server-ip>:8080/ict
```

Voor kiosk: Edge starten met `--kiosk http://<server-ip>:8080/` (of `/ict`). De oude `release\start-dashboard.bat` die Vite lokaal start is niet nodig als de centrale server draait.

## Data

Map `data\` naast `docker-compose.yml` blijft behouden bij container-updates.
