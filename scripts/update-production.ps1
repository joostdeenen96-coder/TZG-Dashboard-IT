$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
Write-Output "1. preflight"
powershell -File .\scripts\preflight-windows.ps1
Write-Output "2. configuratie"
$env:NODE_ENV = "production"
npm run config:validate
Write-Output "3. backup"
npm run backup:create
Write-Output "4. image bouwen"
$env:BUILD_COMMIT = (git rev-parse --short HEAD)
$env:BUILD_DATE = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
docker compose build dashboard
Write-Output "5. up"
docker compose up -d
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
  Write-Output "FAIL ready. Zie docs/ROLLBACK.md"
  exit 1
}
Write-Output "ready"
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/api/version
