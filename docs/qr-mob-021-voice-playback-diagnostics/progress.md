# QR-MOB-021 Voice Playback Diagnostics

## Worktree

- Path: `../worktrees/quiet-room-mobile-qr-mob-021-voice-playback-diagnostics`
- Branch: `codex/qr-mob-021-voice-playback-diagnostics`
- Base: `develop`

## Implemented

- Added SDK-compatible `expo-audio` dependency and config plugin.
- Added SDK-compatible `expo-asset` dependency and config plugin after Android exposed an incompatible transitive install.
- Added `EXPO_PUBLIC_RENDER_MODE=voice-diagnostics`.
- Added `renderMode` to Expo config `extra` so diagnostics mode can be resolved through both `process.env` and `Constants.expoConfig.extra`.
- Added Expo config `extra` fallbacks for API base, streaming base, render mode, and voice diagnostic defaults so shell-launched diagnostic runs do not get hidden by static Expo env inlining.
- Added optional seeded auth defaults through `EXPO_PUBLIC_VOICE_DIAGNOSTIC_EMAIL` and `EXPO_PUBLIC_VOICE_DIAGNOSTIC_PASSWORD`.
- Added optional `EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTH_TOKEN` support for emulator-issued diagnostic tokens and token-metadata logging that does not print the token itself.
- Added a dedicated native diagnostic screen at `src/screens/VoicePlaybackDiagnosticsScreen.tsx`.
- Added an operator-editable API base field on the diagnostic screen so a run can explicitly target a known backend such as `http://10.0.2.2:5003`.
- Added `EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTORUN=expo-av|expo-audio|both` for unattended simulator/dev-client comparisons.
- Added normalized telemetry in `src/lib/voicePlaybackDiagnostics.ts`.
- Added opt-in production voice-button diagnostics through `EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1`.
- Added reusable local-QA launch scripts: `voice:diagnostics:android:local-qa` and `voice:diagnostics:ios:local-qa`.

## Harness Inputs

The diagnostic screen compares both player implementations against the same saved assistant-message stream:

```text
GET /api/voice_stream?conversation_id=<conversation_id>&message_index=<message_index>
```

Environment defaults are optional:

```bash
EXPO_PUBLIC_RENDER_MODE=voice-diagnostics
EXPO_PUBLIC_VOICE_DIAGNOSTIC_CONVERSATION_ID=<saved conversation id>
EXPO_PUBLIC_VOICE_DIAGNOSTIC_MESSAGE_INDEX=<assistant message index>
EXPO_PUBLIC_VOICE_DIAGNOSTIC_RUNS=5
EXPO_PUBLIC_VOICE_DIAGNOSTIC_API_BASE=<optional backend override>
EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTH_TOKEN=<optional emulator/test token>
EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTORUN=<optional expo-av|expo-audio|both>
EXPO_PUBLIC_VOICE_DIAGNOSTIC_EMAIL=<optional disposable test user email>
EXPO_PUBLIC_VOICE_DIAGNOSTIC_PASSWORD=<optional disposable test user password>
```

The screen also lets the operator type the API base, conversation ID, message index, and run count.

For a deterministic local-QA sanity seed, run:

```bash
npm run voice:diagnostics:seed:local-qa
```

This uses the backend test hooks to create a disposable user, seed `seed-conv-001`, and print:

- app sign-in email/password
- `EXPO_PUBLIC_VOICE_DIAGNOSTIC_CONVERSATION_ID=seed-conv-001`
- `EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTH_TOKEN=<emulator id token>`
- `EXPO_PUBLIC_VOICE_DIAGNOSTIC_EMAIL=<seeded email>`
- `EXPO_PUBLIC_VOICE_DIAGNOSTIC_MESSAGE_INDEX=1`
- `EXPO_PUBLIC_VOICE_DIAGNOSTIC_PASSWORD=<seeded password>`

The seeded assistant reply is short. It is useful for proving the harness reaches the backend and both player paths, but a clipping baseline should use a longer saved assistant reply that matches the reported failure shape.

## Telemetry

Each attempt logs a structured console event prefixed with:

```text
[voice-playback-diagnostics]
```

Logged fields include:

- `engine`: `expo-av-live-get` or `expo-audio-live-get`
- `playbackMode`
- `positionMillis`
- `durationMillis`
- `isBuffering`
- `didJustFinish`
- `error`
- `messageIndex`
- `attemptId`
- `apiBase`
- diagnostic token metadata such as source, algorithm, audience, issuer, subject, provider, and kid presence

The screen keeps the latest events visible and summarizes pass, clipped, and error counts per engine.

## Reproduction Procedure

