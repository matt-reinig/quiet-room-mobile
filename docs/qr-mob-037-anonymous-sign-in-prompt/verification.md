# QR-MOB-037 Verification

## Result

Passed on 2026-07-18 using the Android local-QA release configuration on `emulator-5554` (`Galaxy_S22_Plus_Bottom_Inset_Repro`).

The focused test proved that:

- no guest sign-in prompt exists before the first send;
- the prompt appears immediately after the optimistic first guest message;
- the copy is visible while the assistant response continues preparing;
- the callout remains correctly positioned after the assistant response finishes;
- the callout is pinned above the composer rather than inserted into the transcript;
- tapping **Sign in** opens the existing sign-in sheet.
- tapping **×** hides the callout and it stays hidden for the same anonymous UID after a cold relaunch.

## Commands

```bash
npm install
npm run mobile:verify:local-qa
npm run native:sync:local-qa
npm run typecheck
DETOX_ATTACHED_DEVICE=emulator-5554 \
  bash ./scripts/with-mobile-env.sh qa local \
  npx detox build -c android.att.release
E2E_API_BASE=http://127.0.0.1:5002 \
  DETOX_ATTACHED_DEVICE=emulator-5554 \
  bash ./scripts/with-mobile-env.sh qa local \
  npx detox test -c android.att.release \
  e2e/quiet-room.anonymous-sign-in-prompt.test.js \
  --record-logs all --take-screenshots all
git diff --check
```

## Evidence

- Final pinned-banner matrix: 2 tests passed, 2 tests total in 40.474 seconds.
- Final pinned-banner visual artifact: `artifacts/android.att.release.2026-07-18 18-36-05Z/✓ Quiet Room anonymous sign-in prompt offers sign in after the guest sends their first message/anonymous-sign-in-prompt-pinned-after-response.png`
- Detox follow-up: 1 test passed, 1 test total in 29.551 seconds.
- Completed-response visual artifact: `artifacts/android.att.release.2026-07-18 18-21-28Z/✓ Quiet Room anonymous sign-in prompt offers sign in after the guest sends their first message/anonymous-sign-in-prompt-after-response.png`
- Visual artifact: `artifacts/android.att.release.2026-07-18 17-50-59Z/✓ Quiet Room anonymous sign-in prompt offers sign in after the guest sends their first message/anonymous-sign-in-prompt-visible.png`
- Final sign-in-sheet artifact: `artifacts/android.att.release.2026-07-18 17-50-59Z/✓ Quiet Room anonymous sign-in prompt offers sign in after the guest sends their first message/testDone.png`
- `npm run typecheck`: passed.
- `npm run mobile:verify:local-qa`: passed with QA Firebase project `gabriel-qa-89f20`, local API `http://10.0.2.2:5002`, and Auth emulator `10.0.2.2:9099`.
- `git diff --check`: passed.

No QA store upload, production release, backend deployment, or database mutation was performed.
