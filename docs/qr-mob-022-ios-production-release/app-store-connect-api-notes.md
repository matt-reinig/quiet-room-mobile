# QR-MOB-022 - App Store Connect API notes

## Why the Google Play path was smoother

The prior Google Play uploads worked because the repo already had a complete API-style path:

- a local Google service-account JSON in a sibling worktree
- Android Publisher API JWT auth using that service account
- a known package id, artifact path, track, release name, and draft-release behavior
- readback evidence from the internal track after committing the Play edit

That flow did not depend on browser automation once the service-account file and Play app record were in place.

## Apple equivalent

The App Store Connect equivalent is possible, but it needs a working App Store Connect API key set:

- Key ID
- Issuer ID
- `.p8` private key file
- a role that can manage app metadata/screenshots, such as Account Holder, Admin, App Manager, or Marketing

Apple's screenshot flow is not the same as the Play AAB upload flow. Screenshots are uploaded as App Store Connect assets against an editable app version localization and screenshot display type.

High-level flow:

1. Authenticate to `https://api.appstoreconnect.apple.com` with an ES256 JWT.
2. Locate the Quiet Room app by bundle id `com.quietroom.mobile`.
3. Locate the iOS App Store version `1.0` and its `en-US` localization.
4. Create or reuse an app screenshot set for the target iPhone display type.
5. Reserve each screenshot asset, upload the file bytes to Apple's returned upload URLs, then mark the asset as uploaded.
6. Verify the screenshot set reports the expected uploaded screenshots.

This would attach screenshots only. It would not submit the app for review unless a separate review-submission API call is made.

## Current local credential state

- Local credentials are loaded from `/Users/mjreinig/projects/Gabriel_App/.local/app-store-connect.env`.
- The updated credentials can authenticate, resolve app id `6761866347`, read App Store Connect version `1.0`, and create/upload screenshot assets.
- Earlier credentials could read the app/version but failed at screenshot-set creation with `FORBIDDEN_ERROR`.
- `fastlane` is not installed in the current Ruby environment.

Conclusion: the Play-style API path worked after the credential/access issue and display-type enum mismatch were resolved.

## Local uploader scaffold

A no-submit screenshot uploader now exists at `scripts/upload-app-store-screenshots.mjs`. It uses the App Store Connect API only to attach screenshot assets to the existing editable app version localization; it does not create or submit an App Review submission.

Dry-run verification:

```sh
npm run ios:appstore:screenshots:dry-run
```

Read-only App Store Connect status verification:

```sh
npm run ios:appstore:screenshots:status
```

Upload command:

```sh
npm run ios:appstore:screenshots:upload
```

By default, the helper auto-loads `/Users/mjreinig/projects/Gabriel_App/.local/app-store-connect.env` from either the main checkout or a `Gabriel_App/worktrees/*` checkout. To use a different credential file, pass `--asc-env /path/to/app-store-connect.env` after `--`, for example:

```sh
npm run ios:appstore:screenshots:status -- --asc-env /path/to/app-store-connect.env
```

Expected credential-backed run shape:

```sh
ASC_KEY_ID="..." \
ASC_ISSUER_ID="..." \
ASC_PRIVATE_KEY_PATH="/path/to/AuthKey_XXXXXXXXXX.p8" \
node scripts/upload-app-store-screenshots.mjs \
  --bundle-id com.quietroom.mobile \
  --version 1.0 \
  --locale en-US \
  --display-type APP_IPHONE_67
```

Notes:

- `--display-type APP_IPHONE_67` is the default because App Store Connect API currently rejects `APP_IPHONE_63`, even though the App Store Connect screenshot specs list `1206x2622` as a valid 6.3-inch screenshot size.
- The uploaded `APP_IPHONE_67` bundle lives in `store-assets/iphone-api-67/` and uses `1290x2796` images derived from the staged listing screenshots.
- `--replace-existing` is required if App Store Connect already has screenshots in the target screenshot set.
- `--allow-version-state` bypasses the helper's conservative locked-version-state guard if App Store Connect reports an unexpected but intentionally editable state.
- `ASC_PRIVATE_KEY` can be used instead of `ASC_PRIVATE_KEY_PATH` when the `.p8` value is supplied through an environment variable.
- `--status` resolves the app, version, localization, and screenshot sets with read-only API calls, then exits without uploading or deleting anything.

## Upload result

On 2026-06-19 at 21:53 CDT, the uploader completed successfully against App Store Connect display type `APP_IPHONE_67`.

Readback:

```text
Resolved app id: 6761866347
Resolved version id: 36f439ae-f2f6-4140-babd-14cdc6ac48ea (state: PREPARE_FOR_SUBMISSION)
Resolved localization id: b1396952-779e-4893-9e63-d4f81ffd177e
Screenshot sets in localization: 1
  APP_IPHONE_67: set ba57c157-f59b-4a9b-b14f-482b28d39bc7, screenshots 5
Target display type APP_IPHONE_67: present
Status only. No App Store Connect changes were made.
```

No App Review submission was attempted.
