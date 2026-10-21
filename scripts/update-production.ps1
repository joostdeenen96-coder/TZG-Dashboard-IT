# Productie-update zonder tsx of development npm-scripts.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Output "1. preflight"
powershell -File .\scripts\preflight-windows.ps1

Write-Output "2. huidige versie vastleggen"
try {
  $prev = docker compose exec -T dashboard node -e "console.log((process.env.APP_VERSION||'onbekend')+' '+(process.env.BUILD_COMMIT||'unknown'))"
  Write-Output "huidig: $prev"
} catch {
  Write-Output "huidig: onbekend"
}

Write-Output "3. databasebackup"
$services = @(docker compose ps --status running --services 2>$null)
if ($services -contains "dashboard") {
  docker compose exec -T dashboard node dist/server/scripts/backup-create.js
} elseif ($services -contains "backup") {
  docker compose exec -T backup bash -c 'BACKUP_ONCE=1 /backup-loop.sh'
} else {
  throw "FAIL geen draaiende dashboard- of backupcontainer voor backup"
}

Write-Output "4. nieuwe productie-image bouwen"
$env:BUILD_COMMIT = (git rev-parse --short HEAD)
$env:BUILD_DATE = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
docker compose build dashboard

Write-Output "5. nieuwe image production-safe valideren (vóór replace)"
docker compose run --rm --no-deps -T dashboard node dist/server/scripts/config-validate.js | Out-Null
Write-Output "OK nieuwe image-configuratie"

Write-Output "6. containers gecontroleerd vervangen"
docker compose up -d

Write-Output "7. readiness controleren"
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/api/health/ready | Out-Null
    $ok = $true
    break
  } catch {
    Start-Sleep -Seconds 2
  }
}
if (-not $ok) {
  Write-Output "FAIL ready. Zie docs/ROLLBACK.md en .\scripts\rollback-production.ps1"
  exit 1
}
Write-Output "8. versie controleren"
Write-Output "ready"
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/api/version | Select-Object -ExpandProperty Content
