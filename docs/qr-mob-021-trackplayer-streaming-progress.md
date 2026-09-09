# QR-MOB-021 TrackPlayer streaming progress

Status: diagnostic harness, frozen fixture, run manifests, and bounded emulator capture evidence are present in the worktree. This note does not claim a product fix or root cause.

## Worktree and baseline

- Worktree: `/Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-qr-mob-021-trackplayer-streaming-implementation`
- Branch: `codex/qr-mob-021-trackplayer-streaming-implementation`
- Implementation starting point: `15bbea006458eaef1543203b083e707777fa7d4e` (`Plan emulator investigation of TrackPlayer streaming tail clipping`).
- Plan-recorded base: `develop` at `a95b7f1ff7b91defe7a2d0c95958c237eefc38bb`; the local `develop` ref has since advanced to `6af628e150050c49515be1f2ff12f7247788beb0`.
- Plan file: `docs/qr-mob-021-trackplayer-streaming-plan.md` at the plan commit above. The tracker remains `QR-MOB-021 | In Progress` and now links this implementation evidence.

## Implemented in this checkout

- `src/lib/voicePlaybackDiagnostics.ts`: QA/local deep-link gate, fixture-source allowlisting, run/attempt IDs, monotonic timing, structured `QR_MOB_021_VOICE_DIAG` events, TrackPlayer version metadata, and field sanitization for credentials/private content.
- `src/components/MessageVoiceButton.tsx`: normal message-button path with diagnostic fixture routing, source assertion/fallback suppression, TrackPlayer setup/reset/add/play/state/progress/queue-end/error/cleanup events, and stale-attempt guards.
- `scripts/voice-stream-fixture-server.mjs`: saved-message-shaped GET/HEAD fixture route, host-reachable binding, frozen MP3 manifest/hash, progressive cases (steady, delayed tails, chunk schedules, EOF variants), truncation negative control, range handling, and run/attempt-correlated server events. The default `steady` case paces chunks every 250 ms.
- `e2e/fixtures/voice-stream/`: frozen `closing-phrase-v1.mp3`, source text, and manifest. The manifest records 254,581 bytes, SHA-256 `888d4c1dae1ef1fadb3c850b5bf886bb6bb0833cdbb91e15713d5ebb899295fa`, 15.882 seconds, and the known closing phrase.
- `e2e/quiet-room.voice-stream-diagnostics.test.js`: Detox flow through the normal message voice button, including the playing-to-ended UI transition.
- `scripts/run-voice-stream-diagnostics.sh`: QA/local config check, native sync/build, fixture server startup on `0.0.0.0`, emulator address `10.0.2.2`, readiness probe, and cleanup trap.
- `scripts/check-voice-playback-capture.mjs`: VP9/Vorbis capture decoding, timestamp-preserving calibration, RMS-envelope alignment, local closing alignment, gain-normalized closing energy, and bounded classification.
- `scripts/collect-voice-stream-run.mjs`: run-manifest collection joining server and device logs by run/attempt ID.
- `tests/voicePlaybackDiagnostics.test.mjs` and `tests/voiceStreamFixtureServer.test.mjs`: seven diagnostics tests and nine fixture-server tests.
- `tests/voicePlaybackCaptureChecker.test.mjs` and `tests/voiceStreamRunCollector.test.mjs`: six capture-checker tests and two run-manifest collector tests.
- `package.json`: focused fixture/diagnostics test scripts and the Detox wrapper entry point.

## Luna review follow-through

The review identified that the published Detox command needed an explicit QA/local TrackPlayer build, that Android could not reach a loopback-only server, and that the test needed to assert the fixture source rather than silently falling back to live audio. The wrapper now verifies QA/local configuration, syncs/builds the selected variant, starts the server on `0.0.0.0`, probes it before Detox, and passes `10.0.2.2`; the client emits `source.asserted` and suppresses fixture fallback. The diagnostics path also includes privacy sanitization and stale-attempt lifecycle guards.

The review’s earlier evidence concern was addressed by retaining server logs, wall-time-correlated client events, run manifests, and emulator recordings. The diagnostic emitter records wall time for cross-process correlation and makes `attempt.finished` idempotent. The capture checker was calibrated with timestamp-preserving silence insertion, gain-normalized closing-energy scoring, and local closing alignment; its complete-file and deliberate-truncation controls now distinguish complete from missing-tail captures.

