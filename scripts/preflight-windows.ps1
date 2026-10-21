# Controleert of deze Windows-host klaar is voor productie. Toont geen secrets.
# Geen tsx of development npm-scripts — validatie via productie-image/container.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$fail = 0
function Say([string]$msg) { Write-Output $msg }
function Need([string]$cmd) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { Say "OK $cmd" }
  else { Say "FAIL $cmd ontbreekt"; $script:fail = 1 }
}
Need "docker"
try {
  docker compose version | Out-Null
  Say "OK docker compose"
} catch {
  Say "FAIL docker compose ontbreekt"
  $fail = 1
}
if (Test-Path ".env") { Say "OK .env aanwezig" } else { Say "FAIL .env ontbreekt"; $fail = 1 }
$drive = (Get-Item .).PSDrive.Free
if ($drive -ge 2GB) { Say "OK vrije schijfruimte" } else { Say "FAIL onvoldoende vrije schijfruimte"; $fail = 1 }
$listening = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($listening) { Say "WARN poort 8080 is in gebruik" } else { Say "OK poort 8080 vrij" }
New-Item -ItemType Directory -Force -Path "backups" | Out-Null
try {
  Set-Content -Path "backups\.preflight" -Value "ok"
  Remove-Item "backups\.preflight"
  Say "OK backupdirectory schrijfbaar"
} catch {
  Say "FAIL backupdirectory niet schrijfbaar"
  $fail = 1
}

$services = @()
try {
  $services = @(docker compose ps --status running --services 2>$null)
} catch {
  $services = @()
}

$validateOk = $false
if ($services -contains "dashboard") {
  try {
    docker compose exec -T dashboard node dist/server/scripts/config-validate.js | Out-Null
    $validateOk = $true
  } catch {
    $validateOk = $false
  }
} else {
  try {
    docker image inspect tzg-dashboard:local | Out-Null
    docker compose run --rm --no-deps -T dashboard node dist/server/scripts/config-validate.js | Out-Null
    $validateOk = $true
  } catch {
    Say "WARN productieconfiguratie overgeslagen — dashboardcontainer/image ontbreekt"
    $validateOk = $true
  }
}
if ($validateOk) { Say "OK productieconfiguratie" } else { Say "FAIL productieconfiguratie"; $fail = 1 }

Say ("OK tijd " + (Get-Date).ToUniversalTime().ToString("o"))
if ($fail -ne 0) { exit 1 }
exit 0
