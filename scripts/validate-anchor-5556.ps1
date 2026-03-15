param(
  [string]$DeviceId = "emulator-5556",
  [string]$AppPackage = "com.quietroom.mobile",
  [int]$ImmediateDelayMs = 120,
  [int]$LateDelayMs = 1800,
  [int]$MaxAnchorDriftPx = 14,
  [int]$MinTopMarginPx = 8,
  [int]$MaxTopMarginPx = 220,
  [string]$ArtifactsRoot = "test-artifacts/emulator-5556-anchor-check"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

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

function Parse-Bounds {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Bounds
  )

  if ($Bounds -notmatch "^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$") {
    throw "Unexpected bounds value: $Bounds"
  }

  $left = [int]$Matches[1]
  $top = [int]$Matches[2]
  $right = [int]$Matches[3]
  $bottom = [int]$Matches[4]

  return [pscustomobject]@{
    Left = $left
    Top = $top
    Right = $right
    Bottom = $bottom
    CenterX = [int][math]::Floor(($left + $right) / 2.0)
    CenterY = [int][math]::Floor(($top + $bottom) / 2.0)
    Height = $bottom - $top
    Width = $right - $left
  }
}

function Get-NodeBounds {
  param(
    [Parameter(Mandatory = $true)]
    [System.Xml.XmlNode]$Node
  )

  return Parse-Bounds -Bounds $Node.Attributes["bounds"].Value
}

function Find-FirstNode {
  param(
    [Parameter(Mandatory = $true)]
    [xml]$XmlDoc,
    [Parameter(Mandatory = $true)]
    [string[]]$Xpaths
  )

  foreach ($xpath in $Xpaths) {
    $node = $XmlDoc.SelectSingleNode($xpath)
    if ($null -ne $node) {
      return $node
    }
  }

  return $null
}

function Save-UiDump {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [switch]$WithScreenshot
  )

  $remoteXml = "/sdcard/quiet_room_dump.xml"
  $localXml = Join-Path $RunDir "$Label.xml"

  $pulled = $false
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    Invoke-Adb -Args @("shell", "uiautomator", "dump", "--compressed", $remoteXml) -AllowFailure | Out-Null
    try {
      Invoke-Adb -Args @("pull", $remoteXml, $localXml) | Out-Null
      $pulled = $true
      break
    } catch {
      Start-Sleep -Milliseconds 350
    }
  }

  Invoke-Adb -Args @("shell", "rm", $remoteXml) -AllowFailure | Out-Null

  if (-not $pulled) {
    throw "Unable to capture ui dump after retries for label '$Label'."
  }

  $localPng = $null
  if ($WithScreenshot) {
    $localPng = Join-Path $RunDir "$Label.png"
    $captureCommand = "adb -s $DeviceId exec-out screencap -p > `"$localPng`""
    cmd /c $captureCommand | Out-Null
  }

  return [pscustomobject]@{
    Label = $Label
    XmlPath = $localXml
    PngPath = $localPng
  }
}

function Capture-UiDumpWithinWindow {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [int]$InitialDelayMs = 0,
    [int]$WindowMs = 2500,
    [int]$RetryDelayMs = 180,
    [switch]$WithScreenshot
  )

  if ($InitialDelayMs -gt 0) {
    Start-Sleep -Milliseconds $InitialDelayMs
  }

  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $lastError = $null

  while ($stopwatch.ElapsedMilliseconds -le $WindowMs) {
    try {
      $snapshot = Save-UiDump -Label $Label -WithScreenshot:$WithScreenshot
      return [pscustomobject]@{
        Snapshot = $snapshot
        ElapsedMs = [int]$stopwatch.ElapsedMilliseconds
      }
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds $RetryDelayMs
    }
  }

  if ($null -ne $lastError) {
    throw $lastError
  }

  throw "Unable to capture ui dump for label '$Label' within $WindowMs ms."
}

function Load-UiXml {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return [xml](Get-Content -Raw -Path $Path)
}

function Find-ProbeNode {
  param(
    [Parameter(Mandatory = $true)]
    [xml]$XmlDoc,
    [Parameter(Mandatory = $true)]
    [string]$ProbeText
  )

  $xpath = "//node[contains(@text,'$ProbeText') and @class='android.widget.TextView']"
  $nodes = $XmlDoc.SelectNodes($xpath)
  if ($null -eq $nodes -or $nodes.Count -eq 0) {
    return $null
  }

  # Prefer the upper-most matching text bubble when duplicates exist.
  $selected = $null
  $selectedTop = [int]::MaxValue
  foreach ($candidate in $nodes) {
    $bounds = Get-NodeBounds -Node $candidate
    if ($bounds.Top -lt $selectedTop) {
      $selectedTop = $bounds.Top
      $selected = $candidate
    }
  }

  return $selected
}

function Ensure-DeviceOnline {
  $devicesOutput = & adb devices
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to run 'adb devices'."
  }

  $lines = ($devicesOutput | Out-String) -split "`r?`n" | Where-Object { $_ -match "\S" }
  $deviceLine = $lines | Where-Object { $_ -match "^$([regex]::Escape($DeviceId))\s+" } | Select-Object -First 1
  if (-not $deviceLine -or $deviceLine -notmatch "\sdevice\s*$") {
    throw "Device '$DeviceId' is not online. adb devices output:`n$devicesOutput"
  }
}

