# Play Store Internal Testing Runbook

Use this when we are ready to push Android bundles to the QA and prod Play Console records and prove the upload-key path before any broader distribution.

Current target:

- QA lane first on package id `com.quietroom.mobile.qa`
- internal testing before any closed or production release
- keep the prod app record reserved for prod-candidate validation only

## Current Proven State

Observed by April 21, 2026:

- QA bundle uploads now work through the Android Publisher API
- PROD bundle uploads now work through the Android Publisher API
- the privacy-policy URL gate is cleared for both app records
- `Quiet Room QA` now has QA build records in the `internal` track through `versionCode 5`, with the latest upload paired to iOS QA build `12`
- `Quiet Room` now has prod build records in the `internal` track through `versionCode 6`, with the latest upload paired to iOS prod build `13`
- both Play app records still behave like draft apps, so API attempts to create a `completed` internal release can fail with `Only releases with status draft may be created on draft app.`
- tester emails make users eligible, but the practical install path is still the Play shareable opt-in link

Observed on April 24, 2026:

- PROD `versionCode 6` uploaded from the prod rollout worktree as a draft internal release.
- Play edit `00409671943079567863` was committed successfully.
- Internal track readback showed `PROD internal 6`, `versionCodes: ["6"]`, `status: draft`.
- The uploaded AAB SHA256 was `514818e8d18b729ac834dfea06393cf81a9597925f9a106e16ddc21aedaf2e0c`.

Observed on June 20, 2026:

- Android Publisher API readback reports QA internal `versionCode 21` and prod
  internal `versionCode 23` as `completed`; normal internal-track promotion no
  longer needs a Play Console click.
- `npm run android:play:deploy:<qa|prod>` now combines the existing preflight,
  signed AAB build, and guarded API action. The QA dry-run path was verified in
  an isolated worktree with sibling local env/signing/Firebase files and built
  a fresh signed bundle without contacting Play.
- `--apply` is required to upload; `--complete --confirm-publish` is required
  to make a build available to testers; prod also remains opt-in.

## Previously Observed Privacy-Policy Gate

Observed on April 11, 2026:

- the first QA upload reached Google Play successfully and then failed because the app record did not yet have a privacy policy URL configured
- Google specifically flagged the app's use of `android.permission.RECORD_AUDIO`

What this means:

- internal testing does not bypass Play privacy-policy requirements for this app
- complete the privacy-policy and store-metadata baseline before retrying the upload
- track the broader metadata work in `docs/mobile-store-compliance-readiness-effort.md`
- historical note: when an app record remains draft-only, final promotion is
  console-owned until its one-time initial publication/legal-consent step is complete

## What This Repo Now Supports

### Google Play release helper

`scripts/google-play-release.mjs` replaces the copy/paste Ruby upload snippet
with a local-env-backed API helper that mirrors the App Store Connect helpers.
It uses only the Android Publisher API; the service-account JSON remains
outside the repository.

Create `/Users/mjreinig/projects/Gabriel_App/.local/google-play-publisher.env`
from `.env.google-play-publisher.example` and set the absolute path to the
already-authorized service-account JSON:

```sh
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=/absolute/path/to/service-account.json
```

Read only (it opens and abandons a temporary edit, never commits one):

```sh
npm run android:play:api:status:qa
npm run android:play:api:status:prod
```

Validate an artifact without contacting Play:

```sh
npm run android:play:api:dry-run:qa -- --aab android/app/build/outputs/bundle/release/app-release.aab
```

For the normal release flow, use the lane wrapper instead of manually chaining
preflight, Gradle, and the API helper. It runs preflight first, builds a signed
AAB unless an explicit `--aab` is supplied, then either dry-runs or uploads it.
Prepare and commit the next Android `versionCode` before invoking it.

```sh
npm run android:play:deploy:qa -- --dry-run
npm run android:play:deploy:qa -- --apply --complete --confirm-publish \
  --release-notes 'QA internal testing build.'

npm run android:play:deploy:prod -- --dry-run
npm run android:play:deploy:prod -- --apply --complete --confirm-publish \
  --release-notes 'Production-candidate internal build.'
```