1. Make sure the worktree has local env files copied from the main checkout.
2. Run `npm run mobile:verify:local-qa`.
3. Run `npm run native:sync:local-qa` after dependency or plugin changes.
4. Launch a QA dev client with `EXPO_PUBLIC_RENDER_MODE=voice-diagnostics`.
5. Use the same saved assistant message for both players.
6. Run `expo-av` first for the baseline, then run `expo-audio` with the same input and run count.
7. Save the console telemetry and screen summary in this document under Evidence.

## Evidence

### 2026-06-04 implementation verification

- `npm run typecheck`: pass.
- `npm run mobile:verify:local-qa`: pass.
- `npm run native:sync:local-qa`: pass; regenerated Android/iOS QA local native projects and installed iOS pods `ExpoAsset (12.0.13)` and `ExpoAudio (1.1.1)`.
- `node --check scripts/seed-voice-diagnostics.js`: pass.
- `npm ls expo-asset expo-audio expo-modules-core --depth=0`: pass; top-level `expo-asset@12.0.13` and `expo-audio@1.1.1`.
- `git diff --check`: pass.
- `npm run voice:diagnostics:seed:local-qa`: pass against local backend `http://127.0.0.1:5002` with Firebase Auth/Firestore emulators running; creates a disposable user, seeds `seed-conv-001` with assistant message index `1`, and prints `EXPO_PUBLIC_VOICE_DIAGNOSTIC_*` launch hints for conversation ID, email, message index, and password.

### 2026-06-04 Android launch notes

- First Android dev-client launch after adding `expo-audio` built successfully but crashed during React context creation with `NoClassDefFoundError: expo.modules.kotlin.types.AnyTypeCache` from `expo.modules.asset.AssetModule`.
- Root cause was an incompatible `expo-asset@56.0.15` peer install. Running `npx expo install expo-asset` pinned `expo-asset@~12.0.13`, and `npm run native:sync:local-qa` regenerated the native projects with the compatible Expo Asset module.
- Post-fix Android launch no longer crashes; evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-diagnostics-after-expo-asset-fix.png`.
- Launching through `bash ./scripts/with-mobile-env.sh qa local env EXPO_PUBLIC_RENDER_MODE=voice-diagnostics ... npx expo run:android` still opened the normal native screen, not the diagnostics screen; evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-diagnostics-wrapper-launch.png`.
- Follow-up completed: `app.config.js` now writes `renderMode` into Expo `extra`, and `src/config/env.ts` prioritizes `Constants.expoConfig.extra.renderMode` when resolving `RENDER_MODE`. Metro confirmed `expoExtraRenderMode=voice-diagnostics` and `renderMode=voice-diagnostics`.
- Diagnostics screen rendered in Android dev client with seeded conversation defaults; evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-diagnostics-screen.png`.
- Seeded credential prefill rendered successfully; evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-diagnostics-prefilled.png`.
- Seeded user sign-in succeeded; evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-diagnostics-signed-in.png`.
- `expo-av-live-get` emitted `create` and `error` diagnostics for `seed-conv-001` / message index `1`; backend returned HTTP 500 through ExoPlayer as `InvalidResponseCodeException: Response code: 500`. Evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-diagnostics-expo-av-error.png`.
- `expo-audio-live-get` emitted `create`, `play`, and repeated `status` diagnostics against the same stream. It moved from `buffering/paused` to `idle/paused` with `positionMillis=0`, `durationMillis=0`, `isLoaded=false`, then was stopped by the operator. Evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-diagnostics-expo-audio-stopped.png`.

### 2026-06-05 corrected Android comparison

Temporary backend and emulator setup:

- Firebase Auth and Firestore emulators were running for project `gabriel-qa-89f20`.
- A temporary backend was started from the sibling Gabriel checkout on port `5003` with `FIRESTORE_EMULATOR_HOST=localhost:8080`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, `GABRIEL_E2E_ALLOW_AUTH_EMULATOR_TOKENS=1`, `GABRIEL_ENABLE_TEST_ENDPOINTS=1`, and `GABRIEL_TEST_KEY=gabriel-local-test-key`.
- The Android dev client targeted `EXPO_PUBLIC_VOICE_DIAGNOSTIC_API_BASE=http://10.0.2.2:5003` and used an emulator-issued `EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTH_TOKEN` from the seed script.
- Earlier Android failures against the seed were traced to stale or wrong runtime targeting: backend `5002` / expired-token runs produced `401 Invalid ID token` on the conversation probe and `500 Unable to stream audio` / ExoPlayer `InvalidResponseCodeException: Response code: 500` on the voice stream. The API-base field and fresh diagnostic token made this visible.

Host smoke checks before the mobile comparison:

- `GET http://127.0.0.1:5003/api/conversations/seed-conv-001` with the seeded token returned `200` and a JSON response containing two messages.
- `GET http://127.0.0.1:5003/api/voice_stream?conversation_id=seed-conv-001&message_index=1` with the seeded token returned `200`, `audio/mpeg`, `679296` bytes, with an MP3 frame prefix beginning `fff3c4c4005a2c399c00d3f0dc39b4c7`.

Android dev-client results:

- `expo-av-live-get`: conversation probe returned `200` with `messages-2/index-role-assistant`; all three stream probes returned `200 audio/mpeg`; final summary was `3/3 pass, 0 clipped, 0 error`. Run finish evidence included:
  - run 1: duration `44986ms`, completed.
  - run 2: `didJustFinish=true`, `positionMillis=43786`, `durationMillis=43786`, finish timestamp `2026-06-05T16:37:37.051Z`.
  - run 3: `didJustFinish=true`, `positionMillis=42106`, `durationMillis=42106`, finish timestamp `2026-06-05T16:38:30.346Z`.
- Evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-expo-av-5003-summary.png`.
- `expo-audio-live-get`: conversation probe returned `200` with `messages-2/index-role-assistant`; all three stream probes returned `200 audio/mpeg`; final summary was `3/3 pass, 0 clipped, 0 error`. Run finish evidence included:
  - run 1: `didJustFinish=true`, `positionMillis=41170`, `durationMillis=41146`, finish timestamp `2026-06-05T16:40:42.943Z`.
  - run 2: `didJustFinish=true`, `positionMillis=40518`, `durationMillis=40498`, finish timestamp `2026-06-05T16:41:33.030Z`.
  - run 3: `didJustFinish=true`, `positionMillis=43425`, `durationMillis=43402`, finish timestamp `2026-06-05T16:42:26.311Z`.
- Evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-expo-audio-5003-summary.png`.

Notes:

- The diagnostic screen performs a JavaScript header probe before each native playback attempt, so a 3-run comparison makes six voice-stream requests per engine.
- Android did not reproduce clipping against the deterministic seeded saved assistant message on either implementation.
- The seeded assistant reply is still only a harness sanity stream. A production-shaped clipping baseline should use a longer saved assistant reply matching the user-reported failure.

### 2026-06-05 iOS autorun comparison

Setup:

- iOS simulator: `iPhone 17 Pro` (`AFEA1094-63CF-492D-850C-902D1D9AF18B`), QA dev client `com.quietroom.mobile.qa`.
- Launch command used `EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTORUN=both`, `EXPO_PUBLIC_VOICE_DIAGNOSTIC_API_BASE=http://127.0.0.1:5003`, `seed-conv-001`, message index `1`, run count `3`, and the fresh emulator token from `voice:diagnostics:seed:local-qa`.
- iOS launch/input evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/ios-autorun-5003-final.png`.

Results:

- The iOS build and install succeeded after the Expo Audio/Asset native sync.
- The diagnostics screen loaded with `Current: Diagnostic env token`, API base `http://127.0.0.1:5003`, conversation `seed-conv-001`, message index `1`, and run count `3`.
- `expo-av-live-get` emitted auth and conversation probes against `http://127.0.0.1:5003`; the conversation probe returned `200` with `messages-2/index-role-assistant`, and stream probes returned `200 audio/mpeg`.
- `expo-av-live-get` completed all three iOS attempts; observed finish telemetry included run 1 at `positionMillis=42373`.
- `expo-audio-live-get` completed all three iOS attempts after adding the stable-paused terminal classifier. iOS did not provide a usable duration or `didJustFinish=true`; instead, it advanced to the end, switched to `readyToPlay/paused`, and held a stable position. The final observed run 3 finish event was `positionMillis=43659` at `2026-06-05T17:03:52.410Z`.
- iOS did not reproduce clipping against the deterministic seeded saved assistant message on either implementation.

Implementation note:

- The stable-paused classifier is intentionally limited to the diagnostics `expo-audio` path. It treats a loaded, non-buffering, paused status with a stable position greater than one second as a terminal playback state after 12 polls.

### Remaining coverage

- A longer real saved assistant message should be tested after the deterministic seed path is proven on both platforms.

### 2026-06-05 expanded expo-av clipping reproduction plan

Goal: try to recreate the reported clipping on the current `expo-av` playback path with higher run counts and longer production-shaped saved assistant messages before treating the short seeded-message pass as meaningful evidence.

Planned harness changes:

- Add seed-script support for long and variable assistant-message text so the saved message can match the reported failure shape more closely than the current short sanity seed.
- Keep the same `/api/voice_stream?conversation_id=...&message_index=...` saved-message endpoint so native playback is still exercising the real mobile stream path.
- Add or tighten a batch summary event for `expo-av` autoruns so high-count runs produce an easy-to-capture pass/clipped/error line in console output and on the diagnostics screen.

