# QR-MOB-020 - Investigation

## Summary

QA iOS build `25` is most likely a bad build artifact produced from a stale ignored `ios/` tree, not a current `develop` source regression.

I reproduced a launch failure locally from the existing generated iOS tree after pulling `develop`: the release-simulator app installed and launched, but stayed on a blank white screen. Simulator logs for the app process showed:

```text
[com.facebook.react.log:native] No component found for view with name "RNCSafeAreaProvider"
```

That means the JavaScript bundle rendered `react-native-safe-area-context`, but the native iOS project used for the build did not include the Safe Area native component.

After running `npm run native:sync:qa -- ios`, CocoaPods/codegen added `react-native-safe-area-context`. Rebuilding and reinstalling the QA release-simulator artifact then reached the Quiet Room home screen.

## Evidence Captured

- Current branch after pull: `develop...origin/develop`.
- Current QA config checks passed:
  - `npm run mobile:verify:qa`
  - `npm run ios:testflight:status:qa`
  - `npm run ios:testflight:preflight:qa`
- Current QA config resolved to:
  - app name: `Quiet Room QA`
  - bundle ID: `com.quietroom.mobile.qa`
  - iOS build number: `25`
  - Firebase plist: `GoogleService-Info.qa.plist`
  - Firebase project: `gabriel-qa-89f20`
  - Firebase Auth emulator host: empty
  - QA API and streaming Lambda URLs
- `npm run typecheck` passed.
- `npm run detox:build:ios:qa` succeeded before native sync, but the installed release-simulator app blank-screened on launch.
- Failing local launch screenshot:
  - `/tmp/quietroom-qa-build25-startup.png`
- Failing local launch log signature:
  - `No component found for view with name "RNCSafeAreaProvider"`
- Before native sync, these files did not contain `react-native-safe-area-context`:
  - `ios/Podfile.lock`
  - `ios/Pods/Manifest.lock`
  - generated iOS component provider output
- `ios/` is ignored by git, so stale native state is invisible in normal `git status`.
- After `npm run native:sync:qa -- ios`, the generated iOS tree included:
  - `react-native-safe-area-context (5.6.2)` in `ios/Podfile.lock`
  - `react-native-safe-area-context (5.6.2)` in `ios/Pods/Manifest.lock`
  - `RNCSafeAreaProvider` and `RNCSafeAreaView` in `ios/build/generated/ios/RCTThirdPartyComponentsProvider.mm`
- After native sync, `npm run detox:build:ios:qa` succeeded again.
- Synced artifact Info.plist:
  - `CFBundleIdentifier`: `com.quietroom.mobile.qa`
  - `CFBundleVersion`: `25`
  - `CFBundleDisplayName`: `Quiet Room QA`
- Synced artifact launch:
  - simulator launch returned PID `95842`
  - screenshot reached the Quiet Room home screen: `/tmp/quietroom-qa-build25-synced-startup.png`
  - targeted log search found no `RNCSafeAreaProvider`, `No component found for view`, fatal exception, or terminating-app signature.

## Root Cause

The release build can be generated from stale ignored native iOS artifacts.

The app source now depends on `react-native-safe-area-context`, and the JS renders Safe Area components. If the local/generated native iOS project has not been regenerated since that dependency was introduced, the JS bundle and native binary disagree. The native binary lacks `RNCSafeAreaProvider`, so React Native fails during startup and the app remains blank.

This matches the suspected build `25` symptom better than a QA runtime config, Firebase/Auth, backend, or signing issue. The config checks pass, the synced release-simulator artifact reaches the home screen, and the failure is removed by regenerating native iOS dependencies without changing application source.

## Limits

I did not inspect a tester's physical device or App Store Connect build logs in this pass. The conclusion is based on local release-simulator reproduction from the stale native tree present after pulling `develop`, then successful launch after native sync.

## Build 26 Recovery Attempt

After the root cause was identified, I prepared QA iOS build `26` from current `develop`:

- `npm run native:sync:qa -- ios`
- `bash ./scripts/prepare-ios-testflight.sh --version 1.0.0 --build-number 26`
- `npm run mobile:verify:qa`
- `npm run ios:testflight:status:qa`
- `npm run ios:testflight:preflight:qa`
- `npm run typecheck`
- `npm run detox:build:ios:qa`

Build `26` verification results:

- preflight: 16 pass / 0 warn / 0 fail
- typecheck passed
- release-simulator build succeeded
- release-simulator Info.plist: `com.quietroom.mobile.qa`, build `26`, `Quiet Room QA`
- simulator launch reached the Quiet Room home screen: `/tmp/quietroom-qa-build26-synced-startup.png`
- targeted startup log search found no `RNCSafeAreaProvider`, `No component found for view`, fatal exception, or terminating-app signature

The device archive also succeeded:

- archive: `build/ios-qa-b26.xcarchive`
- signing profile: `matt profile qa`
- application identifier: `SV7SPMY2Q8.com.quietroom.mobile.qa`
- Apple Sign In entitlement: `Default`
- archive output: `** ARCHIVE SUCCEEDED **`

The first App Store Connect upload did not complete because local Xcode account access was broken:

```text
error: exportArchive Failed to Use Accounts
Failed to find an account with App Store Connect access for team ... teamID='SV7SPMY2Q8'
```

That upload blocker matched the known Xcode/App Store Connect session failure mode from prior iOS QA deploys. It was not a build `26` app regression.

A local App Store export from the successful archive did work:

- export path: `build/testflight-export-qa-b26-local`
- export output: `** EXPORT SUCCEEDED **`

After Xcode was restarted, re-exporting the existing archive with `build/exportOptions-qa-b26.plist` succeeded and uploaded to App Store Connect/TestFlight:

- archive: `build/ios-qa-b26.xcarchive`
- upload output: `Uploaded package is processing`
- upload output: `Upload succeeded`
- upload output: `Uploaded QuietRoomQA`
- export output: `** EXPORT SUCCEEDED **`
