# Play Store Internal Testing Runbook

Use this when we are ready to push Android bundles to the QA and prod Play Console records and prove the upload-key path before any broader distribution.

Current target:

- QA lane first on package id `com.quietroom.mobile.qa`
- internal testing before any closed or production release
- keep the prod app record reserved for prod-candidate validation only

## Current Proven State

Observed by April 12, 2026:

- QA bundle uploads now work through the Android Publisher API
- PROD bundle uploads now work through the Android Publisher API
- the privacy-policy URL gate is cleared for both app records
- `Quiet Room QA` now has QA build records in the `internal` track through `versionCode 3`, with the latest rebuild tied to the corrected QA Firebase SHA
- `Quiet Room` now has prod build records in the `internal` track through `versionCode 2`, with the latest rebuild tied to the refreshed prod Firebase config
- both Play app records still behave like draft apps, so API attempts to create a `completed` internal release can fail with `Only releases with status draft may be created on draft app.`
- tester emails make users eligible, but the practical install path is still the Play shareable opt-in link

## Current Observed Gate

Observed on April 11, 2026:

- the first QA upload reached Google Play successfully and then failed because the app record did not yet have a privacy policy URL configured
- Google specifically flagged the app's use of `android.permission.RECORD_AUDIO`

What this means:

- internal testing does not bypass Play privacy-policy requirements for this app
- complete the privacy-policy and store-metadata baseline before retrying the upload
- track the broader metadata work in `docs/mobile-store-compliance-readiness-effort.md`
- expect some final release-promotion steps to remain console-owned while the app records are still in Play's draft-app state

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

Common variant mapping:

- QA app: `bash ./scripts/sync-native-variant.sh qa qa android`
- PROD app: `bash ./scripts/sync-native-variant.sh prod prod android`
- QA bundle build: `bash ./scripts/with-mobile-env.sh qa qa bash -lc 'cd android && ./gradlew bundleRelease'`
- PROD bundle build: `bash ./scripts/with-mobile-env.sh prod prod bash -lc 'cd android && ./gradlew bundleRelease'`

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
- if Google sign-in is expected to work on a Play-installed build, confirm `google-services.qa.json` was downloaded after adding the Play app-signing SHA to Firebase
- run `npm run android:play:status:qa`
- run `npm run android:play:preflight:qa`
- if the next upload needs a new versionCode, run `npm run android:play:prepare`

If the generated native Android project is missing:

```bash
npm run native:sync:qa
```

That regenerates `android/` and reapplies the repo patch that switches release signing from debug-only to upload-key-aware.

For prod, use the matching prod commands and confirm `google-services.prod.json` is the current Firebase export for `com.quietroom.mobile`.

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

Also prepare the matching prod record:

1. Confirm the prod Play app exists as `Quiet Room` on package id `com.quietroom.mobile`.
2. Add the same public privacy policy URL to the prod app record.
3. Keep an internal testing track available for prod-candidate validation even if the app is not yet public.

If this Play account is a new personal account, keep the later closed-testing gate in mind before expecting production access.

## Upload The Bundle

Current proven upload flow:

1. Build the variant-specific signed `.aab`.
2. Upload the bundle through the Android Publisher API or the Play Console upload UI.
3. Attach it to the `internal` track.
4. If the app is still treated as a draft app, commit it as a `draft` release and finish promotion in Play Console.

What the API path proved in practice:

- bundle upload works for QA and prod
- track updates work for QA and prod
- if Play still treats the app record as draft-only, the API rejects `completed` with `Only releases with status draft may be created on draft app.`
- in that case, use Play Console to promote the draft release if needed

### QA

In Play Console:

1. Open the `Quiet Room QA` app.
2. Go to the internal testing track.
3. Create a new release.
4. Upload `app-release.aab`.
5. Enter release notes that mention `qa/qa`, the backend target, and any tester focus areas.
6. Roll out the release to internal testing.

If Play rejects the upload for missing privacy-policy or app-content metadata, stop and finish the checklist in `docs/mobile-store-compliance-readiness-effort.md` before retrying.

### PROD

In Play Console:

1. Open the `Quiet Room` app.
2. Go to the internal testing track.
3. Create a new release or continue the draft internal release.
4. Upload the prod `.aab` or use the already uploaded build record.
5. Enter release notes that mention `prod/prod` and the tester focus area.
6. Keep this lane for internal prod-candidate validation until the public-production path is ready.

## Tester Distribution

Important practical note:

- adding a tester email makes that user eligible, but you should not rely on Google to email them automatically
- the dependable path is to copy the shareable internal-testing opt-in link from Play Console and send it directly
- testers must open the link while signed into the same Google account that is listed in the tester group

For the current QA/prod app records:

- use the `Testing > Internal testing` shareable link
- keep one link for QA and a separate link for prod
- tell testers whether they should install the QA app or the prod-candidate app

## Firebase / Google Auth Follow-up

After Play App Signing is enabled, native Google sign-in depends on the Play app-signing certificate, not only the upload key.

Use:

```bash
npm run android:play:status:qa
```

That prints the readable SHA1 and SHA256 values when `keytool` and the upload-key credentials are available locally.

What we learned in practice:

- Android `DEVELOPER_ERROR` on a Play-installed build usually means Firebase/Google Sign-In does not yet know the Play app-signing certificate for that package id
- after adding the Play app-signing SHA to the Firebase Android app, download a fresh variant-specific `google-services.<variant>.json`
- replace the local file
- bump Android `versionCode`
- rebuild and re-upload the affected variant

Current local state in this worktree:

- `google-services.qa.json` has been refreshed with the corrected Android OAuth client for `com.quietroom.mobile.qa`
- `google-services.prod.json` has been refreshed with the Android OAuth client for `com.quietroom.mobile`
- QA was rebuilt and re-uploaded as `versionCode 3` after the corrected QA Firebase SHA update
- PROD was rebuilt and re-uploaded as `versionCode 2` after the prod Firebase refresh

## First QA Acceptance

The first Android QA internal-testing milestone is successful when:

- the QA AAB uploads successfully
- Play accepts the signing setup
- the QA app record already satisfies the required privacy-policy metadata
- a tester can install `Quiet Room QA`
- the QA build opens and completes one simple chat flow
- Firebase / Google auth fingerprints and downloaded `google-services.qa.json` are aligned with the Play app-signing certificate if native Google sign-in is in scope
