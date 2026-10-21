# Non-destructieve applicatierollback. Geen tsx of development npm-scripts.
param([string]$Image = "")
Set-Location (Join-Path $PSScriptRoot "..")
if (-not $Image) {
  Write-Output "Gebruik: .\scripts\rollback-production.ps1 tzg-dashboard:vorige-tag"
  Write-Output "Geen database-downgrade. Restore apart met RESTORE_CONFIRM=yes."
  exit 1
}
Write-Output "Applicatierollback naar $Image (database blijft onaangeraakt)"
docker compose stop dashboard
docker compose rm -f dashboard
Write-Output "Zet image $Image als tzg-dashboard:local en start: docker compose up -d dashboard"