## Verification

Focused checks on the current implementation:

- `npm run typecheck` — passed.
- `npm run test:voice-playback-diagnostics` — passed, 7/7 tests.
- `npm run test:voice-fixture` — passed, 9/9 tests.
- `npm run test:voice-capture-checker` — passed, 6/6 tests.
- `npm run test:voice-run-collector` — passed, 2/2 tests.
- `git diff --check` — passed.
- Rebuilt Android QA/local TrackPlayer app — succeeded; 842 tasks, build successful in 20 seconds.

### First E2E attempt

Artifact directory: `artifacts/android.emu.release.2026-09-09 15-50-10Z/`.

Detox failed before voice playback with a 15.0-second visibility timeout (`detox.log:2164-2188`). The device log recorded an auth/network setup failure and no `QR_MOB_021_VOICE_DIAG` events for this attempt. This is a bootstrap/device-run failure, not a streaming or clipping result.

### Second E2E attempt

Artifact directory: `artifacts/android.emu.release.2026-09-09 15-53-27Z/`.

Detox reported `success: true` for `e2e/quiet-room.voice-stream-diagnostics.test.js` (`detox.log` report near the end of the file). The correlated diagnostic identifiers in the device log are:

- run: `run-mtua3hsk-icl1ci`
- attempt: `attempt-mtua3hsk-6t6eui`

That attempt reported QA/local, TrackPlayer `4.1.2`, fixture endpoint mode, and the allowed fixture source; completed setup, queue reset/add, and play; emitted loading/buffering/ready/playing state transitions; emitted first visible progress at about 2,871 ms (`position` about 0.11, `buffered` about 15.882, `duration` about 15.882); later reached `position` about 15.881; and emitted state-ended, queue-ended, and terminal cleanup at about 18,666 ms.

This proves that the diagnostic deep link was accepted and the selected TrackPlayer path reached native playback/queue termination with reported timing values, and that the Detox assertions passed. It does not prove that the server received the request, that the expected frozen bytes/hash or chunk schedule were delivered, that playback began before final delivery, that the closing phrase was audible, or that any clipping occurred or was fixed. The earlier artifact directory itself has no paired fixture-server log or audio capture; no root-cause, physical-device, production, or audible-completeness conclusion should be drawn from this run.

### Final paced E2E run

Artifacts:

- Detox/device output: `artifacts/android.emu.release.2026-09-09 21-17-44Z/`.
- Fixture server: `artifacts/qr-mob-021/20260909T211744Z-steady/fixture-server.log`.
- Emulator recording: `artifacts/qr-mob-021/final-paced-capture/emulator.webm` (75.01 seconds; VP9 video with Vorbis stereo 44.1 kHz audio).

Detox passed 1/1 for the default `steady` case. The correlated identifiers are run `run-mtulor80-5t55bm` and attempt `attempt-mtulor80-9bsp0x`. Wall-time correlation shows:

- Server GET: `21:18:33.257Z`; first chunk: `21:18:33.261Z`.
- App playing: `21:18:33.941Z`; first progress: `21:18:34.680Z`.
- Final chunk / normal EOF: `21:18:39.575Z` / `21:18:39.576Z`.
- Queue end: `21:18:49.771Z`; reset complete: `21:18:50.172Z`.
- Exactly one `attempt.finished`: `21:18:50.253Z`.

The run therefore demonstrates progressive startup before final delivery: app playing preceded normal EOF by 5.635 seconds. It also reached the full native duration/terminal cleanup path, with one idempotent attempt finish. The capture checker classified its recording as `complete` (alignment `0.8858`, closing `0.8374`).

### Additional capture-validated runs

The checker was run against the frozen reference and the recordings below. `align` is the full normalized envelope alignment score; `closing` is the locally aligned final-speech score after gain-normalized energy handling.