`--dry-run` never contacts Google Play. `--apply` makes the upload mutation;
`--complete --confirm-publish` makes the internal build available to testers.
The prod wrapper adds the helper's separate `--allow-prod` guard only after the
caller has explicitly selected `--apply`.

For an isolated worktree that intentionally has no copied secrets, point the
standard wrapper at the trusted local-only env files in the main checkout:

```sh
MOBILE_ENV_BASE_FILE=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/.env \
MOBILE_ENV_OVERLAY_FILE=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/.env.qa \
MOBILE_ANDROID_SIGNING_ENV_FILE=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/.env.android.signing \
MOBILE_RELEASE_ASSET_ROOT=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile \
npm run android:play:deploy:qa -- --dry-run
```

The paths are explicit overrides; normal main-checkout commands continue to
use that checkout's own `.env`, variant overlay, Android signing env, and
Google service files. In an isolated worktree, the wrapper resolves the
variant's ignored `google-services.<variant>.json` directly from
`MOBILE_RELEASE_ASSET_ROOT` for preflight and native sync; it does not copy the
local Firebase config into the worktree.

Upload a new bundle as a **draft** internal release after dry-run review:

```sh
node scripts/google-play-release.mjs --upload --apply --lane qa \
  --aab android/app/build/outputs/bundle/release/app-release.aab \
  --release-notes 'QA internal testing build.'
```

For the normal QA path, the same commit can make the release available to
internal testers. `--complete` and `--confirm-publish` deliberately make that
effect explicit. The equivalent prod command additionally requires
`--allow-prod`.

```sh
node scripts/google-play-release.mjs --upload --apply --complete --confirm-publish --lane qa \
  --aab android/app/build/outputs/bundle/release/app-release.aab \
  --release-notes 'QA internal testing build.'
```

Promote an already-uploaded draft release to `completed` only with explicit
confirmation:

```sh
node scripts/google-play-release.mjs --promote 21 --confirm-publish --lane qa
node scripts/google-play-release.mjs --promote 31 --confirm-publish --allow-prod --lane prod
```

The 2026-06-20 API readback shows both current internal releases are already
`completed` (QA versionCode `21`; prod versionCode `23`), so normal internal
release promotion is now API-automatable. If Google ever responds `Only
releases with status draft may be created on draft app`, that app record needs
its one-time initial publication/legal-consent step completed in Play Console.
The Android Publisher API cannot perform that initial transition.

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

## Build Number Policy

Keep QA and prod Android counters separate.

- QA package id `com.quietroom.mobile.qa` owns its own increasing `versionCode` sequence.
- PROD package id `com.quietroom.mobile` owns its own increasing `versionCode` sequence.
- QA can increment freely for tester iterations.
- PROD should increment only when uploading a prod-candidate build.
- Android `versionCode` does not need to match iOS `CFBundleVersion`; record the mapping in release notes instead.

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

## Proven QA Build And Upload Path

This is the exact path that produced the successful QA Android `versionCode 5` upload from the main `quiet-room-mobile` `develop` tree on April 21, 2026.

Start with the QA checks:

```bash
git checkout develop
git pull --ff-only
npm run android:play:preflight:qa
```

Regenerate the QA native project if needed:

```bash
npm run native:sync:qa
```

Prepare the exact Android version and versionCode after native sync:

```bash
bash ./scripts/prepare-android-play.sh --version 1.0.0 --version-code 5
```

Run preflight again. The expected QA evidence for `versionCode 5` was:

```text
Package id: com.quietroom.mobile.qa
Release env: qa
android.versionCode: 5
Upload key SHA1: D2:6F:2C:F6:85:1D:FC:8C:11:CA:91:A9:C0:23:C9:61:ED:D9:AA:53
Upload key SHA256: 39:70:61:3B:B5:4B:DC:FD:D4:6A:2A:F3:43:F4:E5:BE:6E:C3:AF:71:E1:35:01:43:D7:24:2F:4D:3C:88:F7:97
```