Planned test matrix:

- Android first, because the original clipping report is mobile-playback shaped and the Android `expo-av` path already reports usable `durationMillis`, `positionMillis`, and `didJustFinish`.
- Start with a long seeded assistant message and `EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTORUN=expo-av`.
- Run at least one 25-attempt batch after the long-message seed works end to end.
- If the 25-attempt Android batch is clean, increase to a larger batch or run a second text variant before moving to iOS.
- Run iOS `expo-av` with the same conversation/message text only after Android has either reproduced clipping or produced a clean high-count baseline.

Evidence to capture:

- Seeded text length and conversation/message index.
- Backend API base and token source metadata from the diagnostics events.
- Final `expo-av` summary counts: total attempts, passes, clipped finishes, and errors.
- At least one screenshot for each completed batch.
- If clipping reproduces, capture the exact run number, `positionMillis`, `durationMillis`, finish/error phase, platform, text length, API base, and whether the JS stream probe returned `200 audio/mpeg`.

### 2026-06-05 expanded Android expo-av long-message pass

Harness updates:

- Added seed-script support for `VOICE_DIAGNOSTIC_ASSISTANT_TEXT_VARIANT=long|production|very-long`, `VOICE_DIAGNOSTIC_ASSISTANT_TEXT_FILE=<path>`, and `VOICE_DIAGNOSTIC_TEXT_REPEAT=<count>`.
- Added a long production-shaped assistant seed text so saved-message playback can be tested beyond the short sanity message.
- Added a `summary` diagnostic phase with `totalAttempts`, `passedAttempts`, `clippedAttempts`, and `errorAttempts` so batch autoruns have a single auditable result event.
- Increased the diagnostics playback attempt timeout from `180000ms` to `360000ms`. The first long-message run proved the original timeout was too short for a roughly 208-second generated stream.

Long seed setup:

- Command: `VOICE_DIAGNOSTIC_ASSISTANT_TEXT_VARIANT=long npm run voice:diagnostics:seed:local-qa`.
- Backend: existing local QA backend `http://127.0.0.1:5002` with Auth emulator `127.0.0.1:9099` and Firestore emulator `127.0.0.1:8080`.
- Seeded conversation: `seed-conv-001`, message index `1`.
- Saved assistant text length: `3623` characters.
- Host conversation smoke: `GET /api/conversations/seed-conv-001` returned two messages, assistant index `1`, content length `3623`.
- Host voice smoke: `GET /api/voice_stream?conversation_id=seed-conv-001&message_index=1` returned `200`, `audio/mpeg`, `3196800` bytes.

Initial 25-run attempt:

- Command launched Android dev client with `EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTORUN=expo-av`, run count `25`, API base `http://10.0.2.2:5002`, and the fresh emulator token from the long seed.
- Run 1 first reported `durationMillis=1` / `positionMillis=1` while buffering, then later reported the real long-stream duration.
- Run 1 ended with `phase=error`, `error="Timed out before playback finished."`, `positionMillis=177827`, `durationMillis=208834`, timestamp `2026-06-05T17:24:42.394Z`.
- This is not counted as clipping evidence because the diagnostic harness itself stopped playback at the old `180000ms` timeout before the `208834ms` stream could finish.

Corrected 2-run long-message batch:

- Command relaunched Android dev client with the same long seed and `EXPO_PUBLIC_VOICE_DIAGNOSTIC_RUNS=2` after increasing the per-attempt timeout to `360000ms`.
- Run 1 finished cleanly: `phase=finish`, `positionMillis=205906`, `durationMillis=205906`, timestamp `2026-06-05T17:30:09.797Z`.
- Run 2 finished cleanly: `phase=finish`, `positionMillis=208354`, `durationMillis=208354`, timestamp `2026-06-05T17:33:56.780Z`.
- Batch summary: `batch/complete/requested-2/completed-2`, `passedAttempts=2`, `clippedAttempts=0`, `errorAttempts=0`, timestamp `2026-06-05T17:33:57.078Z`.
- Evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-expo-av-long-seed-2-summary.png`.
- Evidence log extract: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-expo-av-long-seed-2.log`.
- Host MP3 evidence: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-long-seed-host-voice.mp3`.

Current conclusion:

- Android `expo-av` still has not reproduced clipping when the diagnostics timeout is long enough to let the production-shaped saved message finish.
- The long text exposes a startup/buffering telemetry quirk where `expo-av` can report `durationMillis=1` / `positionMillis=1` for a long time before resolving the actual stream duration.
- A 25-run batch with this 208-second text would take too long for practical iteration. Next useful test is a medium-length production-shaped variant or a shorter long-text slice that can support higher run counts while still being more realistic than the original short seed.

### 2026-06-05 Android expo-av medium high-count batch

Medium seed setup:

- Command: `VOICE_DIAGNOSTIC_ASSISTANT_TEXT_VARIANT=medium npm run voice:diagnostics:seed:local-qa`.
- Backend: existing local QA backend `http://127.0.0.1:5002` with Auth emulator `127.0.0.1:9099` and Firestore emulator `127.0.0.1:8080`.
- Seeded conversation: `seed-conv-001`, message index `1`.
- Saved assistant text length: `1313` characters.
- Host conversation smoke: `GET /api/conversations/seed-conv-001` returned two messages, assistant index `1`, content length `1313`.
- Host voice smoke: `GET /api/voice_stream?conversation_id=seed-conv-001&message_index=1` returned `200`, `audio/mpeg`, `1146624` bytes.

