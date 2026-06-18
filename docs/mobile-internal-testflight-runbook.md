# App Store Connect / TestFlight Runbook

Use this when we are ready to upload the QA or prod iOS app to App Store Connect and distribute it through internal TestFlight.

Current target:

- QA lane first on `Quiet Room QA` / `com.quietroom.mobile.qa`
- prod lane on `Quiet Room` / `com.quietroom.mobile`
- internal TestFlight first for QA, then prod-candidate validation on the prod app
- narrow first-flow validation: install, open, authenticate with guest or email/password, send one message, confirm one response renders

## Current Proven State

Observed through May 12, 2026:

- both App Store Connect app records exist
- branded QA and prod uploads both succeeded
- QA build `12` was uploaded successfully from the main `develop` tree
- PROD build `13` was uploaded successfully from the prod rollout worktree on April 24, 2026 with `testFlightInternalTestingOnly: true`
- PROD build `14` was uploaded successfully from the prod rollout worktree on May 12, 2026 with manual App Store signing and Sign in with Apple entitlement verification
- QA build `16` was uploaded successfully from the prod rollout worktree on May 12, 2026 with manual App Store signing and Sign in with Apple entitlement verification
- current working app split is:
  - QA: `Quiet Room QA` / `com.quietroom.mobile.qa`
  - PROD: `Quiet Room` / `com.quietroom.mobile`
- internal TestFlight is the active QA distribution lane
- the Hermes dSYM archive issue was fixed in the repo for future uploads
- QA now uses the refreshed App Store profile `matt profile qa`, UUID `a4879aba-247b-4795-8f04-23049307cbeb`, for `com.quietroom.mobile.qa`; the old automatic export path remains available with `--automatic-signing`
- the proven CLI path for PROD now uses the refreshed App Store profile `matt profile`, UUID `94fb0f32-2364-4562-a9cc-2cd898a99018`, which includes Sign in with Apple
- direct automatic archive can fail by trying to create a development provisioning profile when no registered devices exist
- manual archive against stale retained App Store profiles can fail when the profile does not include the current Sign in with Apple entitlement

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

PROD profile validation:

```bash
npm run ios:testflight:profile:prod
```

PROD local App Store export:

```bash
npm run ios:testflight:export:prod
```

PROD App Store Connect upload:

```bash
npm run ios:testflight:deploy:prod
```

## Build Number Policy

Keep QA and prod iOS build numbers separate.

- QA bundle id `com.quietroom.mobile.qa` owns its own increasing `CFBundleVersion` sequence.
- PROD bundle id `com.quietroom.mobile` owns its own increasing `CFBundleVersion` sequence.
- QA can increment freely for tester iterations.
- PROD should increment only when uploading a prod-candidate build.
- iOS `CFBundleVersion` does not need to match Android `versionCode`; record the mapping in release notes instead.
- The shared marketing version, such as `1.0.0`, can stay aligned across QA and prod when both lanes represent the same product version.

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

- QA App Store signing uses local profile `matt profile qa`, UUID `a4879aba-247b-4795-8f04-23049307cbeb`, for `SV7SPMY2Q8.com.quietroom.mobile.qa`. This profile includes `com.apple.developer.applesignin = Default`.
- Previous QA export profile: `iOS Team Store Provisioning Profile: com.quietroom.mobile.qa`
- Previous QA export profile UUID: `0aa92c3d-7853-48e2-8064-6b3f4191a6b7`
- QA certificate: `Apple Distribution`, SHA1 `ADDA1EC5846049A5B4DD0FEA4D81E4EB6D5E5A9E`
- QA app identifier entitlement: `SV7SPMY2Q8.com.quietroom.mobile.qa`
- PROD App Store signing uses local profile `matt profile`, UUID `94fb0f32-2364-4562-a9cc-2cd898a99018`, for `SV7SPMY2Q8.com.quietroom.mobile`. This profile includes `com.apple.developer.applesignin = Default`.

