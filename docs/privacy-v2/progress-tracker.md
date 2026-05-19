# Privacy V2 Progress Tracker

## Purpose
Track the execution status of the privacy workstreams defined in `docs/privacy-v2/`.

## Status Values
- not started
- ready
- in progress
- blocked
- ready for review
- qa
- merged
- dropped

## Active Workstreams

| Task | Mobile Branch | Backend Branch | Task Folder | Owner | Status | Latest milestone | PRs | Notes |
|---|---|---|---|---|---|---|---|---|
| 01/02/07 Disclosure stream | `codex/privacy/task-01-data-inventory` | — | `../quiet-room-mobile-task-01-data-inventory` | Codex | qa | Task 01 implemented; pending QA plus final log-retention number from infra/ops | — | covers data inventory, privacy policy alignment, and store submission prep; Task 01 is otherwise complete, with final policy/store wording still waiting on deployed log-retention days |
| 03 AI consent | `codex/privacy/task-03-ai-consent` | `codex/privacy/task-03-ai-consent-backend` | `../privacy-task-03` | Codex | qa | paired mobile/backend local-QA run is passing, including Android Detox coverage for block-before-consent, accept-and-resume, cold-relaunch persistence, and authenticated backend persistence | — | guest consent gate and local persistence are implemented; authenticated consent now persists through `/api/account/ai-consent` and is visible through `/test/user-data` plus `/test/ai-consent`; worktree-specific setup details are tracked in `10-quiet-room-mobile-worktree-setup-guide.md` |
| 04/05 Account deletion stream | `codex/privacy/task-05-mobile-deletion` | `codex/privacy/task-04-backend-deletion` | `../privacy-task-04` | Codex | qa | Task 05 mobile deletion flow and Android QA smoke coverage are complete; paired backend test hooks are wired and ready for QA | — | backend owns delete endpoint and shared test hooks; mobile owns in-app deletion flow; backend now has `DELETE /api/account`, `GET /test/user-data`, `POST /test/create-user`, `POST /test/seed-conversations`, and `POST /test/account-deletion-mode` wired for emulator-safe development; local Android QA smoke verifies deletion success, deleted-auth-user rejection on re-login, and retryable failure behavior end to end |
| 06 iOS login compliance | `codex/privacy/task-06-ios-login` | — | `../worktrees/quiet-room-mobile-task-06-ios-login` | Codex | qa | Apple sign-in is implemented and the iOS Detox compliance spec passes on simulator | — | Sign in with Apple selected; Expo config, Firebase Apple credential exchange, login UI, native iOS regeneration, and `e2e/quiet-room.ios-login-compliance.test.js` are complete in the dedicated worktree |
| 08 Model gating parity | `codex/privacy/task-08-model-gating-parity` | — | `../worktrees/quiet-room-mobile-task-08-model-gating-parity` | Codex | qa | full model-gating matrix is implemented and passing in iOS Detox, including stale-model fallback and live feature-flag refresh | — | mobile now derives allowed chat models from `GET /api/feature_flags`, hides chat chrome for the single-model/no-voice state, supports launch-url flag overrides for deterministic Detox permutations, and normalizes Android-only local host aliases to `localhost` on iOS simulator |
| 12 Policy site/account deletion update | `develop` (`1d7dafc`) | — | `../quiet-room-mobile` | Codex | merged | production privacy site redeployed on 2026-04-21 with prod-only copy, the current app door icon, and all public routes returning 200 | direct commit/deploy from `develop` | refreshed data inventory and public `/privacy`, `/account-deletion`, and `/support` copy now reflect the profile icon deletion flow, concrete support path, OpenAI sharing/consent behavior, and 90-day metadata-first log retention/deletion exceptions; About modal no longer exposes build/API details and links to Privacy Policy, Support, and Account Deletion; latest Vercel deployment `dpl_3xe3j8HQ6JbvHPrLTFheh4CPQJJu` is aliased to `https://quiet-room-privacy-policy.vercel.app`; site package no longer references Quiet Room QA, old door wordmark/crossmark assets, or the crucifix graphic |
| 13 In-app response reporting | `codex/privacy/task-13-report-response` | `codex/privacy/task-13-report-response-backend` | `../privacy-task-13` | Codex | qa | V1 report action, modal, backend storage, and test hooks are implemented; Android local-QA Detox happy path passes on `emulator-16744` | — | paired worktree created with local-only mobile env/Firebase/signing files copied in; native projects regenerated for local QA; verified TypeScript, local-QA config, focused backend route tests, Detox build, and `e2e/quiet-room.report-response.test.js` |
| 14 Android permission audit | `develop` | — | `../quiet-room-mobile` | Codex | qa | Android release manifest rebuilt and verified without microphone, storage/media, overlay, camera, or notification permissions | — | `app.json` now blocks unnecessary Android permissions and configures `expo-av` with `microphonePermission: false`; the current local generated Android release manifest/AAB was rebuilt with `./gradlew :app:bundleRelease` and ships only internet, audio-settings, network-state, app-local AndroidX receiver, and Play install-referrer permissions |
| 15 iOS privacy manifest audit | `develop` | — | `../quiet-room-mobile` | Codex | qa | App-level iOS privacy manifest source added to tracked Expo config and verified through the QA release simulator artifact | — | `app.json` now declares Quiet Room's collected data types, no tracking, and no tracking domains; `npm run native:sync:qa -- ios`, `npm run ios:testflight:preflight:qa`, `npm run detox:build:ios:qa`, and app-bundle `plutil` inspection passed; generated `PrivacyInfo.xcprivacy` is packaged in `QuietRoomQA.app` with React Native/CocoaPods required-reason API aggregation |
| 16 Store console disclosure pass | `develop` | — | `../quiet-room-mobile` | Codex | ready for review | Play Console and App Store Connect disclosure worksheet plus reviewer-note copy prepared from current data inventory, public site, app entry points, and permission audit | — | final worksheet lives at `docs/privacy/store-console-disclosure-worksheet.md`; public URLs verified with `200` responses on 2026-04-22; remaining final-submission checks are production iOS privacy-manifest packaging, production HTTPS/log-retention confirmation, and store-candidate smoke checks |