Android `expo-av` 10-run batch:

- Command launched Android dev client with `EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTORUN=expo-av`, run count `10`, API base `http://10.0.2.2:5002`, and the fresh emulator token from the medium seed.
- All 10 runs reached `phase=finish`; finish durations were `78946`, `72634`, `77506`, `74002`, `72706`, `79906`, `74554`, `75850`, `77650`, and `75034ms`.
- Batch summary: `batch/complete/requested-10/completed-10`, `passedAttempts=10`, `clippedAttempts=0`, `errorAttempts=0`, timestamp `2026-06-05T19:36:31.058Z`.
- Evidence screen capture: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-expo-av-medium-seed-10-screen.png`.
- Evidence log extract with final summary: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-expo-av-medium-seed-10.log`.
- Host MP3 evidence: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-medium-seed-host-voice.mp3`.

Current conclusion:

- Android `expo-av` still has not reproduced clipping after the medium production-shaped saved-message batch.
- The medium batch repeatedly showed the same startup telemetry pattern as the long run: initial `durationMillis=1` / `positionMillis=1`, sometimes while buffering and sometimes after buffering cleared, before the real stream duration resolved and playback finished normally.
- The next useful reproduction attempt should increase repetition or vary the failure shape rather than only proving another clean Android saved-message GET playback. Good candidates: a larger medium batch, a medium text repeated two or three times, an iOS `expo-av` batch against the same seed, or production-session text captured from an actual clipped report if available.

### 2026-06-05 Android expo-av medium-repeat high-count batch

Repeated medium seed setup:

- Command: `VOICE_DIAGNOSTIC_ASSISTANT_TEXT_VARIANT=medium VOICE_DIAGNOSTIC_TEXT_REPEAT=2 npm run voice:diagnostics:seed:local-qa`.
- Backend: existing local QA backend `http://127.0.0.1:5002` with Auth emulator `127.0.0.1:9099` and Firestore emulator `127.0.0.1:8080`.
- Seeded conversation: `seed-conv-001`, message index `1`.
- Saved assistant text length: `2643` characters.
- Host conversation smoke: `GET /api/conversations/seed-conv-001` returned two messages, assistant index `1`, content length `2643`.
- Host voice smoke: `GET /api/voice_stream?conversation_id=seed-conv-001&message_index=1` returned `200`, `audio/mpeg`, `1237632` bytes.

Android `expo-av` 15-run batch:

- Command launched Android dev client with `EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTORUN=expo-av`, run count `15`, API base `http://10.0.2.2:5002`, and the fresh emulator token from the repeated-medium seed.
- All 15 runs reached `phase=finish`; finish durations were `72754`, `76954`, `76786`, `69634`, `72394`, `74746`, `74434`, `75154`, `74938`, `71098`, `75298`, `73738`, `80098`, `76690`, and `75634ms`.
- Batch summary: `batch/complete/requested-15/completed-15`, `passedAttempts=15`, `clippedAttempts=0`, `errorAttempts=0`, timestamp `2026-06-05T20:04:43.062Z`.
- Evidence screen capture: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-expo-av-medium-repeat2-15-screen.png`.
- Evidence log extract with final summary: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-expo-av-medium-repeat2-15.log`.
- Seed and host-stream smoke evidence: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-medium-repeat2-seed-and-host-smoke.txt`.
- Host MP3 evidence: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-medium-repeat2-host-voice.mp3`.

Current conclusion:

- Android `expo-av` still has not reproduced clipping after a 2643-character repeated-medium saved-message batch with 15 attempts.
- The repeated-medium batch again showed the startup telemetry pattern on every run: `durationMillis=1` / `positionMillis=1`, then late resolution to the actual stream duration, then a normal finish.
- Combined Android local-QA saved-message `expo-av` evidence is now clean across the corrected long-message batch (`2/2`), the medium batch (`10/10`), and the repeated-medium batch (`15/15`), for `27/27` corrected Android attempts with `0` clipped and `0` error.
- Since Android saved-message GET playback has not recreated clipping across these shapes, the next useful attempt should change another variable: iOS `expo-av` against the same repeated-medium seed, a different real production text from an actual clipped report, or a production-flow test from `MessageVoiceButton` rather than the diagnostics autorun screen.