function Wait-ForMainScreen {
  param(
    [int]$TimeoutSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $attempt = 0
  while ((Get-Date) -lt $deadline) {
    $attempt++
    try {
      $snapshot = Save-UiDump -Label ("wait_{0:D2}" -f $attempt)
      $xmlText = Get-Content -Raw -Path $snapshot.XmlPath
    } catch {
      Start-Sleep -Milliseconds 900
      continue
    }

    if ($xmlText -match "React Native Dev Menu") {
      Invoke-Adb -Args @("shell", "input", "keyevent", "4") -AllowFailure | Out-Null
      Start-Sleep -Milliseconds 350
      continue
    }

    if ($xmlText -match "Unable to load script") {
      throw "App is on redbox ('Unable to load script'). Snapshot: $($snapshot.XmlPath)"
    }

    if ($xmlText -match "Unable to load settings") {
      throw "App is showing 'Unable to load settings'. Snapshot: $($snapshot.XmlPath)"
    }

    if ($xmlText -match "Prompt cues" -and $xmlText -match "Share what is present") {
      return $snapshot
    }

    Start-Sleep -Milliseconds 900
  }

  throw "Timed out waiting for Quiet Room main screen on $DeviceId."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RunDir = Join-Path $ArtifactsRoot $timestamp
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

Write-Host "Anchor validation started."
Write-Host "Device: $DeviceId"
Write-Host "Artifacts: $RunDir"

Ensure-DeviceOnline

Invoke-Adb -Args @("shell", "input", "keyevent", "KEYCODE_WAKEUP") -AllowFailure | Out-Null
Invoke-Adb -Args @("shell", "wm", "dismiss-keyguard") -AllowFailure | Out-Null
Invoke-Adb -Args @("shell", "am", "force-stop", $AppPackage) -AllowFailure | Out-Null
Invoke-Adb -Args @("shell", "monkey", "-p", $AppPackage, "-c", "android.intent.category.LAUNCHER", "1") -AllowFailure | Out-Null
Start-Sleep -Milliseconds 2000

$readySnapshot = Wait-ForMainScreen
$beforeSnapshot = Save-UiDump -Label "before_send" -WithScreenshot
$beforeXml = Load-UiXml -Path $beforeSnapshot.XmlPath

$inputNode = Find-FirstNode -XmlDoc $beforeXml -Xpaths @(
  "//node[@class='android.widget.EditText' and @clickable='true']",
  "//node[@class='android.widget.EditText']"
)
if ($null -eq $inputNode) {
  throw "Could not locate composer text input on main screen."
}

$sendNode = Find-FirstNode -XmlDoc $beforeXml -Xpaths @(
  "//node[@content-desc='Send' and @clickable='true']",
  "//node[@content-desc='Send']",
  "//node[@text='Send' and @clickable='true']"
)
if ($null -eq $sendNode) {
  throw "Could not locate Send control on main screen."
}

$inputBounds = Get-NodeBounds -Node $inputNode
$sendBoundsBefore = Get-NodeBounds -Node $sendNode

$probeText = "anchor" + (Get-Date -Format "HHmmss")
Write-Host "Probe text: $probeText"

Invoke-Adb -Args @("shell", "input", "tap", "$($inputBounds.CenterX)", "$($inputBounds.CenterY)") | Out-Null
Start-Sleep -Milliseconds 120
Invoke-Adb -Args @("shell", "input", "text", $probeText) | Out-Null
Start-Sleep -Milliseconds 120
Invoke-Adb -Args @("shell", "input", "keyevent", "4") -AllowFailure | Out-Null
Start-Sleep -Milliseconds 250

$typedSnapshot = $null
$sendBounds = $sendBoundsBefore
try {
  $typedSnapshot = Save-UiDump -Label "typed_before_send" -WithScreenshot
  $typedXml = Load-UiXml -Path $typedSnapshot.XmlPath
  $sendNodeAfterType = Find-FirstNode -XmlDoc $typedXml -Xpaths @(
    "//node[@content-desc='Send' and @clickable='true']",
    "//node[@content-desc='Send']",
    "//node[@text='Send' and @clickable='true']"
  )

  if ($null -ne $sendNodeAfterType) {
    $sendBounds = Get-NodeBounds -Node $sendNodeAfterType
  }
} catch {
  Write-Host "Warning: skipping typed_before_send dump due to transient ui dump failure."
}

Invoke-Adb -Args @("shell", "input", "tap", "$($sendBounds.CenterX)", "$($sendBounds.CenterY)") | Out-Null

try {
  $immediateCapture = Capture-UiDumpWithinWindow -Label "after_send_immediate" -InitialDelayMs $ImmediateDelayMs -WindowMs 2600 -RetryDelayMs 180 -WithScreenshot
  $immediateSnapshot = $immediateCapture.Snapshot
  $immediateCaptureElapsedMs = $immediateCapture.ElapsedMs
} catch {
  throw "Immediate capture failed after send: $($_.Exception.Message)"
}

try {
  $lateCapture = Capture-UiDumpWithinWindow -Label "after_send_late" -InitialDelayMs $LateDelayMs -WindowMs 4000 -RetryDelayMs 250 -WithScreenshot
  $lateSnapshot = $lateCapture.Snapshot
} catch {
  throw "Late capture failed after send: $($_.Exception.Message)"
}

$immediateXml = Load-UiXml -Path $immediateSnapshot.XmlPath
$lateXml = Load-UiXml -Path $lateSnapshot.XmlPath

$probeImmediateNode = Find-ProbeNode -XmlDoc $immediateXml -ProbeText $probeText
$probeLateNode = Find-ProbeNode -XmlDoc $lateXml -ProbeText $probeText

$scrollNode = Find-FirstNode -XmlDoc $immediateXml -Xpaths @(
  "//node[@class='android.widget.ScrollView' and @scrollable='true']",
  "//node[@class='android.widget.ScrollView']"
)
$scrollBounds = if ($null -ne $scrollNode) { Get-NodeBounds -Node $scrollNode } else { $null }

$result = [ordered]@{
  run_dir = $RunDir
  device_id = $DeviceId
  probe_text = $probeText
  immediate_xml = $immediateSnapshot.XmlPath
  late_xml = $lateSnapshot.XmlPath
  immediate_png = $immediateSnapshot.PngPath
  late_png = $lateSnapshot.PngPath
  immediate_delay_ms = $ImmediateDelayMs
  immediate_capture_elapsed_ms = $immediateCaptureElapsedMs
  late_delay_ms = $LateDelayMs
}

$failed = $false

if ($null -eq $probeImmediateNode -and $null -eq $probeLateNode) {
  $failed = $true
  $result.status = "fail"
  $result.reason = "Probe message not found in either immediate or late snapshot."
} elseif ($null -eq $probeImmediateNode -and $null -ne $probeLateNode) {
  $lateBounds = Get-NodeBounds -Node $probeLateNode
  $failed = $true
  $result.status = "fail"
  $result.reason = "Probe appears late (not present in immediate snapshot)."
  $result.probe_top_late = $lateBounds.Top
  $result.probe_bottom_late = $lateBounds.Bottom
} elseif ($null -ne $probeImmediateNode -and $null -eq $probeLateNode) {
  $immediateBounds = Get-NodeBounds -Node $probeImmediateNode
  $failed = $true
  $result.status = "fail"
  $result.reason = "Probe present immediately but missing in late snapshot."
  $result.probe_top_immediate = $immediateBounds.Top
  $result.probe_bottom_immediate = $immediateBounds.Bottom
} else {
  $immediateBounds = Get-NodeBounds -Node $probeImmediateNode
  $lateBounds = Get-NodeBounds -Node $probeLateNode
  $anchorDriftPx = $lateBounds.Top - $immediateBounds.Top

  $result.probe_top_immediate = $immediateBounds.Top
  $result.probe_bottom_immediate = $immediateBounds.Bottom
  $result.probe_top_late = $lateBounds.Top
  $result.probe_bottom_late = $lateBounds.Bottom
  $result.anchor_drift_px = $anchorDriftPx
  $result.anchor_drift_abs_px = [math]::Abs($anchorDriftPx)

  if ($null -ne $scrollBounds) {
    $topMargin = $immediateBounds.Top - $scrollBounds.Top
    $result.scroll_top_px = $scrollBounds.Top
    $result.probe_top_margin_px = $topMargin
  }

  $driftOk = ([math]::Abs($anchorDriftPx) -le $MaxAnchorDriftPx)
  $immediateOk = ($immediateCaptureElapsedMs -le 350)
  $marginOk = $true
  if ($result.Contains("probe_top_margin_px")) {
    $marginValue = [int]$result.probe_top_margin_px
    $marginOk = ($marginValue -ge $MinTopMarginPx -and $marginValue -le $MaxTopMarginPx)
  }

  if (-not $immediateOk) {
    $failed = $true
    $result.status = "fail"
    $result.reason = "Immediate capture only became readable after $immediateCaptureElapsedMs ms."
  } elseif (-not $driftOk) {
    $failed = $true
    $result.status = "fail"
    $result.reason = "Anchor drift exceeds threshold ($MaxAnchorDriftPx px)."
  } elseif (-not $marginOk) {
    $failed = $true
    $result.status = "fail"
    $result.reason = "Probe top margin is outside thresholds (min=$MinTopMarginPx px, max=$MaxTopMarginPx px)."
  } else {
    $result.status = "pass"
    $result.reason = "Probe is visible immediately and stays pinned."
  }
}

$jsonPath = Join-Path $RunDir "result.json"
$result | ConvertTo-Json -Depth 5 | Set-Content -Path $jsonPath -Encoding UTF8

Write-Host ""
Write-Host "Anchor validation result:"
Write-Host ($result | ConvertTo-Json -Depth 5)
Write-Host "Saved report: $jsonPath"

if ($failed) {
  exit 1
}


















