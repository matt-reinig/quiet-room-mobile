# App Store Connect / TestFlight Runbook

Use this when we are ready to upload the QA or prod iOS app to App Store Connect and distribute it through internal TestFlight.

Current target:

- QA lane first on `Quiet Room QA` / `com.quietroom.mobile.qa`
- prod lane on `Quiet Room` / `com.quietroom.mobile`
- internal TestFlight first for QA, then prod-candidate validation on the prod app
- narrow first-flow validation: install, open, authenticate with guest or email/password, send one message, confirm one response renders

## Current Proven State

Observed by April 21, 2026:

- both App Store Connect app records exist
- branded QA and prod uploads both succeeded
- QA build `12` was uploaded successfully from the main `develop` tree
- current working app split is:
  - QA: `Quiet Room QA` / `com.quietroom.mobile.qa`
  - PROD: `Quiet Room` / `com.quietroom.mobile`
- internal TestFlight is the active QA distribution lane
- the Hermes dSYM archive issue was fixed in the repo for future uploads
- the proven CLI path for QA is an unsigned archive followed by automatic-signing `xcodebuild -exportArchive`
- direct automatic archive can fail by trying to create a development provisioning profile when no registered devices exist
- manual archive against the stale retained QA App Store profile can fail because the profile is Xcode-managed and may not include the current Sign in with Apple entitlement

## What This Repo Now Supports

From `quiet-room-mobile`:

```bash
npm run ios:testflight:status:qa
```

```bash
npm run ios:testflight:status:prod
```

These explicit status commands load the correct QA or prod env first, then show
the iOS release metadata, selected Firebase plist, and runtime backend values so
we can catch a prod build accidentally pointing at QA before upload.

```bash
npm run ios:testflight:prepare
```

Bumps the iOS build number by one and syncs these files:

- `app.json`
- `ios/quietroommobile/Info.plist`
- `ios/quietroommobile.xcodeproj/project.pbxproj`

Optional explicit version/build:

```bash
bash ./scripts/prepare-ios-testflight.sh --version 1.0.1 --build-number 7
```

Dry run:

```bash
bash ./scripts/prepare-ios-testflight.sh --dry-run --version 1.0.1 --build-number 7
```

## Repo-Side Prep Checklist

Before archiving:

- Prefer the explicit variant-aware status and preflight commands instead of
  relying on bare `.env`.
- Confirm the correct variant-specific Google services plist is present if the build still depends on Firebase startup:
  - QA: `GoogleService-Info.qa.plist`
  - PROD: `GoogleService-Info.prod.plist`
- Sync the selected variant before opening Xcode:

```bash
npm run native:sync:qa
```

or

```bash
npm run native:sync:prod
```

- Run `npm run ios:testflight:status:qa` for QA uploads or
  `npm run ios:testflight:status:prod` for prod uploads.
- If the next upload needs a new build number, run `npm run ios:testflight:prepare`.
- Review the metadata diff before uploading:

```bash
git diff -- app.json ios/quietroommobile/Info.plist ios/quietroommobile.xcodeproj/project.pbxproj
```

Current intentional product caveats for the first beta:

- iOS Google sign-in now works locally, but it should not be the first beta blocker
- the first Emily pass should use guest flow or email/password first

Fast repo-side readiness check:

```bash
npm run ios:testflight:preflight:qa
```

or

```bash
npm run ios:testflight:preflight:prod
```

This checks for:

- the base and overlay env files actually loaded for the selected lane
- the selected variant-specific Google services plist
- required Firebase and Google auth env keys from the current environment
- whether the resolved runtime config matches the expected variant and release env
- current iOS version/build metadata alignment
- the actual runtime backend and Firebase project values that will ship in the archive

## App Store Connect Setup

These steps are outside the repo, but they are required for internal TestFlight:

1. Confirm Apple Developer Program membership is active.
2. Confirm you can access App Store Connect.
3. Create or confirm the QA app record for bundle id `com.quietroom.mobile.qa`.
4. Create or confirm the prod app record for bundle id `com.quietroom.mobile`.
5. Add internal testers as App Store Connect users on the team.
6. Make sure the testers have access to the relevant app record.
7. Create or confirm the internal TestFlight groups you want for QA and prod.

Practical note:

- internal testers must be App Store Connect users on your team
- this is different from external TestFlight, where testers can be invited by email without App Store Connect team access

## Choose The Variant

Pick the lane before you archive:

- QA upload:
  - app name: `Quiet Room QA`
  - bundle id: `com.quietroom.mobile.qa`
  - release env: `qa`
  - destination record: QA App Store Connect app
