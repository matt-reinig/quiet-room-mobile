param(
  [string]$DeviceId = "emulator-5556",
  [string]$AvdName = "Pixel34AVD_2",
  [int]$Port = 5556,
  [int]$MetroPort = 8081,
  [string]$MetroHost = "lan",
  [switch]$SkipAppLaunch,
  [switch]$ForceMetroRestart
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectRoot "start-dev-client.log"
$expoCommand = Join-Path $projectRoot "node_modules\.bin\expo.cmd"

if (-not (Test-Path $expoCommand)) {
  throw "Expo CLI not found at $expoCommand"
}

function Wait-ForDevice {
  param([int]$TimeoutSeconds = 180)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $devices = & adb devices
    $deviceLines = ($devices | Out-String) -split "`r?`n" | Where-Object { $_ -match "\S" }
    $onlineDevice = $deviceLines | Where-Object { $_ -match "^$([regex]::Escape($DeviceId))\s+device(\s|$)" } | Select-Object -First 1
    if ($LASTEXITCODE -eq 0 -and $onlineDevice) {
      return
    }

    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for $DeviceId to come online."
}

function Wait-ForTcpListener {
  param(
    [int]$PortNumber,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $listener = Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $listener) {
      return
    }

    Start-Sleep -Seconds 1
  }

  throw "Timed out waiting for localhost:$PortNumber to start listening."
}

$devices = & adb devices
if ($LASTEXITCODE -ne 0) {
  throw "Unable to run 'adb devices'."
}

$deviceLines = ($devices | Out-String) -split "`r?`n" | Where-Object { $_ -match "\S" }
$onlineDevice = $deviceLines | Where-Object { $_ -match "^$([regex]::Escape($DeviceId))\s+device(\s|$)" } | Select-Object -First 1
if (-not $onlineDevice) {
  Start-Process -FilePath emulator -ArgumentList @("-avd", $AvdName, "-port", $Port) | Out-Null
  Wait-ForDevice
}

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'configure-emulator-5556.ps1') -DeviceId $DeviceId

& adb -s $DeviceId reverse "tcp:$MetroPort" "tcp:$MetroPort" | Out-Null

$existingMetro = Get-NetTCPConnection -LocalPort $MetroPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ForceMetroRestart -and $null -ne $existingMetro) {
  Stop-Process -Id $existingMetro.OwningProcess -Force
  Start-Sleep -Seconds 1
  $existingMetro = $null
}

if ($null -eq $existingMetro) {
  $env:TEMP = "D:\Temp"
  $env:TMP = "D:\Temp"
  $env:NPM_CONFIG_CACHE = "D:\Temp\npm-cache"

  New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
  New-Item -ItemType Directory -Force -Path $env:NPM_CONFIG_CACHE | Out-Null

  $cmdArgs = '/k set TEMP=' + $env:TEMP + '&& set TMP=' + $env:TMP + '&& set NPM_CONFIG_CACHE=' + $env:NPM_CONFIG_CACHE + '&& cd /d "' + $projectRoot + '"&& call "' + $expoCommand + '" start --dev-client --port ' + $MetroPort + ' --host ' + $MetroHost + ' --clear'
  "[$(Get-Date -Format o)] starting expo dev client" | Set-Content -Path $logPath
  Start-Process -FilePath cmd.exe -ArgumentList $cmdArgs | Out-Null
  Wait-ForTcpListener -PortNumber $MetroPort
}

if (-not $SkipAppLaunch) {
  & adb -s $DeviceId shell input keyevent KEYCODE_WAKEUP | Out-Null
  & adb -s $DeviceId shell wm dismiss-keyguard | Out-Null
  & adb -s $DeviceId shell monkey -p com.quietroom.mobile -c android.intent.category.LAUNCHER 1 | Out-Null
}

$result = [ordered]@{
  device_id = $DeviceId
  metro_port = $MetroPort
  metro_ready = $true
  app_launched = -not $SkipAppLaunch
  log_path = $logPath
}

Write-Host ($result | ConvertTo-Json -Depth 3)