$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSCommandPath
$logPath = Join-Path $projectRoot "start-dev-client.log"

$env:TEMP = "D:\Temp"
$env:TMP = "D:\Temp"
$env:NPM_CONFIG_CACHE = "D:\Temp\npm-cache"

New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
New-Item -ItemType Directory -Force -Path $env:NPM_CONFIG_CACHE | Out-Null

"[$(Get-Date -Format o)] starting expo" | Set-Content -Path $logPath
"TEMP=$env:TEMP" | Add-Content -Path $logPath
"TMP=$env:TMP" | Add-Content -Path $logPath
"NPM_CONFIG_CACHE=$env:NPM_CONFIG_CACHE" | Add-Content -Path $logPath

Push-Location $projectRoot
try {
  & npx expo start --dev-client --port 8081 --host lan --clear 2>&1 | Tee-Object -FilePath $logPath -Append
  "[$(Get-Date -Format o)] expo exited code=$LASTEXITCODE" | Add-Content -Path $logPath
} catch {
  "[$(Get-Date -Format o)] exception: $($_.Exception.Message)" | Add-Content -Path $logPath
  throw
} finally {
  Pop-Location
}