The refreshed QA profile was also observed in Downloads as `matt_profile_qa.mobileprovision`, then installed/detected under:

```text
~/Library/MobileDevice/Provisioning Profiles/a4879aba-247b-4795-8f04-23049307cbeb.mobileprovision
```

On April 21, 2026, the old QA export profile was also recovered from the prior QA `.ipa` and installed locally at:

```text
~/Library/MobileDevice/Provisioning Profiles/0aa92c3d-7853-48e2-8064-6b3f4191a6b7.mobileprovision
```

That old QA profile was useful as evidence that the App Store profile existed, but it is not the current reliable manual archive path because it did not include the Apple Sign In entitlement. Use the refreshed `matt profile qa` profile for QA deploys.

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

Validate the QA signing mode before archiving:

```bash
npm run ios:testflight:profile:qa
```

Expected signing evidence after the refreshed QA profile is downloaded:

```text
Using qa App Store provisioning profile
name: matt profile qa
uuid: a4879aba-247b-4795-8f04-23049307cbeb
application-identifier: SV7SPMY2Q8.com.quietroom.mobile.qa
com.apple.developer.applesignin: Default
```

Archive, sign with the refreshed QA profile, export, and upload as internal-only TestFlight:

```bash
npm run ios:testflight:deploy:qa
```

For a local App Store export without upload, use:

```bash
npm run ios:testflight:export:qa
```

If the refreshed QA profile is not ready yet, the old automatic export fallback is still available:

```bash
bash ./scripts/deploy-ios-testflight.sh qa --automatic-signing --upload
```

Why the old fallback worked when direct archive did not:

- Direct automatic archive tried to create an iOS development profile and failed because there were no registered devices available for that profile.
- Manual archive against the retained stale QA App Store profile failed on entitlement/profile-management mismatch.
- An unsigned archive avoids both archive-time signing traps.
- The later export step has enough context to sign for App Store Connect distribution.

The deploy script:

- runs the QA preflight via `scripts/with-mobile-env.sh qa qa`
- confirms the native iOS project is synced for `com.quietroom.mobile.qa`
- selects an installed or downloaded QA App Store profile for `SV7SPMY2Q8.com.quietroom.mobile.qa` that includes `com.apple.developer.applesignin = Default`
- archives with manual App Store signing using the selected profile UUID
- generates a build-local export options plist with `signingStyle = manual`
- verifies the signed archive entitlements before export
- uses `destination = upload` and `testFlightInternalTestingOnly = true` for `npm run ios:testflight:deploy:qa`

Successful output includes:

```text
Uploaded QuietRoomQA
** EXPORT SUCCEEDED **
```

For the May 12 QA build `16` upload, the log evidence included:

```text
Archive app entitlements verified:
  application-identifier: SV7SPMY2Q8.com.quietroom.mobile.qa
  com.apple.developer.applesignin: Default
Upload succeeded.
Uploaded QuietRoomQA
** EXPORT SUCCEEDED **
```

The first May 12 QA attempt used build `14` and archived successfully, but App Store Connect rejected it because QA bundle version `15` had already been uploaded previously. Build `16` is the accepted upload.

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

## Proven CLI Upload Path For PROD

This is the exact path that produced the successful PROD iOS build `13` upload from the prod rollout worktree on April 24, 2026.

Start from a fresh `master` checkout and make sure the intended prod environment files are present locally:

```bash
git fetch origin
git checkout master
git pull --ff-only
npm run ios:testflight:preflight:prod
```

Regenerate the prod native project before preparing final build numbers:

```bash
npm run native:sync:prod
```

Important ordering note:

- `native:sync:prod` can regenerate the Xcode project.
- After sync, the Xcode project may temporarily have stale `MARKETING_VERSION` or `CURRENT_PROJECT_VERSION` values.
- Run the prepare script after sync so `app.json`, `Info.plist`, and the Xcode project all agree.

For the April 24 PROD upload, the intended store versions were Android `versionCode 6` and iOS build `13`, so iOS was prepared explicitly:

```bash
bash ./scripts/prepare-ios-testflight.sh --version 1.0.0 --build-number 13
```

Verify the PROD identity and native metadata before archiving:

```bash
npm run ios:testflight:preflight:prod
```

The expected PROD preflight evidence for build `13` was:

```text
App name: Quiet Room
Bundle id: com.quietroom.mobile
Release env: prod
Info.plist CFBundleVersion: 13
MARKETING_VERSION: 1.0.0
CURRENT_PROJECT_VERSION: 13
```

Validate the refreshed PROD App Store profile before archiving:

```bash
npm run ios:testflight:profile:prod
```

Expected profile evidence:

```text
name: matt profile
uuid: 94fb0f32-2364-4562-a9cc-2cd898a99018
application-identifier: SV7SPMY2Q8.com.quietroom.mobile
com.apple.developer.applesignin: Default
```

Archive, sign with the refreshed profile, export, and upload as a standard
TestFlight/App Store Connect build that is eligible for external TestFlight
groups:

```bash
npm run ios:testflight:deploy:prod
```

For a local App Store export without upload, use:

```bash
npm run ios:testflight:export:prod
```

The deploy script:

- selects an installed `matt profile` for `SV7SPMY2Q8.com.quietroom.mobile` that includes `com.apple.developer.applesignin = Default`
- runs the PROD preflight via `scripts/with-mobile-env.sh prod prod`
- archives with manual App Store signing using the selected profile UUID
- generates a build-local export options plist with `signingStyle = manual` and `provisioningProfiles.com.quietroom.mobile = <selected profile UUID>`
- verifies the signed archive entitlements before export
- uses `destination = upload` and `testFlightInternalTestingOnly = false` for `npm run ios:testflight:deploy:prod`

Successful output includes:

```text
Archive app entitlements verified:
  application-identifier: SV7SPMY2Q8.com.quietroom.mobile
  com.apple.developer.applesignin: Default
Uploaded QuietRoom
** EXPORT SUCCEEDED **
```

If a newer PROD profile is downloaded later, either install it in `~/Library/MobileDevice/Provisioning Profiles` and let the script choose the newest matching profile, or pin it explicitly:

```bash
QUIET_ROOM_IOS_PROD_PROFILE_UUID=<new-uuid> npm run ios:testflight:deploy:prod
```

The April 24 upload logs included the old internal-only marker:

```text
Upload succeeded.
UPLOAD SUCCEEDED with no errors
testFlightInternalTestingOnly: true
```

That old marker is intentionally not used for prod deploys anymore. If App
Store Connect needs an external-eligible prod build, bump the iOS build number
and upload a new prod build; an already-uploaded internal-only build cannot be
converted in place.

After upload, run the status command one more time:

```bash
npm run ios:testflight:status:prod
```

Then use App Store Connect to wait for processing and attach the processed
build to the intended TestFlight group.

## Archive And Upload

Current proven repo-side order:

1. Sync the target variant with `npm run native:sync:qa` or `npm run native:sync:prod`.
2. Bump or set the build number after native sync with `npm run ios:testflight:prepare` or `bash ./scripts/prepare-ios-testflight.sh --version <version> --build-number <build>`.
3. Run the matching `npm run ios:testflight:preflight:qa` or `npm run ios:testflight:preflight:prod`.
4. For a local App Store export, run `npm run ios:testflight:export:qa` or `npm run ios:testflight:export:prod`.
5. For an App Store Connect upload, run `npm run ios:testflight:deploy:qa` or `npm run ios:testflight:deploy:prod`.
6. For normal Xcode uploads, open the generated iOS workspace under `ios/`.

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
- refresh and download the QA App Store profile for `com.quietroom.mobile.qa`
- verify it with `npm run ios:testflight:profile:qa`
- use `bash ./scripts/deploy-ios-testflight.sh qa --automatic-signing --upload` only as a temporary fallback

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
