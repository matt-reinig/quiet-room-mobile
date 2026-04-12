# Play Internal Testing Runbook

Use this when we are ready to push the first Android QA bundle to the `Quiet Room QA` Play Console record and prove the upload-key path before touching the production listing.

Current target:

- QA lane first on package id `com.quietroom.mobile.qa`
- internal testing before any closed or production release
- keep the prod app record reserved for prod-candidate validation only

## Current Observed Gate

Observed on April 11, 2026:

- the first QA upload reached Google Play successfully and then failed because the app record did not yet have a privacy policy URL configured
- Google specifically flagged the app's use of `android.permission.RECORD_AUDIO`

What this means:

- internal testing does not bypass Play privacy-policy requirements for this app
- complete the privacy-policy and store-metadata baseline before retrying the upload
- track the broader metadata work in `docs/mobile-store-compliance-readiness-effort.md`

## What This Repo Now Supports

From `quiet-room-mobile`:

```bash
npm run android:play:status:qa
```

Shows the current QA Android app identity, version, versionCode, selected Google services file, and upload-key status.

```bash
npm run android:play:preflight:qa
```

Checks:

- loaded mobile env files
- selected Android Google services file
- Android `versionCode`
- upload-key env values and keystore presence
- upload-key fingerprint readability through `keytool`
- generated native signing patch if `android/` already exists

```bash
npm run android:play:prepare
```

Bumps `expo.android.versionCode` by one and keeps `app.json` ready for the next Play upload.

Optional explicit version and versionCode:

```bash
bash ./scripts/prepare-android-play.sh --version 1.0.1 --version-code 7
```

Dry run:

```bash
bash ./scripts/prepare-android-play.sh --dry-run --version 1.0.1 --version-code 7
```

## Android Upload Key Setup

Create a local `.env.android.signing` from the committed example:

```bash
cp .env.android.signing.example .env.android.signing
```

Then fill in:

- `QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE`
- `QUIET_ROOM_ANDROID_UPLOAD_STORE_PASSWORD`
- `QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS`
- `QUIET_ROOM_ANDROID_UPLOAD_KEY_PASSWORD`

Notes:

- the file is intentionally local-only
- the keystore path may be absolute or relative to the repo root
- `scripts/with-mobile-env.sh` now auto-loads `.env.android.signing` when it exists
- the first Play upload should use a real upload key, not the debug keystore

## Repo-Side Prep Checklist

Before building the QA bundle:

- confirm `.env` and `.env.qa` point at the QA backend you want testers to hit
- confirm `.env.android.signing` exists and references the real Android upload key
- confirm `google-services.qa.json` is present locally if the QA app uses Firebase-backed auth
- confirm the QA Play app record already has a public privacy policy URL entered
- run `npm run android:play:status:qa`
- run `npm run android:play:preflight:qa`
- if the next upload needs a new versionCode, run `npm run android:play:prepare`

If the generated native Android project is missing:

```bash
npm run native:sync:qa
```

That regenerates `android/` and reapplies the repo patch that switches release signing from debug-only to upload-key-aware.

## Build The QA Bundle

From repo root:

```bash
bash ./scripts/with-mobile-env.sh qa qa bash -lc 'cd android && ./gradlew bundleRelease'
```

Expected output bundle:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Why use `with-mobile-env.sh` here:

- it loads `.env` and `.env.qa`
- it sets `EXPO_PUBLIC_APP_VARIANT=qa` and `EXPO_PUBLIC_RELEASE_ENV=qa`
- it auto-loads `.env.android.signing` so Gradle sees the upload-key values

## Play Console Setup

Outside the repo:

1. Confirm the QA Play app exists as `Quiet Room QA` on package id `com.quietroom.mobile.qa`.
2. Confirm the Play Console account is fully verified.
3. Add a public privacy policy URL to the QA app record before attempting the first upload.
4. Start the Play Data safety and app-content declarations so the record is not blocked by missing metadata immediately after upload.
5. Enroll in Play App Signing during the first upload if Google prompts for it.
6. Create or confirm the internal testing track for the QA app.
7. Add the first tester emails or tester group.

If this Play account is a new personal account, keep the later closed-testing gate in mind before expecting production access.

## Upload The QA Bundle

In Play Console:

1. Open the `Quiet Room QA` app.
2. Go to the internal testing track.
3. Create a new release.
4. Upload `app-release.aab`.
5. Enter release notes that mention `qa/qa`, the backend target, and any tester focus areas.
6. Roll out the release to internal testing.

If Play rejects the upload for missing privacy-policy or app-content metadata, stop and finish the checklist in `docs/mobile-store-compliance-readiness-effort.md` before retrying.

## Firebase / Google Auth Follow-up

After the upload key exists, make sure Firebase and Google Cloud include the upload-key fingerprints that Android auth needs.

Use:

```bash
npm run android:play:status:qa
```

That prints the readable SHA1 and SHA256 values when `keytool` and the upload-key credentials are available locally.

## First QA Acceptance

The first Android QA internal-testing milestone is successful when:

- the QA AAB uploads successfully
- Play accepts the signing setup
- the QA app record already satisfies the required privacy-policy metadata
- a tester can install `Quiet Room QA`
- the QA build opens and completes one simple chat flow
- Firebase / Google auth fingerprints are aligned with the upload key if that auth path is in scope
