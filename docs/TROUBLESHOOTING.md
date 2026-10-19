# Troubleshooting

## Dashboard bereikt PostgreSQL niet

Symptomen: `database nog niet bereikbaar`, ready 503, TCP-timeout naar `postgres:5432`.

Oorzaak op sommige hosts: `iptables-legacy` FORWARD DROP naast nftables. Inter-containerverkeer op de Compose-bridge valt dan stil, terwijl `127.0.0.1:5432` vanaf de host wel werkt.

Controle:

```bash
docker compose exec dashboard node -e "require('net').connect({host:'postgres',port:5432},()=>console.log('open')).on('error',e=>console.log(e.code))"
sudo iptables-legacy -S FORWARD | head
```

Herstel (host, geen applicatiecode): FORWARD ACCEPT op de Docker-bridge, daarna `docker compose restart dashboard`. Na **hostreboot** dezelfde controle.

## Ready 503, live 200

PostgreSQL of migraties of configuratie. Live mag groen blijven. Geen JSON-fallback in productie.

## Backup unhealthy

Geen dump in `/backups`, of ouder dan `BACKUP_MAX_AGE_HOURS`. `npm run backup:create` en `npm run backup:verify`. Volume `tzg-backups` mag niet met `down -v` zijn gewist.

## Player offline

Indicator met laatste update. Geen cache: «De narrowcastingserver is tijdelijk niet bereikbaar.» 401 blijft autorisatie.

## Logs

`docker compose logs dashboard` — JSON in productie. Geen wachtwoorden of tokens. Host: Docker `log-opts` `max-size` / `max-file`.

## Poort 8080 vanaf het LAN

Als localhost werkt maar een andere PC niet: firewall 8080, bind in Compose `${PORT:-8080}:8080` (niet alleen 127.0.0.1). PostgreSQL blijft 127.0.0.1:5432.