Build the signed QA AAB:

```bash
bash ./scripts/with-mobile-env.sh qa qa bash -lc 'cd android && ./gradlew bundleRelease'
```

Expected output:

```text
android/app/build/outputs/bundle/release/app-release.aab
BUILD SUCCESSFUL
```

Upload with the `google-play-release.mjs` helper documented above. The service-account JSON is local-only and must not be committed. The April 21 upload used the local service-account file from the store-distribution worktree and the package id `com.quietroom.mobile.qa`.

The Ruby script below is retained only as historical evidence for the April 2026 upload; do not use it for new releases.

```bash
ruby <<'RUBY'
require 'base64'
require 'json'
require 'net/http'
require 'openssl'
require 'uri'

service_account_path = '/absolute/path/to/service-account.json'
package_name = 'com.quietroom.mobile.qa'
aab_path = 'android/app/build/outputs/bundle/release/app-release.aab'
track = 'internal'
release_name = 'QA internal 5'
release_notes = 'qa/qa internal testing build versionCode 5; paired with iOS QA build 12.'

service_account = JSON.parse(File.read(service_account_path))

def base64url(value)
  Base64.urlsafe_encode64(value).delete('=')
end

now = Time.now.to_i
header = { alg: 'RS256', typ: 'JWT' }
claim = {
  iss: service_account.fetch('client_email'),
  scope: 'https://www.googleapis.com/auth/androidpublisher',
  aud: 'https://oauth2.googleapis.com/token',
  exp: now + 3600,
  iat: now
}

unsigned_jwt = [
  base64url(header.to_json),
  base64url(claim.to_json)
].join('.')

private_key = OpenSSL::PKey::RSA.new(service_account.fetch('private_key'))
signature = private_key.sign(OpenSSL::Digest::SHA256.new, unsigned_jwt)
jwt = [unsigned_jwt, base64url(signature)].join('.')

token_uri = URI('https://oauth2.googleapis.com/token')
token_response = Net::HTTP.post_form(token_uri, {
  'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
  'assertion' => jwt
})
abort token_response.body unless token_response.is_a?(Net::HTTPSuccess)
access_token = JSON.parse(token_response.body).fetch('access_token')

def request_json(method, url, access_token, body = nil)
  uri = URI(url)
  request = method.new(uri)
  request['Authorization'] = "Bearer #{access_token}"
  request['Content-Type'] = 'application/json' if body
  request.body = JSON.generate(body) if body
  response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http| http.request(request) }
  abort response.body unless response.is_a?(Net::HTTPSuccess)
  JSON.parse(response.body.empty? ? '{}' : response.body)
end

edit = request_json(
  Net::HTTP::Post,
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/#{package_name}/edits",
  access_token
)
edit_id = edit.fetch('id')
puts "Created Play edit #{edit_id}"

upload_uri = URI("https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/#{package_name}/edits/#{edit_id}/bundles?uploadType=media")
upload_request = Net::HTTP::Post.new(upload_uri)
upload_request['Authorization'] = "Bearer #{access_token}"
upload_request['Content-Type'] = 'application/octet-stream'
upload_request.body = File.binread(aab_path)
upload_response = Net::HTTP.start(upload_uri.hostname, upload_uri.port, use_ssl: true) { |http| http.request(upload_request) }
abort upload_response.body unless upload_response.is_a?(Net::HTTPSuccess)
version_code = JSON.parse(upload_response.body).fetch('versionCode').to_s
puts "Uploaded AAB versionCode #{version_code}"

request_json(
  Net::HTTP::Put,
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/#{package_name}/edits/#{edit_id}/tracks/#{track}",
  access_token,
  {
    track: track,
    releases: [
      {
        name: release_name,
        versionCodes: [version_code],
        status: 'draft',
        releaseNotes: [
          {
            language: 'en-US',
            text: release_notes
          }
        ]
      }
    ]
  }
)
puts 'Updated internal track as draft release'

request_json(
  Net::HTTP::Post,
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/#{package_name}/edits/#{edit_id}:commit",
  access_token
)
puts "Committed Play edit #{edit_id}"
RUBY
```

