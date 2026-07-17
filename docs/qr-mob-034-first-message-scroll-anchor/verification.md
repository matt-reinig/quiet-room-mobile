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
| Android QA, first send | Focused first-send case passed, including stability, post-reply layout, and drag recovery | `artifacts/android.att.release.2026-07-17 00-38-29Z/detox.log` |
| Android QA, follow-up | Reached-message follow-up assertion passed in the three-case run | `artifacts/android.att.release.2026-07-16 23-31-04Z/detox.log` |
| Android QA, multiline | Focused multiline case passed with the Android keyboard active | `artifacts/android.att.release.2026-07-17 00-34-32Z/detox.log` |
| Android QA, anonymous continuity | Three cold relaunches restored the newest anonymous conversation | command: `npx detox test -c android.att.release e2e/quiet-room.anonymous-continuity.test.js --record-logs failing --take-screenshots failing` |
| Android production config, first send | Focused first-send case passed | command: `E2E_APP_SCHEME=quietroommobile npx detox test -c android.att.release e2e/quiet-room.scroll-anchor.test.js -t 'first user message' --record-logs failing --take-screenshots failing` |
| iOS QA simulator, first send | Five clean focused passes after the consent/readiness harness update | `artifacts/ios.sim.release.2026-07-17 00-09-24Z/detox.log`, `00-12-36Z`, `00-13-30Z`, `00-14-01Z`, `00-14-46Z` |
| iOS QA simulator, follow-up | Five clean focused passes after requiring the first assistant message to exist | `artifacts/ios.sim.release.2026-07-17 00-20-19Z/detox.log`, `00-21-04Z`, `00-21-42Z`, `00-22-35Z`, `00-24-48Z` |
| iOS QA simulator build | Release build succeeded for iPhone 17 simulator | command: `npm run detox:build:ios:qa` |

Additional Android emulator repetition: a seven-run loop on `emulator-5554` using the focused first-send command with `--record-logs failing --take-screenshots failing` reported 6 command-level passes and 1 cold-start/setup failure. Together with the three artifact-backed first-send passes above, this is useful emulator evidence but is not counted as the required physical-device matrix. The failed loop artifact is `artifacts/android.att.release.2026-07-17 00-49-57Z/detox.log`; later standalone startup failures are `artifacts/android.att.release.2026-07-17 00-58-13Z/detox.log` and `artifacts/android.att.release.2026-07-17 01-00-30Z/detox.log`.

The full QA suite and some repetitions still have setup-only failures where the consent modal remains after the first target tap, Android loses window focus during a cold relaunch, or no optimistic user message appears before the environment is ready. Examples are `artifacts/android.att.release.2026-07-17 00-36-07Z/detox.log` and `artifacts/android.att.release.2026-07-17 00-40-01Z/detox.log`; these do not contain a reached-message scroll assertion failure. The helper now retries the consent text target, and the reached-message assertions pass in the focused artifacts above.

One pre-assistant-settled iOS follow-up run missed the anchor while the conversation was still transitioning; the assistant-existence gate was added before follow-up measurement, and the five subsequent focused runs passed. The exploratory failure remains in `artifacts/ios.sim.release.2026-07-17 00-16-30Z/detox.log`.

## Acceptance items still requiring external device/state

- The plan requires repeated physical Android QA trials (10/10 normal, 10/10 anonymous, and 3/3 recovered anonymous). Only `emulator-15008` was attached in this workspace, so those physical-device counts are not claimed.
- No consent or product logic was changed for this task; only the shared Detox helper's fallback text target was updated after the simulator/Android evidence showed the ID target could miss the visible button.
- No QA/prod store upload, backend deploy, database mutation, or App Review action was performed.
