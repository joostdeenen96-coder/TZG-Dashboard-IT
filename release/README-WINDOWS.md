# Teunesen TV-dashboard op Windows 11

Het dashboard draait op de pc achter de tv. Twee vensters blijven open: de API op poort 43124 en de webserver op poort 3000. Microsoft Edge opent het scherm op `http://localhost:3000/`.

De scripts gebruiken alleen wat Windows 11 zelf heeft: Opdrachtprompt, `netstat`, `timeout`, `where`, `taskkill` en Edge. Node.js installeer je eenmalig van de Node.js-site. Er is geen extra service of procesbeheer nodig.

De map `release` blijft in de projectmap, naast `package.json`.

## Installatie

1. Installeer Node.js LTS vanaf [https://nodejs.org/](https://nodejs.org/). Kies de Windows-installer. Laat de optie aan staan die Node aan PATH toevoegt.
2. Sluit het installatievenster en open een nieuw opdrachtvenster, zodat PATH de nieuwe installatie ziet.
3. Kopieer de hele projectmap naar de pc, bijvoorbeeld `C:\Teunesen\dashboard`.
4. Dubbelklik `release\install-dashboard.bat`.

Het script controleert Node.js en npm, maakt `.env` aan als die nog ontbreekt, en voert `npm install` uit. Het venster moet open blijven tot de tekst `Installatie klaar` verschijnt.

De eerste keer dat de API luistert, kan Windows Firewall om toestemming vragen. De browser praat met `127.0.0.1`. Toestaan op privénetwerken is genoeg.

## Configuratie

Graph-gegevens staan in `.env` in de projectmap, niet in `release`. `install-dashboard.bat` kopieert `release\.env.example` alleen als `.env` nog niet bestaat. Een bestaande `.env` wordt niet overschreven.

```
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
PRTG_BASE_URL=
PRTG_USERNAME=
PRTG_PASSHASH=
```

Vul de Graph-waarden in en sla het bestand op. Het client secret blijft op deze pc. Zet `.env` niet in git.

Voor het ICT-scherm op `/ict` vul je ook `PRTG_BASE_URL`, `PRTG_USERNAME` en `PRTG_PASSHASH` in. De passhash mag niet in git of in logregels. Zonder die waarden start `/ict` wel, met de lege staat “PRTG niet gekoppeld”.

Zonder Graph-waarden start het planningscherm wel. De dieseltoeslag valt dan terug op de lokale cijfers en het nieuws toont voorbeeldkaarten.

Plaatsnaam, verversinterval, aantal nieuwsitems en de SharePoint-locaties staan in `config.json`. Die maak je via het verborgen beheer:

1. Open `http://localhost:3000/admin` in een gewoon Edge-venster, buiten de kiosk.
2. Meld aan met `admin` / `teunesen`.
3. Sla de instellingen op.

Ontbreekt `config.json`, dan gebruikt het scherm de standaardwaarden: dieseltoeslag op de lijst Dieseltoeslagen Asvervoer, nieuws van wt-nieuws, plaats Gennep, verversing elke 300 seconden, drie nieuwsitems, PRTG-groep en -tag leeg.

De PRTG-filter (groep-ID en/of tag) zet je in `/admin` of rechtstreeks in `config.json` onder `prtg`. Zolang die leeg is, toont `/ict` geen netwerksensoren.

## Starten

Dubbelklik `release\start-dashboard.bat`.

Het script doet drie dingen:

1. Het opent het venster **Teunesen API** en start de backend met `npm run server`.
2. Het wacht tot poort 43124 luistert en opent daarna het venster **Teunesen web**. Dat is Vite op `http://localhost:3000`.
3. Het opent Microsoft Edge in kioskmodus op `http://localhost:3000/`. Tabbladen en adresbalk blijven verborgen. Zie `kioskmodus.md`.

Voor de ICT-TV: `release\start-dashboard-ict.bat` start dezelfde API en website, maar opent Edge op `http://localhost:3000/ict`. Alleen het ICT-beeld opnieuw openen: `release\edge-kiosk-ict.bat`. Het planningsscherm blijft op `http://localhost:3000/`.

Laat beide opdrachtvensters open. Sluiten stopt dat deel van het dashboard.

Draait een poort al, dan start het script dat proces niet opnieuw en opent alleen de browser.

Voor een scherm dat aan blijft:

- Energie: bij netstroom het scherm en de slaapstand op Nooit zetten.
- Automatisch starten: druk op Windows+R, typ `shell:startup` en maak een snelkoppeling naar `start-dashboard.bat`. Die start ook de kiosk. Uitleg staat in `kioskmodus.md`.
- De kiosk verlaat je met Alt+F4.

## Herstarten

1. Sluit het Edge-venster met Alt+F4.
2. Sluit de vensters **Teunesen API** en **Teunesen web** met het kruisje.
3. Dubbelklik opnieuw `release\start-dashboard.bat`.

Vanuit een opdrachtvenster kan hetzelfde, zonder andere programma's te sluiten:

```bat
taskkill /F /FI "WINDOWTITLE eq Teunesen API*" /T
taskkill /F /FI "WINDOWTITLE eq Teunesen web*" /T
```

Daarna `release\start-dashboard.bat`. Gebruik geen `taskkill` op heel `msedge.exe` als er nog andere Edge-vensters open zijn.

Komt een poort niet binnen 40 seconden omhoog, dan blijft het bijbehorende venster de fout tonen. Lees die tekst, los die op, en start opnieuw. Een tweede start terwijl de poorten al luisteren, start geen tweede API of webserver.
