param(
  [string]$DeviceId = "emulator-5556",
  [string]$ArtifactsRoot = "test-artifacts/emulator-5556-doctor"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Adb {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args,
    [switch]$AllowFailure
  )

  $escapedArgs = $Args | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }

  $joined = $escapedArgs -join " "
  $command = "adb -s $DeviceId $joined 2>&1"
  $output = & cmd /c $command
  $exitCode = $LASTEXITCODE

  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "adb command failed (exit=$exitCode): $command`n$output"
  }

  return ($output | Out-String).Trim()
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$artifactsDir = Join-Path $projectRoot $ArtifactsRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $artifactsDir $timestamp
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$devices = & adb devices
if ($LASTEXITCODE -ne 0) {
  throw "Unable to run 'adb devices'."
}

$deviceLines = ($devices | Out-String) -split "`r?`n" | Where-Object { $_ -match "\S" }
$onlineDevice = $deviceLines | Where-Object { $_ -match "^$([regex]::Escape($DeviceId))\s+device(\s|$)" } | Select-Object -First 1
if (-not $onlineDevice) {
  throw "Device '$DeviceId' is not online. adb devices output:`n$devices"
}

$bootCompleted = Invoke-Adb -Args @("shell", "getprop", "sys.boot_completed") -AllowFailure
$topActivity = Invoke-Adb -Args @("shell", "dumpsys", "activity", "activities") -AllowFailure
$topActivityLine = (($topActivity -split "`r?`n") | Where-Object { $_ -match "mResumedActivity|topResumedActivity" } | Select-Object -First 1)

$remoteXml = "/sdcard/quiet_room_doctor.xml"
$localXml = Join-Path $runDir "ui.xml"
$uiDumpOutput = Invoke-Adb -Args @("shell", "uiautomator", "dump", "--compressed", $remoteXml) -AllowFailure
$uiDumpPulled = $false
try {
  Invoke-Adb -Args @("pull", $remoteXml, $localXml) -AllowFailure | Out-Null
  $uiDumpPulled = Test-Path $localXml
} finally {
  Invoke-Adb -Args @("shell", "rm", $remoteXml) -AllowFailure | Out-Null
}

$localPng = Join-Path $runDir "screen.png"
cmd /c "adb -s $DeviceId exec-out screencap -p > `"$localPng`"" | Out-Null

$uiText = if ($uiDumpPulled) { Get-Content -Raw -Path $localXml } else { "" }
$recentLogcat = & adb -s $DeviceId logcat -d -b main -b system -b crash 2>&1
$recentLogcatPath = Join-Path $runDir "logcat.txt"
$recentLogcat | Set-Content -Path $recentLogcatPath
$recentLogcatText = ($recentLogcat | Out-String)
$recentRelevant = ($recentLogcatText -split "`r?`n") | Where-Object {
  $_ -match "ANR in|Process system isn't responding|system_server|Unable to load script|Choose input method"
} | Select-Object -Last 20

$processSystemDialog = $uiText -match "Process system isn't responding"
$inputMethodChooserVisible = $uiText -match "Choose input method"
$redboxVisible = $uiText -match "Unable to load script"
$settingsErrorVisible = $uiText -match "Unable to load settings"
$quietRoomVisible = $uiText -match "Quiet Room"
$recentSystemAnr = $recentLogcatText -match "ANR in system"

$recommendation = "manual_verify"
if ($processSystemDialog -or $recentSystemAnr) {
  $recommendation = "cold_boot_or_wipe_avd"
} elseif ($inputMethodChooserVisible) {
  $recommendation = "normalize_ime_then_retry"
} elseif ($redboxVisible) {
  $recommendation = "restart_metro_or_adb_reverse"
} elseif ($settingsErrorVisible) {
  $recommendation = "verify_backend_or_qa_connectivity"
}

$result = [ordered]@{
  device_id = $DeviceId
  boot_completed = $bootCompleted
  top_activity = $topActivityLine
  quiet_room_visible = $quietRoomVisible
  process_system_dialog = $processSystemDialog
  input_method_chooser_visible = $inputMethodChooserVisible
  redbox_visible = $redboxVisible
  settings_error_visible = $settingsErrorVisible
  recent_system_anr = $recentSystemAnr
  recommendation = $recommendation
  artifacts_dir = $runDir
  ui_dump_output = $uiDumpOutput
  recent_logcat = $recentRelevant
}

$result | ConvertTo-Json -Depth 4
