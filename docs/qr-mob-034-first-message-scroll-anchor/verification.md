# QR-MOB-034 verification record

Date: 2026-07-16 through 2026-07-17

## Static and configuration checks

Passed:

```bash
npm run mobile:verify:qa
npm run mobile:verify:prod
npm run typecheck
node --check e2e/quiet-room.scroll-anchor.test.js
git diff --check
npm run native:sync:qa
npm run native:sync:prod
node --check e2e/helpers.js
```

QA resolved to `com.quietroom.mobile.qa`, Firebase `gabriel-qa-89f20`, and the QA API/streaming URLs. Production resolved to `com.quietroom.mobile`, Firebase `gabriel-e615`, and the production API/streaming URLs. Both verification commands reported zero failures.

The Detox harness was also made explicit about readiness: each trial starts with deleted app data, establishes the anonymous session, waits for a stable composer, retries the visible AI-consent text target when the test-ID target does not dismiss it, and requires an assistant message before the follow-up send.

## Native results

The original focused test failed before the fix with the product frame recorded in `implementation-notes.md`. After the fix:

| Configuration | Command/result | Evidence |
| --- | --- | --- |
| Android QA release build | `android.att.release` APK and test APK built successfully from the final source | command: `bash ./scripts/with-mobile-env.sh qa qa npx detox build -c android.att.release` |
| Android QA, first send | Focused first-send case passed, including stability, post-reply layout, and drag recovery | `artifacts/android.att.release.2026-07-17 01-04-30Z/detox.log` |
| Android QA, follow-up | Final attached-emulator run reached the follow-up send but the app/instrumentation disconnected before the anchor assertion; not counted as a scroll pass | `artifacts/android.att.release.2026-07-17 01-06-11Z/detox.log` |
| Android QA, multiline | Existing reached-message multiline evidence remains recorded below; the final attached emulator went offline before a replacement run could complete | `artifacts/android.att.release.2026-07-17 00-34-32Z/detox.log` |
| Android QA, anonymous continuity | Three cold relaunches restored the newest anonymous conversation | command: `npx detox test -c android.att.release e2e/quiet-room.anonymous-continuity.test.js --record-logs failing --take-screenshots failing` |
| Android production config, first send | Focused first-send case passed | command: `E2E_APP_SCHEME=quietroommobile npx detox test -c android.att.release e2e/quiet-room.scroll-anchor.test.js -t 'first user message' --record-logs failing --take-screenshots failing` |
| iOS QA simulator, first send | Five command-level passes on the final clean bundle after the layout/state and reply-completion retries were added | focused command: `bash ./scripts/with-mobile-env.sh qa qa npx detox test -c ios.sim.release e2e/quiet-room.scroll-anchor.test.js -t 'first user message' --record-logs failing --take-screenshots failing` |
| iOS QA simulator, follow-up | Five command-level passes on the final clean bundle; one full-logging pass is preserved | `artifacts/ios.sim.release.2026-07-17 01-14-16Z/detox.log` |
| iOS QA simulator build | Release build succeeded for iPhone 17 simulator | command: `npm run detox:build:ios:qa` |

Additional Android emulator repetition: a seven-run loop on `emulator-5554` using the focused first-send command with `--record-logs failing --take-screenshots failing` reported 6 command-level passes and 1 cold-start/setup failure. Together with the artifact-backed first-send pass above, this is useful emulator evidence but is not counted as the required physical-device matrix. The failed loop artifact is `artifacts/android.att.release.2026-07-17 00-49-57Z/detox.log`; later standalone startup failures are `artifacts/android.att.release.2026-07-17 00-58-13Z/detox.log` and `artifacts/android.att.release.2026-07-17 01-00-30Z/detox.log`.

The full QA suite and some repetitions still have setup-only failures where the consent modal remains after the first target tap, Android loses window focus during a cold relaunch, or no optimistic user message appears before the environment is ready. Examples are `artifacts/android.att.release.2026-07-17 00-36-07Z/detox.log` and `artifacts/android.att.release.2026-07-17 00-40-01Z/detox.log`; these do not contain a reached-message scroll assertion failure. The helper now retries the consent text target, and the reached-message assertions pass in the focused artifacts above.

After the final-source rebuild, an additional focused first-send run passed on `emulator-15008` (`artifacts/android.att.release.2026-07-17 01-04-30Z/detox.log`). Follow-up and multiline retries then failed during `beforeEach` while Detox waited for the Android root window to regain focus (`artifacts/android.att.release.2026-07-17 01-16-04Z/detox.log` and `artifacts/android.att.release.2026-07-17 01-17-58Z/detox.log`); neither reached its scroll assertion. A later teardown also reported `adb: more than one device/emulator` after a second emulator appeared (`artifacts/android.att.release.2026-07-17 01-18-17Z/detox.log`).

One pre-assistant-settled iOS follow-up run missed the anchor while the conversation was still transitioning; the assistant-existence gate was added before follow-up measurement. A later clean-bundle repetition still exposed an old-offset frame once, so the implementation then added keyboard/layout state retries and a reply-completion refresh. The post-change clean matrix passed 5/5; the pre-final exploratory failure remains in `artifacts/ios.sim.release.2026-07-17 00-58-06Z/detox.log`.

## Acceptance items still requiring external device/state

- The plan requires repeated physical Android QA trials (10/10 normal, 10/10 anonymous, and 3/3 recovered anonymous). Only the Android emulator `emulator-15008` was available; it went offline during the final rerun and no physical Android device was attached, so those physical-device counts are not claimed.
- The final Android follow-up attempt is an environment/instrumentation failure (`Process crashed` / Detox disconnect), not a reached-message scroll assertion. A subsequent targeted run stopped at `adb: device offline`; the emulator was not healthy enough to continue.
- No consent or product logic was changed for this task; only the shared Detox helper's fallback text target was updated after the simulator/Android evidence showed the ID target could miss the visible button.
- No QA/prod store upload, backend deploy, database mutation, or App Review action was performed.