## Production Release Notes

### 2026-05-19 GPT-5.5 store redeploy across QA/prod lanes

- Merged the GPT-5.5 mobile model option into `develop` and pushed `origin/develop` to `43bbf6d`, including the follow-up iOS build bump needed for the prod lane.
- Re-ran the shared QA/prod store deploy lanes from the updated `develop` source so the GPT-5.5 option is present across all four variants:
  - QA iOS TestFlight: `Quiet Room QA` / `com.quietroom.mobile.qa` build `18` uploaded.
  - QA Android Play internal: `com.quietroom.mobile.qa` versionCode `9` uploaded as draft internal release through Play edit `17842810693724721947`.
  - Prod Android Play internal: `com.quietroom.mobile` versionCode `9` uploaded as draft internal release through Play edit `13321724351919822529`.
  - Prod iOS TestFlight: `Quiet Room` / `com.quietroom.mobile` build `19` uploaded.
- Deployment blocker encountered: the first prod iOS retry on build `18` was correctly rejected because App Store Connect already had build `18`; after bumping iOS to build `19`, the archive/export path was blocked by Xcode command-line account access with `Failed to Use Accounts` for team `SV7SPMY2Q8`.
- Resolution: signing into iCloud/Xcode restored App Store Connect account access for the CLI; re-exporting the existing `build/ios-prod-b19.xcarchive` with `xcodebuild -exportArchive ... -allowProvisioningUpdates` completed the upload.
- Follow-up finding: prod iOS build `19` was uploaded with the legacy internal-only TestFlight marker because `ios:testflight:deploy:prod` did not pass `--external-testflight` and the deploy script still defaulted all lanes to `testFlightInternalTestingOnly = true`.
- Verification: the final prod iOS distribution logs reported `UPLOAD SUCCEEDED with no errors`, `Uploaded QuietRoom`, and `** EXPORT SUCCEEDED **`; `npm run ios:testflight:status:prod` confirmed version `1.0.0`, build `19`, bundle `com.quietroom.mobile`, Firebase project `gabriel-e6156`, and prod backend URLs.
- Fix queued on `develop`: QA deploys remain internal-only by default, while prod deploys now generate `testFlightInternalTestingOnly = false` by default and the prod npm deploy command passes `--external-testflight` explicitly.
- Remaining console-side follow-up: wait for Apple processing, attach the processed QA build to the intended internal TestFlight group if needed, upload a new prod iOS build for an external-eligible TestFlight candidate, and promote or roll out the Play draft internal releases when ready.

