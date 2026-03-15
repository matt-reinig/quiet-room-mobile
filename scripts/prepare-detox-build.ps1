param(
  [string]$OutputDir = 'D:\Temp\quiet-room-mobile-detox',
  [ValidateSet('debug', 'release')]
  [string]$BuildType = 'release'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot 'android'
$appApk = Join-Path $androidDir ("app\\build\\outputs\\apk\\$BuildType\\app-$BuildType.apk")
$testApk = Join-Path $androidDir ("app\\build\\outputs\\apk\\androidTest\\$BuildType\\app-$BuildType-androidTest.apk")
$gradleTasks = if ($BuildType -eq 'release') { 'assembleRelease assembleAndroidTest' } else { 'assembleDebug assembleAndroidTest' }

Push-Location $androidDir
try {
  & .\gradlew.bat $gradleTasks.Split(' ') "-DtestBuildType=$BuildType"
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle build failed with exit code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}

if (-not (Test-Path $appApk)) {
  throw "App APK not found at $appApk"
}
if (-not (Test-Path $testApk)) {
  throw "Test APK not found at $testApk"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Copy-Item -Path $appApk -Destination (Join-Path $OutputDir "app-$BuildType.apk") -Force
Copy-Item -Path $testApk -Destination (Join-Path $OutputDir "app-$BuildType-androidTest.apk") -Force

[ordered]@{
  build_type = $BuildType
  output_dir = $OutputDir
  app_apk = (Join-Path $OutputDir "app-$BuildType.apk")
  test_apk = (Join-Path $OutputDir "app-$BuildType-androidTest.apk")
} | ConvertTo-Json -Depth 3 | Write-Host
