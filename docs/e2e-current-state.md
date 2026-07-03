# Quiet Room E2E Current State

QR-MOB-029 audit date: 2026-07-02 through 2026-07-03

## Summary

Quiet Room already has a meaningful Detox suite, but the automation surface is uneven:

- Detox is the primary E2E harness and should remain the source of truth for app behavior, selector-level assertions, backend-backed flows, keyboard/layout checks, and release smoke.
- The Android QA release Detox path now builds and runs targeted release smoke on the normal Pixel 34 emulator.
- Android release shell smoke and response smoke completed in this audit. iOS simulator discovery still needs local tooling cleanup before iOS release smoke can be rerun; the local-QA backend/Auth emulator expected by `qa/local` was not running.
- A minimal Maestro proof-of-concept flow now exists at `maestro/quiet-room-smoke.yaml`; it is useful as a very small installed-app shell smoke only, not as a replacement for Detox.

## Commands Audited

Prerequisite for isolated worktrees:

The canonical worktree setup is documented in `docs/privacy-v2/10-quiet-room-mobile-worktree-setup-guide.md`: copy or reference local-only env/Firebase/signing inputs, then regenerate native `ios/` and `android/` projects inside the worktree. The guide explicitly says not to copy `/ios` or `/android` from another worktree.

```sh
export MOBILE_ENV_BASE_FILE=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/.env
export MOBILE_ENV_OVERLAY_FILE=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/.env.qa
export MOBILE_ANDROID_SIGNING_ENV_FILE=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/.env.android.signing
export MOBILE_RELEASE_ASSET_ROOT=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile
```

Android QA smoke:

```sh
DETOX_AVD_NAME=Pixel34AVD_2 \
DETOX_ATTACHED_DEVICE=emulator-15008 \
DETOX_ANDROID_CONFIG=android.att.release \
npm run smoke:android:qa
```

Initial result on 2026-07-02:

- `npm run mobile:verify:qa` passed with no failures.
- Android native sync completed through `scripts/sync-native-variant.sh`, which ran `npx expo prebuild --clean --no-install --platform android` inside this worktree.
- The first `detox build -c android.att.release` completed successfully and produced:
  - `android/app/build/outputs/apk/release/app-release.apk`
  - `android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk`
- `detox test -c android.att.release e2e/quiet-room.response-smoke.test.js` was attempted on `emulator-15008`, which was confirmed to be the normal working `Pixel34AVD_2` AVD. The first run stalled during app/test-package uninstall; artifacts were written under `artifacts/android.att.release.2026-07-02 22-23-02Z/`.
- After manually reinstalling the generated app and test APKs, `detox test -c android.att.release e2e/quiet-room.response-smoke.test.js --reuse` reached instrumentation but failed before the Jest spec executed with `java.lang.NoClassDefFoundError: Failed resolution of: Landroidx/test/platform/tracing/Tracing;`.
- Follow-up clean rebuild attempts for `android.att.release` then failed at `:app:compileReleaseAndroidTestJavaWithJavac` because generated `DetoxTest.java` could not resolve `androidx.test.ext.junit.runners.AndroidJUnit4`, `androidx.test.filters.LargeTest`, or `androidx.test.rule.ActivityTestRule`.

Resolution on 2026-07-03:

- The Android release build command now targets only app tasks, avoiding Expo/library `androidTest` packaging work that Detox does not need: `:app:assembleRelease :app:assembleAndroidTest`.
- The native Gradle patch now inserts Detox's local Maven repository first, keeps `testBuildType` at the top level of `android {}`, adds explicit AndroidX test dependencies for Detox instrumentation, and excludes AndroidX test artifacts only from non-test runtime classpaths.
- A zero-byte cached Gradle POM for `com.wix:detox:20.47.0` was removed from the local Gradle cache after it caused `Content is not allowed in prolog` resolution errors.
- `npx detox build -c android.att.release` passed through the Detox config and produced the app release APK plus release androidTest APK.
- `npx detox test -c android.att.release e2e/quiet-room.response-smoke.test.js --record-logs all --take-screenshots failing --loglevel info` passed on `DETOX_ATTACHED_DEVICE=emulator-15008` / `DETOX_AVD_NAME=Pixel34AVD_2`: 1 test passed, total 56.433s.
- `npx detox test -c android.att.release e2e/quiet-room.smoke.test.js --record-logs all --take-screenshots failing --loglevel info` passed on the same emulator: 1 test passed, total 24.054s.

Local-QA blocker:

```sh
npm run mobile:verify:local-qa
curl -sS -m 5 http://localhost:5002/health
curl -sS -m 5 http://localhost:9099/
```

Result on 2026-07-02:

- `mobile:verify:local-qa` passed only when pointed at sibling env files.
- `localhost:5002` and `localhost:9099` refused connections, so local-QA Detox flows that depend on the local backend or Auth emulator are blocked until those services are started.

iOS blocker:

```sh
xcrun simctl list devices available
```

Initial result on 2026-07-02:

- The command hung twice and was interrupted, so iOS Detox smoke is blocked by local simulator tooling before app build/test.

Retry result on 2026-07-03:

- `MOBILE_ENV_BASE_FILE=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/.env MOBILE_ENV_OVERLAY_FILE=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/.env.qa MOBILE_RELEASE_ASSET_ROOT=/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile npm run smoke:ios:qa` completed the repo-native config verification, iOS prebuild, Podfile patch, pod install, and signing patch inside this worktree.
- The retry failed at `detox build -c ios.sim.release` before any Jest spec could run because Xcode could not enumerate simulators: `CoreSimulator is out of date. Current version (1051.54.0) is older than build version (1051.55.0).`
- `xcrun simctl list devices available` and `xcrun simctl list runtimes` still hung after restarting simulator services, and `xcodebuild -runFirstLaunch` also did not return promptly.
- Treat iOS release smoke as blocked by local Xcode/CoreSimulator installation state, not by Detox config or app source.

## Coverage Matrix

| Area | Existing Detox files | Current state |
| --- | --- | --- |
| App shell | `quiet-room.smoke.test.js`, `quiet-room.response-smoke.test.js` | Android QA release shell smoke passed on `Pixel34AVD_2` / `emulator-15008`. |
| Prompt/response | `quiet-room.response-smoke.test.js`, `quiet-room.streaming-smoke.test.js` | Android QA release response smoke passed against the hosted QA backend on `Pixel34AVD_2` / `emulator-15008`; broader streaming coverage remains focused-spec territory. |
| Composer/keyboard/layout | `quiet-room.composer-flow.test.js`, `quiet-room.chat-layout.test.js`, `quiet-room.login-layout.test.js`, `quiet-room.scroll-anchor.test.js` | Good focused coverage for prior Android/iOS layout regressions; not rerun in this audit after base Android release smoke passed. |
| Auth/login/session | `quiet-room.login-known-account.test.js`, `quiet-room.auth-persistence.test.js`, `quiet-room.ios-login-compliance.test.js` | Covered, but credentials/device readiness are prerequisites. |
| AI consent | `quiet-room.ai-consent.test.js` | Covers first-send block, accept/resume, cold relaunch, and signed-in backend persistence. |
| Conversations | `quiet-room.conversations-menu.test.js` | Covers conversation drawer actions and rename surface. |
| Account deletion | `quiet-room.account-deletion.test.js` | Covers success and retryable failure through backend test hooks. |
| Reporting | `quiet-room.report-response.test.js` | Covers assistant-response report submission and keyboard/modal layout. |
| Store screenshots | `quiet-room.app-store-screenshots.test.js` | Useful for screenshot capture, but should not be treated as release smoke. |
| About/privacy/support | `quiet-room.about-modal.visual.test.js`, `quiet-room.about-contact-email.test.js` | Covers public About links and support email copy. |
| Model gating/voice | `quiet-room.model-gating.test.js`, `quiet-room.streaming-smoke.test.js` | Covers feature-flagged model chrome and voice-mode streaming path. |
| Message affordances | `quiet-room.message-selection.test.js` | Covers long-press text selection without action-button reliance. |
| Visual/system modals | `quiet-room.crucifix-modal.test.js` | Covers fullscreen modal close safe-area behavior. |

## Selector Findings

`src/testIds.ts` is the app-side selector contract. `e2e/testIds.js` was missing several exported selectors and dynamic helpers, including:

- `aboutButton`
- prompt-cue root/panel/helper selectors
- login tab/signup/reset selectors
- assistant copy button helper
- conversation menu/delete helpers

The JS mirror has been updated so new E2E specs can reuse the same IDs instead of adding more literal strings.

## Release Smoke Recommendation

Keep Detox as the primary release-smoke harness.

Recommended release-smoke minimum:

```sh
npm run smoke:android:qa
npm run smoke:ios:qa
npm run smoke:android:prod
npm run smoke:ios:prod
```

Use the focused Detox specs when touching specific areas:

- Composer/layout: `npm run detox:test:composer:5556`, `npm run detox:test:ios:chat-layout`
- Account deletion: `npm run smoke:android:account-deletion:local-qa`
- Streaming/voice: `npm run detox:test:streaming:5556`
- Known-account auth: `npm run detox:login:android`, `npm run detox:login:ios`

Add Maestro only as a supplemental installed-app shell smoke. The POC flow is intentionally shallow:

```sh
MAESTRO_APP_ID=com.quietroom.mobile.qa maestro test maestro/quiet-room-smoke.yaml
```

The Maestro CLI was not installed on this machine during the audit, so this flow was syntax-added but not executed.

Maestro is worth keeping only if the team wants a quick manual/CI check that an already-installed build opens to the Quiet Room shell. It should not replace Detox for prompt/response, backend, auth, keyboard, persistence, or selector-rich UI behavior.

## Next Stabilization Steps

1. Follow `docs/privacy-v2/10-quiet-room-mobile-worktree-setup-guide.md` for every new mobile worktree: install dependencies, copy or reference local-only env/Firebase/signing inputs, verify config, and regenerate native projects in-place.
2. Keep Android release smoke anchored to `Pixel34AVD_2` or explicitly pass `DETOX_AVD_NAME` / `DETOX_ATTACHED_DEVICE` for the active attached emulator.
3. Start the local Gabriel backend and Firebase Auth emulator before local-QA specs.
4. Repair local Xcode/CoreSimulator tooling so `xcrun simctl list devices available` returns promptly and CoreSimulator versions match Xcode, then rerun `npm run smoke:ios:qa`.
5. Once base Android/iOS smoke passes, run the focused specs by feature area rather than attempting the entire suite in one batch.