### 2026-05-12 QA iOS TestFlight build 16 upload

- Downloaded and verified the refreshed QA App Store provisioning profile `matt profile qa`, UUID `a4879aba-247b-4795-8f04-23049307cbeb`, for `SV7SPMY2Q8.com.quietroom.mobile.qa`; the profile includes `com.apple.developer.applesignin = Default` and expires on April 8, 2027.
- Restored the local QA env/Firebase files into this rollout worktree from the store-distribution worktree, then regenerated the QA native iOS project with `npm run native:sync:qa -- ios`.
- Prepared QA iOS build `16` for version `1.0.0` after App Store Connect rejected build `14` because QA build `15` had already been uploaded previously.
- Uploaded `Quiet Room QA` / `com.quietroom.mobile.qa` build `16` to App Store Connect/TestFlight with `npm run ios:testflight:deploy:qa`.
- Archive entitlement verification passed for `SV7SPMY2Q8.com.quietroom.mobile.qa` plus `com.apple.developer.applesignin = Default`.
- App Store Connect upload output reported `Upload succeeded`, `Uploaded QuietRoomQA`, and `** EXPORT SUCCEEDED **`.
- Post-upload `npm run ios:testflight:status:qa` confirmed build `16`, QA Firebase project `gabriel-qa-89f20`, QA backend URLs, and `https://quiet-room-qa.vercel.app`.
- Local artifacts:
  - archive: `build/ios-qa-b16.xcarchive`
  - export options: `build/exportOptions-qa-b16.plist`
  - no local IPA export directory was retained because the export destination was `upload`

### 2026-05-12 Prod iOS TestFlight build 14 upload

- Bumped prod iOS build metadata from build `13` to build `14` for version `1.0.0`.
- Uploaded `Quiet Room` / `com.quietroom.mobile` build `14` to App Store Connect/TestFlight with `npm run ios:testflight:deploy:prod`.
- The deploy used manual App Store signing with profile `matt profile`, UUID `94fb0f32-2364-4562-a9cc-2cd898a99018`, and archive entitlement verification passed for `SV7SPMY2Q8.com.quietroom.mobile` plus `com.apple.developer.applesignin = Default`.
- App Store Connect upload output reported `Upload succeeded`, `Uploaded QuietRoom`, and `** EXPORT SUCCEEDED **`.
- Local artifacts:
  - archive: `build/ios-prod-b14.xcarchive`
  - export options: `build/exportOptions-prod-b14.plist`
  - no local IPA export directory was retained because the export destination was `upload`

### 2026-05-12 iOS TestFlight signing refresh

- Added shared iOS TestFlight deploy commands for both lanes:
  - `npm run ios:testflight:profile:qa`
  - `npm run ios:testflight:profile:prod`
  - `npm run ios:testflight:export:qa`
  - `npm run ios:testflight:export:prod`
  - `npm run ios:testflight:deploy:qa`
  - `npm run ios:testflight:deploy:prod`
