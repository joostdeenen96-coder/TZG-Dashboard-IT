@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0.." || (
  echo Projectmap niet gevonden.
  pause
  exit /b 1
)
set "ROOT=%CD%"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js staat niet in PATH.
  echo Installeer de LTS-versie van https://nodejs.org/ en open daarna een nieuw opdrachtvenster.
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo Afhankelijkheden ontbreken. Voer eerst release\install-dashboard.bat uit.
  pause
  exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" (
  echo Vite ontbreekt. Voer release\install-dashboard.bat opnieuw uit.
  pause
  exit /b 1
)
if not exist ".env" (
  echo Waarschuwing: .env ontbreekt. Zonder PRTG-gegevens toont /ict de lege staat.
)

call :port_open 43124
if "%PORT_OPEN%"=="1" (
  echo API draait al op poort 43124.
) else (
  echo API starten op poort 43124.
  start "Teunesen API" /D "%ROOT%" cmd /k npm.cmd run server
)
call :wait_port 43124
if errorlevel 1 (
  pause
  exit /b 1
)

call :port_open 3000
if "%PORT_OPEN%"=="1" (
  echo Frontend draait al op poort 3000.
) else (
  echo Frontend starten op poort 3000.
  start "Teunesen web" /D "%ROOT%" cmd /k node_modules\.bin\vite.cmd --host 127.0.0.1 --port 3000 --strictPort
)
call :wait_port 3000
if errorlevel 1 (
  pause
  exit /b 1
)

call "%~dp0edge-kiosk-ict.bat"
if errorlevel 1 exit /b 1
echo ICT-dashboard: http://localhost:3000/ict
echo Planning blijft op http://localhost:3000/
echo Laat de vensters Teunesen API en Teunesen web open.
exit /b 0

:port_open
set "PORT_OPEN=0"
netstat -ano | findstr /C:":%1 " | findstr /I /C:"LISTENING" /C:"LUISTEREND" >nul
if not errorlevel 1 set "PORT_OPEN=1"
exit /b 0

:wait_port
set /a TRIES=0
:wait_port_loop
call :port_open %1
if "%PORT_OPEN%"=="1" exit /b 0
set /a TRIES+=1
if %TRIES% GEQ 40 (
  echo Poort %1 kwam niet binnen 40 seconden omhoog. Kijk in het venster Teunesen API of Teunesen web.
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_port_loop
