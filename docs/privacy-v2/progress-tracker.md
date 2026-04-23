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

## Production Release Notes

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