- PROD manual App Store signing is verified with profile `matt profile`, UUID `94fb0f32-2364-4562-a9cc-2cd898a99018`, for `SV7SPMY2Q8.com.quietroom.mobile`; the profile includes `com.apple.developer.applesignin = Default` and expires on April 8, 2027.
- QA manual App Store signing is verified with profile `matt profile qa`, UUID `a4879aba-247b-4795-8f04-23049307cbeb`, for `SV7SPMY2Q8.com.quietroom.mobile.qa`; the profile includes `com.apple.developer.applesignin = Default` and expires on April 8, 2027.
- The prior QA automatic export-signing path remains available as a temporary fallback via `bash ./scripts/deploy-ios-testflight.sh qa --automatic-signing --upload`, but the proven path is now manual QA signing with the refreshed QA profile.

### 2026-04-24 Prod app release rollout

- Promoted mobile `origin/master` to `06d649bc9bfa309757d788cff109a43812a63c59` and backend `origin/main` to `e39ef04b79a987830be68852dd51ddb4a9403e32`.
- Deployed prod backend image `054769575180.dkr.ecr.us-east-1.amazonaws.com/gabriel-backend-prod:e39ef04` to `gabriel_lambda_prod`, `gabriel-profile-builder_prod`, and `gabriel_streaming_lambda_prod`; all three Lambda updates reported `Successful`.
- Verified prod health endpoint returned `200 OK` with `{"status":"ok"}`.
- Android prod AAB built for `com.quietroom.mobile`, version `1.0.0`, `versionCode 6`.
  - Output: `android/app/build/outputs/bundle/release/app-release.aab`.
  - SHA256: `514818e8d18b729ac834dfea06393cf81a9597925f9a106e16ddc21aedaf2e0c`.
  - Uploaded to Play internal testing as draft release `PROD internal 6` through Play edit `00409671943079567863`.
- iOS prod unsigned archive built for `com.quietroom.mobile`, version `1.0.0`, build `13`.
  - Output: `build/QuietRoom-b13-unsigned.xcarchive`.
  - Uploaded to App Store Connect/TestFlight with `testFlightInternalTestingOnly: true`; upload logs reported `UPLOAD SUCCEEDED with no errors`.
- Release mapping for this internal prod candidate: Android `versionCode 6` / iOS build `13` / mobile commit `06d649bc9bfa309757d788cff109a43812a63c59` / backend commit `e39ef04b79a987830be68852dd51ddb4a9403e32`.
- Remaining console-side follow-up: attach the processed iOS build to the intended internal TestFlight group and promote or roll out the Play draft internal release if Play Console requires it.

### 2026-04-21 Privacy site prod-only branding release

- Deployed `site/quiet-room-privacy-policy` to production Vercel with `npx vercel --prod --yes`.
- Production deployment: `dpl_3xe3j8HQ6JbvHPrLTFheh4CPQJJu`.
- Canonical alias: `https://quiet-room-privacy-policy.vercel.app`.
- Verified `200` responses for `/`, `/privacy`, `/support`, `/account-deletion`, and `/assets/quiet-room-door-icon.png`.
- Verified live pages reference `quiet-room-door-icon.png`, and the live PNG matches `assets/icon.png`.
- Verified the published privacy-site HTML has no `Quiet Room QA`/QA references and no old door wordmark, crossmark, or crucifix asset references.

### 2026-04-22 Privacy site redeploy

- Redeployed `site/quiet-room-privacy-policy` to production Vercel with `npx vercel deploy --prod --yes`.
- Production deployment: `dpl_BG8SFKTEGq522kzdRnGDwSDYmtAV`.
- Canonical alias: `https://quiet-room-privacy-policy.vercel.app`.
- Verified `200` responses for `/`, `/privacy`, `/support`, `/account-deletion`, and `/assets/quiet-room-door-icon.png` with Node `fetch`.