- PROD upload:
  - app name: `Quiet Room`
  - bundle id: `com.quietroom.mobile`
  - release env: `prod`
  - destination record: prod App Store Connect app

## Known Signing Profiles

Known-good signing from prior App Store Connect exports:

- QA used Xcode automatic signing against Apple team `SV7SPMY2Q8`.
- QA export profile: `iOS Team Store Provisioning Profile: com.quietroom.mobile.qa`
- QA export profile UUID: `0aa92c3d-7853-48e2-8064-6b3f4191a6b7`
- QA certificate: `Apple Distribution`, SHA1 `ADDA1EC5846049A5B4DD0FEA4D81E4EB6D5E5A9E`
- QA app identifier entitlement: `SV7SPMY2Q8.com.quietroom.mobile.qa`
- PROD has also been uploaded manually with local profile `matt profile`, UUID `813aa861-2624-427f-a3bf-2818af5f10c4`, for `SV7SPMY2Q8.com.quietroom.mobile`.

The QA profile above was observed in `build-records/ios/QuietRoomQA-export/DistributionSummary.plist` from the store-distribution worktree. It is not currently installed as a named local profile under `~/Library/MobileDevice/Provisioning Profiles`; the retained local profile there is the prod `matt profile`.

On April 21, 2026, the old QA export profile was also recovered from the prior QA `.ipa` and installed locally at:

```text
~/Library/MobileDevice/Provisioning Profiles/0aa92c3d-7853-48e2-8064-6b3f4191a6b7.mobileprovision
```

That profile was useful as evidence that the App Store profile existed, but it was not the reliable archive path. A manual archive using that profile failed because the profile was Xcode-managed and did not include the current Apple Sign In entitlement. The successful path was to create the archive with signing disabled, then let `xcodebuild -exportArchive -allowProvisioningUpdates` perform automatic App Store distribution signing during upload.

## Proven CLI Upload Path For QA

This is the exact path that produced the successful QA iOS build `12` upload from the main `quiet-room-mobile` `develop` tree on April 21, 2026.

Start from a fresh `develop` checkout and make sure the intended QA environment files are present locally:

```bash
git checkout develop
git pull --ff-only
npm run ios:testflight:preflight:qa
```

Regenerate the QA native project before preparing final build numbers:

```bash
npm run native:sync:qa
```

Important ordering note:

- `native:sync:qa` can regenerate the Xcode project.
- After sync, the Xcode project may temporarily have stale `MARKETING_VERSION` or `CURRENT_PROJECT_VERSION` values.
- Run the prepare script after sync so `app.json`, `Info.plist`, and the Xcode project all agree.

For the April 21 QA upload, the intended store versions were Android `versionCode 5` and iOS build `12`, so iOS was prepared explicitly:

```bash
bash ./scripts/prepare-ios-testflight.sh --version 1.0.0 --build-number 12
```

Verify the QA identity and native metadata before archiving:

```bash
npm run ios:testflight:preflight:qa
```

The expected QA preflight evidence for build `12` was:

```text
App name: Quiet Room QA
Bundle id: com.quietroom.mobile.qa
Release env: qa
Info.plist CFBundleVersion: 12
MARKETING_VERSION: 1.0.0
CURRENT_PROJECT_VERSION: 12
```

Create an unsigned Release archive:

```bash
rm -rf build/QuietRoomQA-b12-unsigned.xcarchive build/QuietRoomQA-b12.xcarchive

bash ./scripts/with-mobile-env.sh qa qa xcodebuild \
  -workspace ios/QuietRoomQA.xcworkspace \
  -scheme QuietRoomQA \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/QuietRoomQA-b12-unsigned.xcarchive \
  CODE_SIGNING_ALLOWED=NO \
  archive
```

Why this works when direct archive did not:

- Direct automatic archive tried to create an iOS development profile and failed because there were no registered devices available for that profile.
- Manual archive against the retained QA App Store profile failed on entitlement/profile-management mismatch.
- An unsigned archive avoids both archive-time signing traps.
- The later export step has enough context to sign for App Store Connect distribution.

Confirm the archive identity before upload:

```bash
plutil -p build/QuietRoomQA-b12-unsigned.xcarchive/Products/Applications/QuietRoomQA.app/Info.plist | rg 'CFBundleIdentifier|CFBundleShortVersionString|CFBundleVersion'
```

Expected values:

```text
CFBundleIdentifier = com.quietroom.mobile.qa
CFBundleShortVersionString = 1.0.0
CFBundleVersion = 12
```

Create an App Store Connect upload export options plist:

