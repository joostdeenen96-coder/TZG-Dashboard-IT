# Kioskmodus voor de tv

Het tv-scherm toont het dashboard vanzelf, over het hele beeld. Er zijn geen tabbladen en geen adresbalk.

## Wat er opent

`release\edge-kiosk.bat` start Microsoft Edge zo:

```bat
msedge.exe --kiosk http://localhost:3000 --edge-kiosk-type=fullscreen --no-first-run
```

- `--kiosk` opent één pagina en verbergt tabbladen en de adresbalk.
- `--edge-kiosk-type=fullscreen` zet die pagina over het hele scherm, zonder navigatieknoppen.
- Het adres is `http://localhost:3000`.

Edge gebruikt een eigen profiel in `C:\Teunesen\edge-kiosk`. Een gewoon Edge-venster op dezelfde pc blijft daarmee apart staan.

Voor de ICT-TV doet `release\edge-kiosk-ict.bat` hetzelfde naar `http://localhost:3000/ict`, met een apart Edge-profiel in `C:\Teunesen\edge-kiosk-ict`. Zo kunnen planning-TV en ICT-TV naast elkaar draaien.

## Eerst het dashboard

De kiosk wacht tot `http://localhost:3000/` antwoordt, hoogstens 60 seconden. Antwoordt de site niet, dan blijft het venster open met de melding dat je eerst `start-dashboard.bat` moet starten.

`start-dashboard.bat` zet de API op poort 43124 en de site op poort 3000, en roept daarna zelf `edge-kiosk.bat` aan. Laat de vensters **Teunesen API** en **Teunesen web** open. Sluiten haalt het dashboard weg.

## Handmatig starten

1. Dubbelklik `release\start-dashboard.bat`.
2. Wacht tot het dashboard het scherm vult.

Alleen het beeld opnieuw openen, terwijl de twee vensters al open zijn: dubbelklik `release\edge-kiosk.bat`.

## Automatisch bij het aanzetten van de pc

1. Zet bij netstroom het scherm en de slaapstand op Nooit.
2. Druk op Windows+R, typ `shell:startup` en druk op Enter.
3. Maak in die map een snelkoppeling naar `start-dashboard.bat`.

Na het aanmelden start de pc de API, de site en daarna Edge. Het tv-scherm toont het dashboard.

Edge moet op de normale plek staan:

- `C:\Program Files\Microsoft\Edge\Application\msedge.exe`
- of `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`

Ontbreekt dat bestand, dan blijft het kioskvenster open met een melding. Edge hoort bij Windows 11 en komt terug via Windows Update.

## Afsluiten en herstarten

Alt+F4 sluit alleen de kiosk. De API en de site blijven draaien. Dubbelklik daarna `edge-kiosk.bat` om het beeld terug te zetten.

Het hele dashboard herstarten:

1. Alt+F4 op de kiosk.
2. Sluit **Teunesen API** en **Teunesen web**.
3. Dubbelklik `start-dashboard.bat`.

Beheer, buiten de kiosk: open op deze pc een gewoon Edge-venster naar `http://localhost:3000/admin`. Aanmelden: `admin` / `teunesen`. In de kiosk is geen adresbalk, dus dat adres typ je daar niet.
