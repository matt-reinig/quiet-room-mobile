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

In Xcode:

1. Select the `quietroommobile` scheme.
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
