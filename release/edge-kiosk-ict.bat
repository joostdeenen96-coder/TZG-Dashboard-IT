@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "URL=http://localhost:3000/ict"
set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" (
  echo Microsoft Edge niet gevonden.
  echo Edge hoort bij Windows 11. Installeer Edge via Windows Update.
  pause
  exit /b 1
)
set "PROFILE=%SystemDrive%\Teunesen\edge-kiosk-ict"
if not exist "%PROFILE%" mkdir "%PROFILE%"
echo Wachten tot http://localhost:3000/ antwoordt.
set /a TRIES=0
:wait_site
"%SystemRoot%\System32\curl.exe" -s -o NUL -f "http://localhost:3000/"
if not errorlevel 1 goto open_edge
set /a TRIES+=1
if %TRIES% GEQ 60 goto site_down
timeout /t 1 /nobreak >nul
goto wait_site

:site_down
echo Het dashboard op http://localhost:3000/ antwoordt niet.
echo Start eerst release\start-dashboard.bat en laat die vensters open.
pause
exit /b 1

:open_edge
rem Volledig scherm, zonder tabbladen en zonder adresbalk. ICT-TV op /ict.
start "" "%EDGE%" --kiosk %URL% --edge-kiosk-type=fullscreen --no-first-run --user-data-dir="%PROFILE%"
exit /b 0