Expected output for the April 21 upload:

```text
Created Play edit 06857986117556258785
Uploaded AAB versionCode 5
Updated internal track as draft release
Committed Play edit 06857986117556258785
```

Why that historical release used `status: draft`:

- These app records can still behave like draft apps in Play Console.
- Draft app records reject API-created `completed` internal releases.
- Uploading the AAB and attaching it to the internal track as `draft` creates the build record safely.
- This is no longer the normal state: 2026-06-20 API readback reports both current internal releases as `completed`.

After upload, verify local state:

```bash
npm run android:play:status:qa
```

## Proven PROD Build And Upload Path

This is the exact path that produced the successful PROD Android `versionCode 6` upload from the prod rollout worktree on April 24, 2026.

Start with the prod checks:

```bash
git fetch origin
git checkout master
git pull --ff-only
npm run android:play:preflight:prod
```

Regenerate the prod native project if needed:

```bash
npm run native:sync:prod
```

Prepare the exact Android version and versionCode after native sync:

```bash
bash ./scripts/prepare-android-play.sh --version 1.0.0 --version-code 6
```

Run preflight again. The expected PROD evidence for `versionCode 6` was:

```text
Package id: com.quietroom.mobile
Release env: prod
android.versionCode: 6
Upload key SHA1: D2:6F:2C:F6:85:1D:FC:8C:11:CA:91:A9:C0:23:C9:61:ED:D9:AA:53
Upload key SHA256: 39:70:61:3B:B5:4B:DC:FD:D4:6A:2A:F3:43:F4:E5:BE:6E:C3:AF:71:E1:35:01:43:D7:24:2F:4D:3C:88:F7:97
```

Build the signed PROD AAB:

```bash
bash ./scripts/with-mobile-env.sh prod prod bash -lc 'cd android && ./gradlew bundleRelease'
```

Expected output:

```text
android/app/build/outputs/bundle/release/app-release.aab
BUILD SUCCESSFUL
```

For new prod uploads, use the helper documented above with `--allow-prod`; the Ruby values below are historical reference only:

```ruby
package_name = 'com.quietroom.mobile'
track = 'internal'
release_name = 'PROD internal 6'
release_notes = 'prod/prod internal testing build versionCode 6; paired with iOS prod build 13.'
```

The historical upload used `status: 'draft'` because the prod app then behaved as draft-only. Current API readback reports the prod internal release as `completed`.

Expected output for the April 24 upload:

```text
Created Play edit 00409671943079567863
Uploaded AAB versionCode 6
Updated internal track as draft release
Committed Play edit 00409671943079567863
```

Verify with a temporary edit readback:

```text
PROD internal 6
versionCodes: ["6"]
status: draft
```

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
- QA `versionCode 5` uploaded successfully from the main `develop` tree as a draft internal release on April 21, 2026
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

Current local release-file state:

- `google-services.qa.json` has been refreshed with the corrected Android OAuth client for `com.quietroom.mobile.qa`
- `google-services.prod.json` has been refreshed with the Android OAuth client for `com.quietroom.mobile`
- QA was rebuilt and re-uploaded as `versionCode 5` after the corrected QA Firebase SHA update and the later main-tree QA release pass
- PROD was rebuilt and re-uploaded as `versionCode 2` after the prod Firebase refresh

## First QA Acceptance

The first Android QA internal-testing milestone is successful when:

- the QA AAB uploads successfully
- Play accepts the signing setup
- the QA app record already satisfies the required privacy-policy metadata
- a tester can install `Quiet Room QA`
- the QA build opens and completes one simple chat flow
- Firebase / Google auth fingerprints and downloaded `google-services.qa.json` are aligned with the Play app-signing certificate if native Google sign-in is in scope
