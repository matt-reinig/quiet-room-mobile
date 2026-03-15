param(
  [string]$DeviceId = "emulator-5556",
  [string]$DefaultInputMethod = "com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME",
  [ValidateSet("0", "1")]
  [string]$ShowImeWithHardKeyboard = "0"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Adb {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args,
    [switch]$AllowFailure
  )

  $output = & adb -s $DeviceId @Args 2>&1
  $exitCode = $LASTEXITCODE

  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "adb command failed (exit=$exitCode): adb -s $DeviceId $($Args -join ' ')`n$output"
  }

  return ($output | Out-String).Trim()
}

$devices = & adb devices
if ($LASTEXITCODE -ne 0) {
  throw "Unable to run 'adb devices'."
}

$deviceLines = ($devices | Out-String) -split "`r?`n" | Where-Object { $_ -match "\S" }
$onlineDevice = $deviceLines | Where-Object { $_ -match "^$([regex]::Escape($DeviceId))\s+device(\s|$)" } | Select-Object -First 1
if (-not $onlineDevice) {
  throw "Device '$DeviceId' is not online. adb devices output:`n$devices"
}

Invoke-Adb -Args @("shell", "settings", "put", "global", "window_animation_scale", "0") | Out-Null
Invoke-Adb -Args @("shell", "settings", "put", "global", "transition_animation_scale", "0") | Out-Null
Invoke-Adb -Args @("shell", "settings", "put", "global", "animator_duration_scale", "0") | Out-Null
Invoke-Adb -Args @("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", $ShowImeWithHardKeyboard) | Out-Null
Invoke-Adb -Args @("shell", "ime", "set", $DefaultInputMethod) -AllowFailure | Out-Null

$result = [ordered]@{
  device_id = $DeviceId
  window_animation_scale = Invoke-Adb -Args @("shell", "settings", "get", "global", "window_animation_scale")
  transition_animation_scale = Invoke-Adb -Args @("shell", "settings", "get", "global", "transition_animation_scale")
  animator_duration_scale = Invoke-Adb -Args @("shell", "settings", "get", "global", "animator_duration_scale")
  show_ime_with_hard_keyboard = Invoke-Adb -Args @("shell", "settings", "get", "secure", "show_ime_with_hard_keyboard")
  default_input_method = Invoke-Adb -Args @("shell", "settings", "get", "secure", "default_input_method")
}

Write-Host ($result | ConvertTo-Json -Depth 3)
