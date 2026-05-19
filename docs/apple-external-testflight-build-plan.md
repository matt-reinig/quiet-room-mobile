# Apple External TestFlight Build Plan

## Goal

Prepare the iOS app for Apple external TestFlight testing by uploading a build that is eligible for external tester groups, then submitting that build for Beta App Review.

## Context

The builds currently visible in App Store Connect appear to be labeled as internal. Apple treats internal-only TestFlight builds differently from builds that can be distributed to external testers. If a build is marked internal-only, do not try to force it into the external testing flow. Upload a new build with an incremented build number and make sure the internal-only/TestFlight internal-only option is not selected during upload.

This plan is for the production iOS app unless explicitly running the QA variant.

## Current repo signals

The repo already has iOS/TestFlight helper scripts in `package.json`:

- `ios:testflight:preflight`
- `ios:testflight:preflight:qa`
- `ios:testflight:preflight:prod`
- `ios:testflight:status`
- `ios:testflight:status:qa`
- `ios:testflight:status:prod`
- `ios:testflight:prepare`

Use those scripts first rather than inventing a separate release path.

## Plan

### 1. Confirm the target app and environment

Decide whether this upload is for:

- Production app, production backend/config
- QA app, QA backend/config

For external testing, prefer production app/config unless the intent is specifically to invite external testers to a QA app.

Acceptance criteria:

- The intended Apple bundle identifier is known.
- The intended environment is known.
- The app name shown to testers is correct.

### 2. Run the iOS TestFlight preflight

Run the matching preflight script:

```bash
npm run ios:testflight:preflight:prod
```

or, for QA:

```bash
npm run ios:testflight:preflight:qa
```

Check the output for:

- Bundle identifier
- App display name
- Version/build number
- Privacy/support URLs
- Required env values
- Any signing/config warnings

Acceptance criteria:

- Preflight passes.
- No QA values are present in a prod build.
- No prod values are present in a QA build.
- Privacy policy and support URLs point to the intended Quiet Room URLs.

### 3. Prepare a new iOS build number

Run the existing prepare script to bump the iOS build number:

```bash
npm run ios:testflight:prepare
```

Then inspect the resulting native/project files and confirm the build number changed.

Acceptance criteria:

- iOS build number is incremented from the build currently marked internal in App Store Connect.
- Marketing version is unchanged unless there is a deliberate reason to bump it.
- The changed files are limited to expected version/build metadata unless the prepare script intentionally touches more.

### 4. Archive and upload a non-internal-only build

Archive the app through the existing iOS release path. During upload to App Store Connect, make sure any option like this is not selected:

- `TestFlight Internal Only`
- `Internal Only`
- Any equivalent internal-only distribution checkbox

The goal is not a different app binary type. The goal is a normal TestFlight/App Store Connect upload that can later be attached to an external tester group.

Acceptance criteria:

- A new build appears in App Store Connect.
- The build number is the newly incremented build number.
- The build is not labeled internal-only.
- The build can be selected from an external testing group.

### 5. Verify App Store Connect build status

After processing completes in App Store Connect:

1. Open App Store Connect.
2. Go to the app.
3. Open TestFlight.
4. Confirm the new build appears.
5. Confirm it does not have an internal-only label.
6. Try adding it to an external testing group.

Optional repo-side check:

```bash
npm run ios:testflight:status:prod
```

or:

```bash
npm run ios:testflight:status:qa
```

Acceptance criteria:

- Build processing is complete.
- The build is visible under TestFlight.
- The build is selectable for an external group.

### 6. Create or update the external tester group

In App Store Connect:

1. Go to TestFlight.
2. Open External Testing.
3. Create a group such as `Quiet Room External Beta` if one does not already exist.
4. Add the new non-internal build.
5. Add tester emails or prepare the public link if Apple allows it after review.

Acceptance criteria:

- External group exists.
- New build is attached to the group.
- Tester instructions are present and understandable.

### 7. Complete Beta App Review details

Before submitting the build for external testing, complete the required Beta App Review fields.

Recommended notes:

- Explain that Quiet Room is an AI-powered spiritual/reflection companion.
- Mention account/sign-in requirements if applicable.
- Include any test account details only if the app requires sign-in to test core flows.
- Mention the core path Apple should test: open app, accept consent/disclosures, start a conversation, optionally test voice/TTS if available.
- Do not over-explain internal architecture.

Acceptance criteria:

- Beta App Review notes are filled out.
- Contact info is accurate and does not expose a personal email if the product email should be used.
- Demo/test credentials are provided if required.
- The build is submitted for Beta App Review.

### 8. Smoke test the exact external candidate build

Before inviting a wider set of testers, install the build from TestFlight and run a basic smoke test.

Test:

- App launches successfully.
- Correct app name/icon appear.
- Correct environment is used.
- Consent/disclosure flow still works.
- Chat sends and receives a response.
- Reporting/help/privacy links work.
- Voice/TTS behavior works if included.
- No QA-only labels or test copy appear in prod.

Acceptance criteria:

- Smoke test passes on a real iOS device.
- Any blocker is fixed with a new build before inviting external testers.

## Definition of done

- A new iOS build has been uploaded with an incremented build number.
- The build is not marked internal-only in App Store Connect.
- The build is attached to an external TestFlight group.
- Beta App Review details are complete.
- The build has been submitted for Beta App Review.
- A real-device smoke test has been completed before wider external tester rollout.

## Notes for Codex

- Do not change app functionality unless a preflight or smoke test exposes a real issue.
- Prefer existing scripts over creating new release scripts.
- If the current scripts are insufficient, document the gap before adding new automation.
- Keep prod and QA bundle identifiers/configs clearly separated.
- Do not put a personal email into app metadata if the product email is intended for public tester/reviewer contact.