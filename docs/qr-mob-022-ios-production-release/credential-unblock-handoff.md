# QR-MOB-022 - App Store Connect credential unblock

## Resolution

The App Store Connect credential blocker is resolved. After updating the local credentials, the uploader could create the screenshot set and upload the five release screenshots.

Final upload/readback evidence:

- Uploaded display type: `APP_IPHONE_67`
- Uploaded screenshot set id: `ba57c157-f59b-4a9b-b14f-482b28d39bc7`
- Uploaded screenshot count: `5`
- Upload completed: 2026-06-19 at 21:53 CDT
- No App Review submission was attempted.

## Historical blocker

Observed API evidence:

- App id: `6761866347`
- App Store Connect version: `1.0`
- Version id: `36f439ae-f2f6-4140-babd-14cdc6ac48ea`
- Version state: `PREPARE_FOR_SUBMISSION`
- Localization: `en-US`
- Localization id: `b1396952-779e-4893-9e63-d4f81ffd177e`
- Screenshot sets in localization before successful upload: `0`
- Initial target screenshot display type: `APP_IPHONE_63`
- Upload failure: `POST /appScreenshotSets` returned `FORBIDDEN_ERROR`: `The API key in use does not allow this request`
- Follow-up upload retry on 2026-06-19 at 21:46 CDT returned the same `FORBIDDEN_ERROR`; read-only status immediately afterward still showed `0` screenshot sets.

Interpretation at the time: the version was editable and the target screenshot set was simply missing. The blocker was API-key permission, not app-version state, image size, or an existing screenshot collision.

After credential repair, Apple accepted screenshot-set creation but rejected `APP_IPHONE_63` as an unsupported API enum. The successful upload used an API-compatible `APP_IPHONE_67` bundle generated at `1290x2796`.

## Required Apple-side change

Use an App Store Connect API key that can manage screenshots/app metadata for Quiet Room. Replacing only the `.p8` file is not sufficient if the new key has the same insufficient access level; the key's App Store Connect role/access must allow metadata or screenshot edits for this app.

Apple's current help docs list screenshot upload access as `Account Holder`, `Admin`, `App Manager`, or `Marketing`. If using a team API key, Apple also notes that the key access level is selected when generated and cannot be edited later, so an insufficient key may need to be revoked/recreated rather than modified.

## Local credential file

Credentials are expected in:

```sh
/Users/mjreinig/projects/Gabriel_App/.local/app-store-connect.env
```

Expected shape:

```sh
export ASC_KEY_ID="..."
export ASC_ISSUER_ID="..."
export ASC_PRIVATE_KEY_PATH="/Users/mjreinig/Downloads/AuthKey_....p8"
export ASC_VERSION_STRING="1.0"
```

Keep this file out of git. The `.p8` file can only be downloaded once when the API key is created.

## Safe verification sequence

Run these from:

```sh
/Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-qr-mob-022-prod-release
```

Load credentials:

```sh
set -a
source /Users/mjreinig/projects/Gabriel_App/.local/app-store-connect.env
set +a
```

Local dry run only:

```sh
node scripts/upload-app-store-screenshots.mjs --dry-run
```

Read-only App Store Connect status:

```sh
node scripts/upload-app-store-screenshots.mjs --status
```

Expected status after upload:

```text
Resolved app id: 6761866347
Resolved version id: 36f439ae-f2f6-4140-babd-14cdc6ac48ea (state: PREPARE_FOR_SUBMISSION)
Resolved localization id: b1396952-779e-4893-9e63-d4f81ffd177e
Screenshot sets in localization: 1
  APP_IPHONE_67: set ba57c157-f59b-4a9b-b14f-482b28d39bc7, screenshots 5
Target display type APP_IPHONE_67: present
Status only. No App Store Connect changes were made.
```

## Upload command

If the uploaded set ever needs to be replaced:

```sh
node scripts/upload-app-store-screenshots.mjs --replace-existing
```

The script only creates/uploads screenshots and prints `Done. No App Review submission was attempted.` It does not call App Review submission endpoints.

Expected success shape:

```text
Resolved app id: 6761866347
Resolved version id: 36f439ae-f2f6-4140-babd-14cdc6ac48ea (state: PREPARE_FOR_SUBMISSION)
Resolved localization id: b1396952-779e-4893-9e63-d4f81ffd177e
Resolved screenshot set id: ...
Existing screenshots in set: 0
Uploaded 01-landing.png as ...
Uploaded 02-atmosphere.png as ...
Uploaded 03-login.png as ...
Uploaded 04-report-response.png as ...
Uploaded 05-report-submitted.png as ...
Final screenshot count in set: 5
Done. No App Review submission was attempted.
```

## After upload

1. Run `node scripts/upload-app-store-screenshots.mjs --status` again.
2. Confirm `APP_IPHONE_67` reports `screenshots 5`.
3. Update `progress.md` with the final screenshot count and timestamp.
4. Update the tracker/handoff notes.
5. Stop before App Review submission.
