# QR-MOB-020 - Recovery Recommendation

## Recommendation

Upload a new QA iOS build from current `develop` after regenerating the native iOS tree. Do not try to reuse build `25`; App Store Connect requires a higher build number once a build number has been uploaded.

Recommended next QA build: `26`.

Build `26` has now passed local config, typecheck, release-simulator build, simulator launch, device archive, entitlement verification, local export, and App Store Connect/TestFlight upload.

## Recovery Steps

1. Start from current `develop` and confirm the worktree is clean.

```bash
git checkout develop
git pull --ff-only origin develop
git status --short --branch
```

2. Regenerate the ignored native iOS artifacts for the QA lane.

```bash
npm run native:sync:qa -- ios
```

3. Verify QA config and TestFlight metadata before archive/upload.

```bash
npm run mobile:verify:qa
npm run ios:testflight:status:qa
npm run ios:testflight:preflight:qa
```

4. Bump to a new iOS build number.

```bash
bash ./scripts/prepare-ios-testflight.sh --build-number 26
```

5. Build and launch the QA release-simulator artifact before uploading.

```bash
npm run detox:build:ios:qa
xcrun simctl boot "iPhone 17" 2>/dev/null || true
xcrun simctl uninstall booted com.quietroom.mobile.qa 2>/dev/null || true
xcrun simctl install booted ios/build/Build/Products/Release-iphonesimulator/QuietRoomQA.app
xcrun simctl launch booted com.quietroom.mobile.qa
```

6. Confirm the app reaches the Quiet Room home screen and logs do not show the stale-native failure.

```bash
xcrun simctl spawn booted log show --last 3m --style compact --predicate 'process == "QuietRoomQA"' \
  | rg "No component found for view|RNCSafeArea|Fatal|Uncaught JS Exception|Terminating app|Invariant Violation"
```

7. Upload build `26` through the QA TestFlight deploy lane after local proof is captured.

```bash
npm run ios:testflight:deploy:qa
```

If upload fails with `exportArchive Failed to Use Accounts`, restore App Store Connect access in Xcode Accounts for team `SV7SPMY2Q8`, then retry from the existing archive rather than rebuilding. That was the successful recovery path for build `26` after Xcode was restarted:

```bash
xcodebuild -exportArchive \
  -archivePath build/ios-qa-b26.xcarchive \
  -exportPath build/testflight-export-qa-b26 \
  -exportOptionsPlist build/exportOptions-qa-b26.plist \
  -allowProvisioningUpdates
```

## Rollback Option

If build `26` does not become available to testers after Apple processing completes, build `23` remains the last recorded temporary rollback option if it is still installable for the affected testers in TestFlight.

## Process Hardening

Because `/ios` is ignored, a clean-looking git checkout can still contain stale generated native state. The iOS deploy path should either:

- run `npm run native:sync:qa -- ios` before archive/upload, or
- fail preflight when generated iOS Pods/codegen do not match installed native dependencies.

The narrower immediate fix is operational: every QA iOS archive/upload should be preceded by `npm run native:sync:qa -- ios` and a release-simulator launch proof.