## QA Release Testing Notes

### 2026-04-21 Store-candidate manual QA setup

- Verified hosted QA mobile config with `npm run mobile:verify:qa`: app name `Quiet Room QA`, iOS bundle ID `com.quietroom.mobile.qa`, Android package `com.quietroom.mobile.qa`, QA Firebase files, QA API/streaming URLs, and no config warnings or failures.
- Confirmed Android release signing readiness with `npm run android:play:status:qa`; the upload keystore was present and `android/app/build.gradle` was aligned to version `1.0.0` / versionCode `4`.
- Regenerated native projects for the hosted QA release target with `npm run native:sync:qa`, including Expo prebuild, Android Gradle/Detox/network-security patches, iOS Podfile patch, pod install, and iOS signing patch.
- Built the QA release simulator artifacts:
  - iOS: `npm run detox:build:ios:qa` / `ios.sim.release` produced `ios/build/Build/Products/Release-iphonesimulator/QuietRoomQA.app`.
  - Android: `bash ./scripts/with-mobile-env.sh qa qa npx detox build -c android.emu.release` produced `android/app/build/outputs/apk/release/app-release.apk`.
- Installed and launched both QA release builds for manual testing:
  - iOS booted on the iPhone 17 simulator as `com.quietroom.mobile.qa`.
  - Android installed on `emulator-16744` as `com.quietroom.mobile.qa`; after an Android System UI ANR prompt, selecting `Wait` revealed the Quiet Room home screen.
- Screenshots confirmed both release builds opened to the Quiet Room welcome screen. No automated smoke suite was run in this session; this note records manual QA environment readiness only.

### 2026-04-21 QA store release artifact attempt

- Resynced native projects to QA only with `npm run native:sync:qa`.
- Re-verified QA mobile config with `npm run mobile:verify:qa`: app name `Quiet Room QA`, iOS bundle ID `com.quietroom.mobile.qa`, Android package `com.quietroom.mobile.qa`, QA Firebase files, QA API/streaming URLs, and no warnings or failures.
- Android QA Play preflight passed with `npm run android:play:preflight:qa`: version `1.0.0`, versionCode `4`, package `com.quietroom.mobile.qa`, `google-services.qa.json`, upload keystore, and Gradle release signing were all aligned.
- Built the signed QA Android App Bundle with `bash ./scripts/with-mobile-env.sh qa qa bash -lc 'cd android && ./gradlew bundleRelease'`.
  - Output: `android/app/build/outputs/bundle/release/app-release.aab`.
  - Size: about 30 MB.
  - SHA256: `98988f24d8649dfd7eb439ecc7e5ca29c54a2919c7a068ddea658fc479defbe4`.
- iOS QA TestFlight preflight passed when run through the QA environment, with remaining non-blocking metadata warnings already known from the generated native project.
- iOS QA command-line archive was attempted for `QuietRoomQA` / `com.quietroom.mobile.qa` / build `11`, but did not produce an archive because this machine has no matching QA provisioning profile. The installed local profile is for `com.quietroom.mobile`, not `com.quietroom.mobile.qa`.
- Store uploads were not completed from this shell:
  - Android: no local Play upload script or Google Play service-account credentials were present.
  - iOS: QA App Store/TestFlight upload remains blocked until Xcode/App Store Connect has a QA provisioning profile or the upload is performed from a properly signed-in Xcode session.

## Account Deletion Stream Notes

Recommended local structure:

```text
../privacy-task-04/
  quiet-room-mobile/   -> branch: codex/privacy/task-05-mobile-deletion
  gabriel-backend/     -> branch: codex/privacy/task-04-backend-deletion
```

Ownership split:
- `gabriel-backend` owns `DELETE /api/account` and shared `/test/*` hooks
- `quiet-room-mobile` owns in-app deletion flow and Playwright mobile coverage
