# QR-MOB-020 - iOS QA build 25 failure investigation

## Goal

Investigate why the iOS QA TestFlight build `25` is failing, using build `23` as the last known-good QA build and builds `24`/`25` as the suspected bad builds.

## Context

The QA iOS lane previously uploaded build `23` successfully after verifying the release-simulator app reached the home screen and QA backend requests returned HTTP 200. The current tester goal is to get back to a working QA iOS install quickly, either by confirming a rollback path or by identifying and fixing the regression behind build `25`.

## Initial questions

- What exactly fails in build `25`: install, launch, settings load, auth, feature flags, chat, streaming, profile loading, or another runtime path?
- Does build `24` fail the same way as build `25`?
- Does build `23` still install and run correctly from TestFlight on the same device/account?
- What source commit, native metadata, bundle version, and QA config were used for builds `23`, `24`, and `25`?
- Did any env, Firebase/Auth, signing, entitlement, provisioning, native config, or backend URL value change after build `23`?
- Is the failure reproducible in a QA release-simulator build from the same source?
- Is this a true app regression, a TestFlight build-selection/install behavior issue, or a console-side distribution issue?

## Investigation steps

1. Capture the observed failure on build `25`.
   - Record the device, iOS version, TestFlight account, installed build number, and exact symptoms.
   - Include screenshots or screen recordings if possible.
   - Note whether the app crashes, hangs, shows `Loading settings...`, fails auth, or reaches the home screen but fails later.

2. Map the App Store Connect builds.
   - Identify build `23`, `24`, and `25` in App Store Connect/TestFlight.
   - Record each build's upload date, processing status, tester group assignment, expiration status, and whether it is installable.
   - Confirm whether removing bad builds `24`/`25` causes testers to receive build `23`, or whether build `23` must be re-uploaded as a new build number.

3. Compare source and config for build `23` vs `25`.
   - Check git commit SHA for each build if available in deploy logs or metadata.
   - Compare `app.json`, iOS native project metadata, `CFBundleVersion`, `CURRENT_PROJECT_VERSION`, bundle ID, display name, Firebase plist selection, and QA env values.
   - Run `npm run mobile:verify:qa`, `npm run ios:testflight:status:qa`, and `npm run ios:testflight:preflight:qa` from the candidate source.

4. Reproduce locally where possible.
   - Build the QA release-simulator app with `npm run detox:build:ios:qa`.
   - Install it on a clean iOS simulator.
   - Confirm whether it reaches the Quiet Room home screen and whether QA network requests return HTTP 200.
   - Capture simulator logs around startup, Firebase Auth, feature flag loading, settings loading, and chat/streaming.

5. Check likely failure layers.
   - QA runtime config: API URL, streaming URL, Firebase project, Firebase Auth emulator host, feature flag endpoint.
   - Auth: anonymous auth startup, Apple sign-in side effects, provider configuration, keychain/session persistence.
   - Native iOS: provisioning profile, entitlements, bundle ID, associated domains, privacy manifest, Info.plist changes.
   - JavaScript bundle: stale env values, Expo dotenv behavior, Metro bundle content, QA/prod leakage.
   - Backend compatibility: whether QA backend deploy changed independently of the mobile build.

6. Decide the immediate recovery path.
   - If build `23` is still good and installable, document the exact TestFlight steps to return testers to build `23`.
   - If TestFlight cannot practically roll back to build `23`, rebuild the last known-good source as a new QA build number and upload it.
   - If build `25` has a clear fix, open a fix branch and upload a new QA build after local release-simulator verification.

## Acceptance criteria

- The failure mode for iOS QA build `25` is documented with symptoms and device/TestFlight details.
- Build `23`, `24`, and `25` are mapped to available source/config/deploy metadata.
- QA release-simulator verification is run from the suspected source or the reason it cannot be run is documented.
- Logs or screenshots are captured for the failing behavior where available.
- The investigation identifies the likely root cause or clearly narrows the issue to TestFlight distribution, build artifact/config, runtime config, Firebase/Auth, signing/entitlements, backend compatibility, or app source regression.
- A clear recommendation is written: rollback to build `23`, remove bad builds, republish the last known-good source as a new build, or fix and redeploy.

## Suggested deliverables

- `docs/qr-mob-020-ios-qa-build-25-failure/investigation.md`
- `docs/qr-mob-020-ios-qa-build-25-failure/build-comparison.md`
- `docs/qr-mob-020-ios-qa-build-25-failure/recovery-recommendation.md`
