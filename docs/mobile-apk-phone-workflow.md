# Mobile APK Phone Workflow

Use this when you want the latest local Android build on a physical phone without going through Play Store or EAS.

## Prerequisites

- Android phone connected over USB with USB debugging enabled
- `adb` available on your machine
- Android toolchain working for `quiet-room-mobile/android`
- For Google sign-in builds, keep a local untracked `google-services.json` at `quiet-room-mobile/google-services.json`
- If you store it elsewhere, set `EXPO_PUBLIC_GOOGLE_SERVICES_FILE` to that relative path before building

## Check connected devices

From repo root:

```powershell
adb devices
```

Expected:

- one physical device such as `42151JEKB05266`
- optional emulator such as `emulator-5554`

## Build the latest release APK

From `quiet-room-mobile/android`:

```powershell
./gradlew.bat assembleRelease
```

Output APK:

```text
quiet-room-mobile/android/app/build/outputs/apk/release/app-release.apk
```

## Install the APK on the phone

Replace the device serial if needed:

```powershell
adb -s 42151JEKB05266 install -r "d:\Gabriel App\quiet-room-mobile\android\app\build\outputs\apk\release\app-release.apk"
```

Notes:

- `-r` replaces the existing app and keeps app data when Android allows it.
- If both emulator and phone are connected, always pass `-s <device-id>`.

## Confirm the phone has the newer build

```powershell
adb -s 42151JEKB05266 shell dumpsys package com.quietroom.mobile | Select-String -Pattern "versionName|lastUpdateTime"
```

You can also compare the APK timestamp:

```powershell
Get-ChildItem quiet-room-mobile\android\app\build\outputs\apk\release
```

## Common issues

### Build fails with locked generated files

Stop Metro or leftover build workers tied to `quiet-room-mobile`, then remove stale generated folders and rebuild.

Typical cleanup:

```powershell
adb devices
cmd /c rmdir /s /q "D:\Gabriel App\quiet-room-mobile\android\app\build\generated\assets\createBundleReleaseJsAndAssets"
cmd /c rmdir /s /q "D:\Gabriel App\quiet-room-mobile\node_modules\expo-modules-core\android\.cxx"
```

Then rerun:

```powershell
cd quiet-room-mobile\android
./gradlew.bat assembleRelease
```

### Google sign-in breaks on Android

Current app behavior:

- Android uses native Google Sign-In
- Firebase Auth still completes the final login

Current requirements:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` must be set in `.env`
- Firebase Authentication must have Google enabled
- `google-services.json` must match the Firebase project for the app
- `google-services.json` is intentionally gitignored and should not be committed
- The active signing SHA-1 must be registered in Firebase / Google Cloud

Important:

- local release builds in this repo are still signed with the debug keystore
- if you later switch to a real release keystore, add that release SHA-1 too

## Fast path

```powershell
cd "d:\Gabriel App\quiet-room-mobile\android"
./gradlew.bat assembleRelease
adb -s 42151JEKB05266 install -r "d:\Gabriel App\quiet-room-mobile\android\app\build\outputs\apk\release\app-release.apk"
```