| Capture | Artifact | Classification | align | closing |
| --- | --- | --- | ---: | ---: |
| Complete-file control | `artifacts/qr-mob-021/complete-file-control-capture/emulator.webm` | `complete` | 0.8397 | 0.9750 |
| Deliberate truncation control | `artifacts/qr-mob-021/truncated-capture/emulator.webm` | `audible-tail-missing` | 0.7796 | 0.00333 |
| First steady capture | `artifacts/qr-mob-021/final-paced-capture/emulator.webm` | `complete` | 0.8858 | 0.8374 |
| Steady repeat | `artifacts/qr-mob-021/steady-repeat-capture/emulator.webm` | `complete` | 0.9748 | 0.9709 |
| Delayed tail 1500 ms | `artifacts/qr-mob-021/delayed-tail-1500-capture/emulator.webm` | `complete` | 0.9707 | 0.9652 |
| Delayed tail 250 ms | `artifacts/qr-mob-021/delayed-tail-250-capture/emulator.webm` | `complete` | 0.9766 | 0.9903 |
| Delayed tail 750 ms, first capture | `artifacts/qr-mob-021/delayed-tail-750-capture/emulator.webm` | `inconclusive` | 0.6425 | 0.9865 |
| Delayed tail 750 ms, repeat | `artifacts/qr-mob-021/delayed-tail-750-repeat-capture/emulator.webm` | `complete` | 0.8440 | 0.7794 |
| Chunk schedule A | `artifacts/qr-mob-021/chunk-schedule-a-capture/emulator.webm` | `complete` | 0.9546 | 0.9827 |
| Chunk schedule B, first capture | `artifacts/qr-mob-021/chunk-schedule-b-capture/emulator.webm` | `inconclusive` | 0.6503 | 0.9922 |
| Chunk schedule B, repeat | `artifacts/qr-mob-021/chunk-schedule-b-repeat-capture/emulator.webm` | `complete` | 0.9769 | 0.9960 |
| Normal EOF, immediate | `artifacts/qr-mob-021/normal-eof-immediate-capture/emulator.webm` | `complete` | 0.9868 | 0.9030 |
| Normal EOF, delayed | `artifacts/qr-mob-021/normal-eof-delayed-capture/emulator.webm` | `complete` | 0.8282 | 0.9876 |

The delayed-tail-1500 E2E passed 1/1. Its collected server/run manifest is `artifacts/qr-mob-021/20260909T212747Z-delayed-tail-1500/run-manifest.json`, with server log `artifacts/qr-mob-021/20260909T212747Z-delayed-tail-1500/fixture-server.log`, run `run-mtum0w5v-hmdqm9`, and attempt `attempt-mtum0w5v-ihyfa3`. The steady-repeat E2E also passed 1/1; its collected manifest is `artifacts/qr-mob-021/20260909T213019Z-steady/run-manifest.json` and its Detox artifact directory is `artifacts/android.emu.release.2026-09-09 21-30-20Z/`.

The six additional first-pass E2Es all passed 1/1 and have manifests under `artifacts/qr-mob-021/`: delayed-tail-250 (`20260909T213602Z-delayed-tail-250/run-manifest.json`), delayed-tail-750 (`20260909T213659Z-delayed-tail-750/run-manifest.json`), chunk-schedule-a (`20260909T213758Z-chunk-schedule-a/run-manifest.json`), chunk-schedule-b (`20260909T213856Z-chunk-schedule-b/run-manifest.json`), normal-eof-immediate (`20260909T213952Z-normal-eof-immediate/run-manifest.json`), and normal-eof-delayed (`20260909T214046Z-normal-eof-delayed/run-manifest.json`). The delayed-tail-750 and chunk-schedule-b first captures were capture-quality inconclusives, not E2E or playback failures; repeat E2Es also passed 1/1 and were complete under the checker using `20260909T214234Z-delayed-tail-750/run-manifest.json` and `20260909T214331Z-chunk-schedule-b/run-manifest.json`.

Every tested fixture delivery shape has at least one capture classified `complete` by the checker. Across two steady captures, delayed-tail-250/750/1500, both chunk schedules, and both normal-EOF variants, no clipping was reproduced in the tested emulator captures. This is representative one-pass-per-shape evidence with two repeats, not the plan’s full repetition counts; the two first-pass capture-quality inconclusives were resolved by repeat and were not treated as product failures. No live QA TTS or physical-device validation was run.

## Open evidence gaps and next actions

1. If statistical confidence is needed, repeat each delivery shape to the plan’s requested counts; the current matrix is representative one-pass-per-shape evidence with two repeats.
2. If investigation continues beyond the emulator fixture, validate live QA TTS behavior and a physical device separately; neither is covered by these results.
3. Keep the current conclusion bounded to the tested emulator fixture cases. Do not call it a product fix or infer the production root cause.
