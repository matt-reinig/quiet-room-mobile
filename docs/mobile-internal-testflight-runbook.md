# Internal TestFlight Runbook

Use this when we are ready to put the iOS app in front of the first internal tester through TestFlight.

Current target:

- Emily on iPhone
- internal TestFlight first
- narrow first-flow validation: install, open, authenticate with guest or email/password, send one message, confirm one response renders

## What This Repo Now Supports

From `quiet-room-mobile`:

```bash
npm run ios:testflight:status
```

Shows the current iOS release metadata in both Expo config and native Xcode files so we can catch version drift before upload.

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

- Confirm local `.env` points at the backend you want Emily to hit.
- Confirm `GoogleService-Info.plist` is present if the build still depends on Firebase startup.
- Run `npm run ios:testflight:status`.
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
npm run ios:testflight:preflight
```

This checks for:

- local `.env`
- `GoogleService-Info.plist`
- required Firebase and Google auth env keys
- current iOS version/build metadata alignment
- whether the app still shows the placeholder visible name

What a good local state should look like before you open Xcode:

- `npm run ios:testflight:preflight` passes
- `npm run ios:testflight:status` shows the bundle id you expect and a build number higher than the last TestFlight upload
- local signing in Xcode already knows your Apple team and distribution certificate
- `GoogleService-Info.plist` and any required `.env` values are present in the repo

## App Store Connect Setup

These steps are outside the repo, but they are required for internal TestFlight:

1. Confirm Apple Developer Program membership is active.
2. Confirm you can access App Store Connect.
3. Create or confirm the app record for bundle id `com.quietroom.mobile`.
4. Add Emily as an App Store Connect user on the team.
5. Make sure Emily has access to the app record.
6. Create or confirm an internal TestFlight group for this app.

Practical note:

- internal testers must be App Store Connect users on your team
- this is different from external TestFlight, where testers can be invited by email without App Store Connect team access

## Archive And Upload

From repo root:

```bash
open ios/quietroommobile.xcworkspace
```

In Xcode, use this exact mental model:

- `Run` puts a dev build on a simulator or attached phone.
- `Archive` creates the signed release artifact that Apple accepts for TestFlight and App Store upload.
- `Organizer` is the screen where you take that archive and distribute it to App Store Connect.

### Step-by-step Xcode flow

1. Open [quietroommobile.xcworkspace](/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/ios/quietroommobile.xcworkspace).
2. In the top toolbar, make sure the active scheme is `quietroommobile`.
3. Change the run destination to `Any iOS Device (arm64)` or another generic iOS device target.
4. Confirm the build configuration is `Release` if Xcode exposes that choice in the current UI.
5. In the menu bar, choose `Product > Archive`.
6. Wait for the archive to finish. This can take a while on React Native projects and the first archive after native changes is usually the slowest.
7. When Organizer opens to `Archives`, select the newest archive for `quietroommobile`.
8. Click `Distribute App`.
9. Choose the `App Store Connect` distribution method.
10. Choose `Upload`.
11. Keep the recommended settings unless Xcode surfaces a concrete signing or capability error you need to address.
12. Continue until Xcode shows the upload progress sheet.
13. Wait through the App Store Connect analysis/upload step. This can sit on `Waiting for App Store Connect analysis response` for a bit before it advances.
14. Finish when Organizer shows an `App upload complete` screen.

### What we just used successfully

This repo already uploaded successfully through the flow above using:

- scheme: `quietroommobile`
- bundle id: `com.quietroom.mobile`
- team: `SV7SPMY2Q8`
- distribution certificate: `Apple Distribution: Matthew Reinig (SV7SPMY2Q8)`
- provisioning profile: `matt profile`

### Build number behavior to expect

This one is easy to miss the first time:

- your local repo may say one build number before upload
- App Store Connect may already have higher builds for the same version
- Xcode can auto-manage the final uploaded build number during distribution

That happened here:

- local repo build before upload: `4`
- App Store Connect already had builds through `7`
- uploaded TestFlight build ended up as `1.0.0 (8)`

So after a successful upload, always run:

```bash
npm run ios:testflight:status
```

If Xcode auto-advanced the uploaded build number, sync the repo files to match before the next beta cycle:

- `app.json`
- `ios/quietroommobile/Info.plist`
- `ios/quietroommobile.xcodeproj/project.pbxproj`

### If archive succeeds but export/upload fails

Treat these as separate stages:

1. archive
2. distribute
3. App Store Connect processing

Common examples:

- archive succeeds but Xcode says the bundle version must be higher than a previously uploaded build
- archive succeeds but the distribution step wants an explicit provisioning profile
- upload succeeds but the build still needs App Store Connect processing time before it is selectable in TestFlight

If the error says the build number must be higher:

- bump the iOS build number again
- re-archive
- upload again

If the error is signing-related before archive:

- choose the correct Apple team in Signing and Capabilities
- confirm the bundle id is still `com.quietroom.mobile`
- confirm the distribution certificate is present on the Mac
- let Xcode regenerate or download provisioning if needed

### Optional CLI path we validated

The Xcode Organizer flow above should still be treated as the normal path, but we also confirmed the repo can produce a proper archive and IPA from terminal:

```bash
xcodebuild -workspace ios/quietroommobile.xcworkspace \
  -scheme quietroommobile \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/quietroommobile.xcarchive archive
```

Then export:

```bash
xcodebuild -exportArchive \
  -archivePath build/quietroommobile.xcarchive \
  -exportPath build/testflight-export \
  -exportOptionsPlist build/exportOptions-appstore.plist
```

Current successful artifact locations:

- [quietroommobile.xcarchive](/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/build/quietroommobile.xcarchive)
- [quietroommobile.ipa](/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/build/testflight-export/quietroommobile.ipa)

Future improvement:

- we could automate archive export and TestFlight upload with CLI tooling such as `xcodebuild` plus Apple upload tooling like `altool` or its current equivalent
- until that automation is implemented and documented here, treat the Xcode Organizer flow above as the source of truth
- any scripted path should mirror this process rather than replace it informally

If Xcode blocks on signing before archive:

- choose the Apple team in Signing and Capabilities
- confirm the bundle id is still `com.quietroom.mobile`
- let Xcode regenerate provisioning if needed

## Assign The Build To Emily

In App Store Connect after processing:

1. Open the app.
2. Open the `TestFlight` tab.
3. Open the internal testing section.
4. Add the new build to the internal group.
5. Add Emily to that group if she is not already there.
6. Send or confirm the invite.

What to expect after upload:

- the build may not be selectable immediately
- App Store Connect needs processing time even after Xcode says upload is complete
- once processing finishes, the build appears in the TestFlight area and can be attached to the internal group

## Emily-Side Steps

Emily needs to:

1. Accept the App Store Connect team invite.
2. Install the TestFlight app from the App Store.
3. Accept the TestFlight invite for the app.
4. Install the build.
5. Run the narrow first validation flow.

Ask Emily to report:

- install friction
- login friction
- layout problems
- copy that feels confusing
- one screenshot for any visual breakage

## First Beta Acceptance

The first internal TestFlight milestone is successful when:

- Emily can install the app from TestFlight
- Emily can open the app
- Emily can finish one simple chat flow
- we capture a short list of issues for the next build

## Repeat Loop For The Next Build

For each follow-up beta:

1. Fix the issue.
2. Run `npm run ios:testflight:prepare`.
3. Archive and upload again from Xcode.
4. Attach the new build to the internal group.
5. Have Emily retest only the narrow area we changed, plus one smoke check.
