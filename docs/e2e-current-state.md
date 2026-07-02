# Quiet Room E2E Current State

QR-MOB-029 audit date: 2026-07-02

## Summary

Quiet Room already has a meaningful Detox suite, but the automation surface is uneven:

- Detox is the primary E2E harness and should remain the source of truth for app behavior, selector-level assertions, backend-backed flows, keyboard/layout checks, and release smoke.
- The Android QA release Detox path is not currently reliable enough to count as release smoke.
- No Detox spec completed in this audit. Android test execution reached Detox/instrumentation, but failed before the Jest spec could execute; iOS simulator discovery hung; the worktree did not complete an iOS native sync; and the local-QA backend/Auth emulator expected by `qa/local` was not running.
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

Result on 2026-07-02:

- `npm run mobile:verify:qa` passed with no failures.
- Android native sync completed through `scripts/sync-native-variant.sh`, which ran `npx expo prebuild --clean --no-install --platform android` inside this worktree.
- The first `detox build -c android.att.release` completed successfully and produced:
  - `android/app/build/outputs/apk/release/app-release.apk`
  - `android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk`
- `detox test -c android.att.release e2e/quiet-room.response-smoke.test.js` was attempted on `emulator-15008`, which was confirmed to be the normal working `Pixel34AVD_2` AVD. The first run stalled during app/test-package uninstall; artifacts were written under `artifacts/android.att.release.2026-07-02 22-23-02Z/`.
- After manually reinstalling the generated app and test APKs, `detox test -c android.att.release e2e/quiet-room.response-smoke.test.js --reuse` reached instrumentation but failed before the Jest spec executed with `java.lang.NoClassDefFoundError: Failed resolution of: Landroidx/test/platform/tracing/Tracing;`.
- Follow-up clean rebuild attempts for `android.att.release` then failed at `:app:compileReleaseAndroidTestJavaWithJavac` because generated `DetoxTest.java` could not resolve `androidx.test.ext.junit.runners.AndroidJUnit4`, `androidx.test.filters.LargeTest`, or `androidx.test.rule.ActivityTestRule`. Treat this as the current Android release-smoke blocker.

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

Result on 2026-07-02:

- The command hung twice and was interrupted, so iOS Detox smoke is blocked by local simulator tooling before app build/test.
- This worktree also did not run `npm run native:sync:qa -- ios` or `npm run native:sync:qa`, so it never generated an iOS native project. A valid iOS smoke retry must complete the native sync step from `docs/privacy-v2/10-quiet-room-mobile-worktree-setup-guide.md` before building or testing.

## Coverage Matrix

| Area | Existing Detox files | Current state |
| --- | --- | --- |
| App shell | `quiet-room.smoke.test.js`, `quiet-room.response-smoke.test.js` | Covered by selectors, but Android QA response smoke did not complete on the attached emulator. |
| Prompt/response | `quiet-room.response-smoke.test.js`, `quiet-room.streaming-smoke.test.js` | Covered with live backend expectations; needs a responsive device and backend. |
| Composer/keyboard/layout | `quiet-room.composer-flow.test.js`, `quiet-room.chat-layout.test.js`, `quiet-room.login-layout.test.js`, `quiet-room.scroll-anchor.test.js` | Good focused coverage for prior Android/iOS layout regressions; not rerun in this audit because base smoke could not complete. |
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
2. Fix the Android release androidTest dependency/classpath issue so `detox build -c android.att.release` consistently produces a runnable release test APK from a clean native sync.
3. Restart or clear `Pixel34AVD_2`, then rerun `npm run smoke:android:qa` with `DETOX_AVD_NAME=Pixel34AVD_2`, `DETOX_ATTACHED_DEVICE=<Pixel34 serial>`, and `DETOX_ANDROID_CONFIG=android.att.release`.
4. Start the local Gabriel backend and Firebase Auth emulator before local-QA specs.
5. Repair local iOS simulator tooling so `xcrun simctl list devices available` returns promptly, then run `npm run native:sync:qa -- ios` before iOS Detox build/test.
6. Once base Android/iOS smoke passes, run the focused specs by feature area rather than attempting the entire suite in one batch.