```bash
rm -rf build/testflight-export-qa-b12
mkdir -p build/testflight-export-qa-b12
cp scripts/ios-export-options-app-store.plist build/exportOptions-upload-qa-b12.plist
plutil -replace destination -string upload build/exportOptions-upload-qa-b12.plist
plutil -insert testFlightInternalTestingOnly -bool false build/exportOptions-upload-qa-b12.plist 2>/dev/null || \
  plutil -replace testFlightInternalTestingOnly -bool false build/exportOptions-upload-qa-b12.plist
```

The important export plist settings are:

```text
destination = upload
method = app-store-connect
signingStyle = automatic
teamID = SV7SPMY2Q8
manageAppVersionAndBuildNumber = false
stripSwiftSymbols = true
uploadSymbols = true
testFlightInternalTestingOnly = false
```

Export and upload:

```bash
xcodebuild -exportArchive \
  -archivePath build/QuietRoomQA-b12-unsigned.xcarchive \
  -exportPath build/testflight-export-qa-b12 \
  -exportOptionsPlist build/exportOptions-upload-qa-b12.plist \
  -allowProvisioningUpdates
```

Successful output includes:

```text
Uploaded QuietRoomQA
** EXPORT SUCCEEDED **
```

The upload logs live in a temporary `*.xcdistributionlogs` directory. For the April 21 upload, the log evidence included:

```text
Upload succeeded
UPLOAD SUCCEEDED with no errors
App Store Connect app: Quiet Room QA
Bundle id: com.quietroom.mobile.qa
App Store app id: 6762064538
```

After upload, run the status command one more time:

```bash
npm run ios:testflight:status:qa
```

Then use App Store Connect to wait for processing and attach the build to the intended internal TestFlight group.

## Archive And Upload

Current proven repo-side order:

1. Sync the target variant with `npm run native:sync:qa` or `npm run native:sync:prod`.
2. Bump or set the build number after native sync with `npm run ios:testflight:prepare` or `bash ./scripts/prepare-ios-testflight.sh --version <version> --build-number <build>`.
3. Run the matching `npm run ios:testflight:preflight:qa` or `npm run ios:testflight:preflight:prod`.
4. For QA CLI uploads, prefer the proven unsigned archive plus automatic export/upload path above.
5. For normal Xcode uploads, open the generated iOS workspace under `ios/`.
6. Archive a Release build.
7. Upload it to App Store Connect with your logged-in Apple account session.

From repo root:

```bash
open ios/*.xcworkspace
```

In Xcode:

1. Select the app scheme generated for the current variant.
2. Select `Any iOS Device (arm64)` or the current generic iOS device target.
3. Set the build configuration to `Release`.
4. Use `Product > Archive`.
5. When the archive finishes, Organizer opens.
6. Choose `Distribute App`.
7. Choose `App Store Connect`.
8. Choose `Upload`.
9. Keep automatic signing unless Xcode shows a signing problem you need to fix manually.
10. Complete the upload and wait for build processing in App Store Connect.

If Xcode blocks on signing before archive:

- choose the Apple team in Signing and Capabilities
- confirm the bundle id still matches the selected QA or prod app record
- let Xcode regenerate provisioning if needed

If QA signing is stubborn:

- keep the repo-side variant sync intact
- let Xcode refresh automatic signing for the QA bundle id
- then retry the archive/upload flow rather than changing the app identity by hand

## Assign The Build To Testers

In App Store Connect after processing:

1. Open the app.
2. Open the `TestFlight` tab.
3. Open the internal testing section.
4. Add the new build to the internal group.
5. Add the intended internal testers to that group if they are not already there.
6. Send or confirm the invite.

## Tester-Side Steps

Each internal tester needs to:

1. Accept the App Store Connect team invite.
2. Install the TestFlight app from the App Store.
3. Accept the TestFlight invite for the app.
4. Install the build.
5. Run the narrow first validation flow.

Ask testers to report:

- install friction
- login friction
- layout problems
- copy that feels confusing
- one screenshot for any visual breakage

## First Beta Acceptance

The first internal TestFlight milestone is successful when:

- the selected QA or prod build appears in App Store Connect
- an internal tester can install the app from TestFlight
- the tester can open the app
- the tester can finish one simple chat flow
- we capture a short list of issues for the next build

## Repeat Loop For The Next Build

For each follow-up beta:

1. Fix the issue.
2. Run `npm run ios:testflight:prepare`.
3. Re-sync the intended QA or prod variant.
4. Run the matching iOS TestFlight preflight for that lane.
5. Archive and upload again from Xcode.
6. Attach the new build to the internal group.
7. Have testers retest only the narrow area we changed, plus one smoke check.
