# Installatie op Linux (Docker)

Doel: de Teunesen/TZG-dashboard app centraal draaien. Een TV opent alleen de browser naar de server.

## Vereisten

- Linux-server in het LAN
- Docker Engine + Docker Compose plugin
- Poort **8080** vrij (of pas `PORT` aan)

## Stappen

```bash
git clone https://github.com/joostdeenen96-coder/TZG-Dashboard-IT.git
cd TZG-Dashboard-IT
cp .env.production.example .env
# Vul GRAPH_* (en eventueel PRTG_*) in .env
mkdir -p data
docker compose up -d --build
```

Controle:

```bash
docker compose ps
curl -s http://127.0.0.1:8080/api/health
```

## TV / andere pc

Open in de browser (of Edge-kiosk):

```text
http://<server-ip>:8080/
http://<server-ip>:8080/ict
http://<server-ip>:8080/admin
```

Vervang `<server-ip>` door het LAN-adres van de server, bijvoorbeeld `192.168.1.50`.

## Persistente data

Compose mount `./data` naar `/app/data` in de container. Hierin horen onder meer:

- `settings.json`
- `config.json` (na eerste opslaan via beheer)
- `diesel-week.json`

## Stoppen

```bash
docker compose down
```