### 2026-06-05 iOS expo-av medium-repeat stall batch

Repeated medium seed setup:

- Command: `VOICE_DIAGNOSTIC_ASSISTANT_TEXT_VARIANT=medium VOICE_DIAGNOSTIC_TEXT_REPEAT=2 npm run voice:diagnostics:seed:local-qa`.
- Backend: existing local QA backend `http://127.0.0.1:5002` with Auth emulator `127.0.0.1:9099` and Firestore emulator `127.0.0.1:8080`.
- Seeded conversation: `seed-conv-001`, message index `1`.
- Saved assistant text length: `2643` characters.
- Host conversation smoke: `GET /api/conversations/seed-conv-001` returned two messages, assistant index `1`, content length `2643`.
- Host voice smoke: `GET /api/voice_stream?conversation_id=seed-conv-001&message_index=1` returned `200`, `audio/mpeg`, `1234560` bytes.

iOS `expo-av` 8-run batch:

- Command launched the iPhone 17 Pro simulator (`AFEA1094-63CF-492D-850C-902D1D9AF18B`) with `EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTORUN=expo-av`, run count `8`, API base `http://127.0.0.1:5002`, and the fresh emulator token from the repeated-medium seed.
- Runs `1` through `7` reached `phase=finish`; finish positions were `75372`, `67430`, `75172`, `76159`, `75824`, `79659`, and `74174ms`.
- Run `8` emitted `phase=create`, a successful stream probe of `200 audio/mpeg`, `phase=play`, then stopped producing complete status events after `positionMillis=54000` with `didJustFinish=false`.
- The batch did not emit a final `summary`, `finish`, `error`, or `timeout` event for run `8` before the Expo process was stopped after the timeout window had passed.
- Evidence log: `docs/qr-mob-021-voice-playback-diagnostics/evidence/ios-expo-av-medium-repeat2-8.log`.
- Evidence screen capture from the exact iPhone 17 Pro simulator: `docs/qr-mob-021-voice-playback-diagnostics/evidence/ios-expo-av-medium-repeat2-8-stalled-screen-iphone17pro.png`.
- Seed and host-stream smoke evidence: `docs/qr-mob-021-voice-playback-diagnostics/evidence/ios-medium-repeat2-seed-and-host-smoke.txt`.
- Host MP3 evidence: `docs/qr-mob-021-voice-playback-diagnostics/evidence/ios-medium-repeat2-host-voice.mp3`.

Current conclusion:

- This iOS batch still does not confirm the reported clipping, because the harness did not record an early `didJustFinish=true` or a `clipped` summary classification.
- It did expose a new iOS `expo-av` failure-shaped behavior: after seven normal finishes, run `8` stopped advancing diagnostics at `54000ms` and never produced a terminal event.
- The next useful reproduction step is to make the iOS path classify this no-terminal-event case explicitly, then rerun iOS and compare the same repeated-medium seed against `expo-audio`.

### 2026-06-06 Android in-app switcher rehearsal

Switcher-enabled local-QA launch:

- Command: `npm run voice:diagnostics:switcher:android:local-qa`.
- Device: Android emulator `emulator-10896`, focused app `com.quietroom.mobile.qa/.MainActivity`.
- Build result: Gradle `BUILD SUCCESSFUL`; Metro bundled `index.ts`; app launched through the QA development-client deep link.
- Normal chat stayed the first screen and showed the flag-gated voice diagnostics activity icon in the header.
- Tapping the activity icon opened the `Voice playback diagnostics` screen in the same installed app.
- Tapping `Chat` returned to the normal chat screen without reinstalling or relaunching.
- Evidence screenshots:
  - `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-switcher-normal-chat.png`
  - `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-switcher-diagnostics.png`
  - `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-switcher-return-chat.png`

Flag-off local-QA launch:

- Command: `bash ./scripts/with-mobile-env.sh qa local npx expo run:android`.
- Build result: Gradle `BUILD SUCCESSFUL`; Metro bundled `index.ts`.
- The normal chat screen launched without the voice diagnostics activity icon, confirming the switcher is hidden when `EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1` is not set.
- Evidence screenshot: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-switcher-flag-off-chat.png`.

Limitations:

- The local Firebase/backend services were not available during this switcher rehearsal, so chat generation and live voice playback were not exercised in this run.
- Device logs showed only the expected local network failures: `Failed to load feature flags`, `Failed to load conversations`, and `Failed to load model catalog`; no `FATAL EXCEPTION` appeared during the switcher round trip.

### 2026-06-06 Android QA newuser voice flow

QA setup:

- Device: Android emulator `emulator-10896`, app package `com.quietroom.mobile.qa`.
- Launch command: `bash ./scripts/with-mobile-env.sh qa qa env EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1 npx expo run:android`.
- QA API health checks passed for both configured Lambda URLs:
  - `https://6rc3hj3tvyjheia4ilr5svat5i0vdkzm.lambda-url.us-east-1.on.aws/health`
  - `https://wcqbsjvwjbv3hvkthaoxqboljq0kmcap.lambda-url.us-east-1.on.aws/health`
- Account: `newuser@example.com`, authenticated through the QA Firebase project `gabriel-qa-89f20`.
- Conversation selected from QA `/api/conversations`: `1776812388514-jbsmz64q`, latest assistant message index `9`.

User-like flow:

- Cleared app state with `adb shell pm clear com.quietroom.mobile.qa`.
- Launched the QA dev client, signed in as `newuser@example.com`, and loaded an existing conversation about Psalm 42.
- Sent a realistic prompt through the normal chat UI. The intended prompt was "Please give me a medium reflection on Psalm 42 for someone discouraged about 180 words"; the actual adb-entered prompt visible in the app was truncated to `Please give me a medium reflection on Psalm 42 for someo about 180 words`.
- QA returned a completed assistant response. The normal chat card rendered the production voice button.

Production voice-button result:

- Tapped the normal assistant message voice button, not the diagnostics screen.
- Engine: `expo-av-live-get`.
- Message index: `9`.
- Terminal event: `phase=finish`, `didJustFinish=true`, `positionMillis=64690`, `durationMillis=64690`, timestamp `2026-06-06T23:34:01.449Z`.
- Result: no clipping, no playback error observed.
- Evidence log: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-voice-production.log`.

In-app diagnostics against the same QA conversation/message:

- Opened the diagnostics screen from the new header activity icon while staying in the same QA app session.
- Diagnostics screen showed `Current: newuser@example.com` and the QA API base.
- Inputs: conversation ID `1776812388514-jbsmz64q`, message index `9`, run count `1`.
- `expo-av-live-get`:
  - QA auth succeeded with token source `firebase-user`, provider `password`, audience `gabriel-qa-89f20`.
  - Conversation probe returned `200` with `messages-10/index-role-assistant`.
  - Stream probe returned `200 audio/mpeg`.
  - Terminal event: `phase=finish`, `positionMillis=64320`, `durationMillis=64320`, timestamp `2026-06-06T23:40:41.211Z`.
  - Summary: `passedAttempts=1`, `clippedAttempts=0`, `errorAttempts=0`.
  - Evidence log: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-diagnostics-av.log`.
- `expo-audio-live-get`:
  - QA auth succeeded with token source `firebase-user`, provider `password`, audience `gabriel-qa-89f20`.
  - Conversation probe returned `200` with `messages-10/index-role-assistant`.
  - Stream probe returned `200 audio/mpeg`.
  - It remained in `buffering/paused` for roughly 22 seconds before transitioning to `ready/playing`.
  - Terminal event: `phase=finish`, `positionMillis=59023`, `durationMillis=59016`, timestamp `2026-06-06T23:42:57.017Z`.
  - Summary: `passedAttempts=1`, `clippedAttempts=0`, `errorAttempts=0`.
  - Evidence log: `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-diagnostics-audio.log`.

Evidence screenshots:

- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-01-guest-chat.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-03-login-modal.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-05-login-filled.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-09-response-wait-25s.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-10-response-end.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-11-voice-started.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-13-voice-finished.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-14-diagnostics-open.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-17c-diagnostics-values-visible.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-20-diagnostics-av-finished.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-22-diagnostics-audio-finished.png`
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-qa-newuser-conversations.json`

Current conclusion:

- The full QA user flow worked end to end for `newuser@example.com`: sign-in, normal chat response, production voice playback, in-app diagnostics navigation, and both diagnostic engines against the same saved assistant message.
- Android QA did not reproduce clipping on this real account/message through either the production voice button or the one-run diagnostic comparison.
- The diagnostic comparison did reveal an engine-level difference on QA: `expo-audio` spent noticeably longer buffering and reported a shorter generated stream duration than `expo-av`. Because each run fetches a fresh stream for the same saved text, the duration values are useful playback evidence but not byte-identical audio comparisons.

### 2026-06-11 physical Pixel 8a QA diagnostic sideload

Device:

- Serial: `42151JEKB05266`.
- Model: Pixel 8a.
- Android: `16`.

Installed build:

- Package: `com.quietroom.mobile.qa`.
- Version code: `20`.
- Version name: `1.0.0`.
- APK: `android/app/build/outputs/apk/release/app-release.apk`.
- APK SHA256: `8ae64d56b6beba48c9a1536d2be1a33c72b2b4f442e115bb972b48ea908caef7`.
- APK signing SHA1: `D2:6F:2C:F6:85:1D:FC:8C:11:CA:91:A9:C0:23:C9:61:ED:D9:AA:53`.
- APK signing SHA256: `39:70:61:3B:B5:4B:DC:FD:D4:6A:2A:F3:43:F4:E5:BE:6E:C3:AF:71:E1:35:01:43:D7:24:2F:4D:3C:88:F7:97`.
- Install command: `adb -s 42151JEKB05266 install -r android/app/build/outputs/apk/release/app-release.apk`.
- Install result: `Success`.
- Device package readback: `versionCode=20`, `lastUpdateTime=2026-06-11 14:47:04`, `installerPackageName=null`.

QA config notes:

- The build was created with `bash ./scripts/with-mobile-env.sh qa qa env EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1 bash -lc 'cd android && ./gradlew assembleRelease'`.
- The worktree local `google-services.qa.json` and generated `android/app/google-services.json` were refreshed from `../quiet-room-mobile-store-distribution/google-services.qa.json` before building.
- That refreshed Firebase file targets QA project `gabriel-qa-89f20`, package `com.quietroom.mobile.qa`, and includes an Android OAuth client for certificate hash `2f06c1d3499a1aacbf660cf35bbc097be630373a`.
- The sideloaded APK is signed with the upload key hash `d26f2cf6851dfc8c11ca91a9c023c961edd9aa53`, not the `2f06...` Play app-signing hash in the refreshed Firebase file. Therefore a direct sideload can still hit Google `DEVELOPER_ERROR` unless the QA Firebase / Google OAuth Android app also registers the upload-key SHA1 for `com.quietroom.mobile.qa`.
- `firebase` and `gcloud` CLIs were not available in this shell, so the sideload SHA could not be added from this environment.

Phone evidence:

- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-physical-pixel8a-qa-diagnostic-v20-installed.png`.
- `docs/qr-mob-021-voice-playback-diagnostics/evidence/android-physical-pixel8a-qa-diagnostic-v20-relaunch.png`.
- The screenshots are black because the physical phone was asleep/locked during adb capture (`screenState=SCREEN_STATE_OFF`, focused app `com.quietroom.mobile.qa/.MainActivity`). Logcat showed the app process started and React Native ran `main`; no launch-time fatal exception was observed.

Verification:

- `npm run typecheck`: pass.
- `git diff --check`: pass.

### 2026-06-11 Android QA internal gated diagnostics deploy

Implementation update:

- Added `EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS_USER_IDS` support.
- The normal in-app diagnostics entry now requires both `EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1` and either an empty allowlist or a matching authenticated Firebase UID.
- The deployed QA build was configured with allowlist UID `b71cO4Azg8Sx2YofK5UFblMLCMk2`.
- The diagnostics screen still pre-fills the current conversation ID and latest assistant message index when opened from chat.

Verification before deploy:

- `npm run typecheck`: pass.
- `npm run android:play:status:qa`: pass; package `com.quietroom.mobile.qa`, versionCode `20`, upload key configured.
- `npm run android:play:preflight:qa`: pass; `19` pass, `0` warn, `0` fail.
- `git diff --check`: pass.

Build:

- Command: `bash ./scripts/with-mobile-env.sh qa qa env EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1 EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS_USER_IDS=b71cO4Azg8Sx2YofK5UFblMLCMk2 bash -lc 'cd android && ./gradlew bundleRelease'`.
- Result: Gradle `BUILD SUCCESSFUL`.
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`.
- AAB SHA256: `7854fd073079e195b645b5a034c34cc7bd90add2f854fe3f90cc76d87cba4387`.

Google Play QA internal:

- Previous internal track readback: `QA internal 19`, versionCodes `["19"]`, status `completed`.
- Upload edit: `06451464618696938177`.
- Uploaded versionCode: `20`.
- Commit result: edit `06451464618696938177` committed.
- Track readback after commit:
  - track: `internal`
  - release: `QA internal 20`
  - versionCodes: `["20"]`
  - status: `completed`
  - release notes: `qa/qa internal testing build versionCode 20; QR-MOB-021 voice playback diagnostics gated to the requested QA user id.`

Tracker:

- Updated `/Users/mjreinig/projects/Gabriel_App/quiet-room-mobile/docs/project-tracker.md` QR-MOB-021 row to record the Android QA internal `versionCode 20` gated diagnostics deploy.
