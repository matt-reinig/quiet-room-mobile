param(
  [string]$Variant = "debug",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"

$sdkRoot = "D:\Android"
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
$tempRoot = "D:\Temp"
$androidUserHome = "D:\Android\.android"
$gradleUserHome = "D:\Android\.gradle"
$npmCache = "D:\Temp\npm-cache"
$projectRoot = Split-Path -Parent $PSCommandPath

if (-not (Test-Path $sdkRoot)) {
  throw "Android SDK root not found at $sdkRoot"
}

if (-not (Test-Path $javaHome)) {
  throw "Java home not found at $javaHome"
}

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
New-Item -ItemType Directory -Force -Path $androidUserHome | Out-Null
New-Item -ItemType Directory -Force -Path $gradleUserHome | Out-Null
New-Item -ItemType Directory -Force -Path $npmCache | Out-Null

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_USER_HOME = $androidUserHome
$env:GRADLE_USER_HOME = $gradleUserHome
$env:TEMP = $tempRoot
$env:TMP = $tempRoot
$env:JAVA_HOME = $javaHome
$env:NPM_CONFIG_CACHE = $npmCache
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"

Write-Host "ProjectRoot=$projectRoot"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
Write-Host "ANDROID_USER_HOME=$env:ANDROID_USER_HOME"
Write-Host "GRADLE_USER_HOME=$env:GRADLE_USER_HOME"
Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "TEMP=$env:TEMP"
Write-Host "NPM_CONFIG_CACHE=$env:NPM_CONFIG_CACHE"

$cmdArgs = @("expo", "run:android", "--variant", $Variant) + $ExtraArgs

Push-Location $projectRoot
try {
  & npx @cmdArgs
} finally {
  Pop-Location
}
