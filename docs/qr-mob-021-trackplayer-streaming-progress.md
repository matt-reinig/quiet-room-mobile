# QR-MOB-021 TrackPlayer streaming progress

Status: detector v2, direct/proxied live tracing, one exact-byte QA TTS capture, and exact-byte replay evidence are present in the worktree. No realistic clipping failure or product fix is claimed.

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
- `scripts/collect-voice-stream-run.mjs`: run-manifest collection joining server and device logs by run/attempt ID, with retry request instances kept separate.
- `scripts/voice-stream-tee-proxy.mjs` and `scripts/run-voice-stream-live-qa-android.sh`: ephemeral local byte-preserving QA tee and real-QA emulator runner with explicit proxy readiness, emulator audio capture, and bounded cleanup.
- `e2e/quiet-room.voice-stream-live-qa.test.js`: a fresh-chat, saved-message, real-QA-TTS flow through the actual message voice button.
- `tests/voicePlaybackDiagnostics.test.mjs` and `tests/voiceStreamFixtureServer.test.mjs`: eight diagnostics tests and twelve fixture-server tests.
- `tests/voicePlaybackCaptureChecker.test.mjs`, `tests/voiceStreamRunCollector.test.mjs`, and `tests/voiceStreamTeeProxy.test.mjs`: eight capture-checker tests, three run-manifest collector tests, and two tee tests.
- `package.json`: focused fixture/diagnostics test scripts and the Detox wrapper entry point.

## Luna review follow-through

The review identified that the published Detox command needed an explicit QA/local TrackPlayer build, that Android could not reach a loopback-only server, and that the test needed to assert the fixture source rather than silently falling back to live audio. The wrapper now verifies QA/local configuration, syncs/builds the selected variant, starts the server on `0.0.0.0`, probes it before Detox, and passes `10.0.2.2`; the client emits `source.asserted` and suppresses fixture fallback. The diagnostics path also includes privacy sanitization and stale-attempt lifecycle guards.

The review’s earlier evidence concern was addressed by retaining server logs, wall-time-correlated client events, run manifests, and emulator recordings. The diagnostic emitter records wall time for cross-process correlation and makes `attempt.finished` idempotent. The capture checker was calibrated with timestamp-preserving silence insertion, gain-normalized closing-energy scoring, and local closing alignment; its complete-file and deliberate-truncation controls now distinguish complete from missing-tail captures.

## Verification

Focused checks on the current implementation:

- `npm run typecheck` — passed.
- `npm run test:voice-playback-diagnostics` — passed, 8/8 tests.
- `npm run test:voice-fixture` — passed, 12/12 tests.
- `npm run test:voice-capture-checker` — passed, 8/8 tests.
- `npm run test:voice-run-collector` — passed, 3/3 tests.
- `npm run test:voice-tee` — passed, 2/2 tests.
- `npm run test:ambient-audio` — passed, 5/5 tests.
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

### Emulator-first handoff work (2026-09-09)

- Detector v2 adds a 750 ms ending segment with a 120 ms local alignment window. Deterministic 8 kHz mono controls retain the full capture and two seconds of trailing silence. Legacy → revised results were: intact `complete` → `complete` (ending `0.9817`); final-word removal `complete` → `audible-tail-missing` (`0.6846`); 250 ms loss `complete` → `audible-tail-missing` (`0.7957`); 500 ms loss `complete` → `audible-tail-missing` (`0.5573`); and 750 ms loss `audible-tail-missing` → `audible-tail-missing` (`0.0807`). Gain/alignment variants remain complete.
- All retained fixture recordings were rechecked. Only `delayed-tail-750-repeat-capture` changed: legacy `complete` → revised `inconclusive` because ending correlation was `0.5669` while gain-normalized ending energy remained `0.9968`. A low-correlation/high-energy ending is intentionally ambiguous; it is not labeled missing.
- Diagnostics now has three explicit QA/local-only modes: `fixture`, direct `live-trace`, and allowlisted-local `live-proxy`. Direct live trace leaves source selection untouched. Proxy mode changes only the voice endpoint, retains the authenticated saved-message GET and resolved engine, and attaches bounded local run/attempt headers that the tee strips before forwarding. Lifecycle traces cover endpoint mode, progress/buffering, terminal/cleanup, ownership, audio session, and ambient duck transitions without private text or tokens.
- The tee integration tests prove exact bytes, progressive first-byte forwarding, privacy redaction, correlation-header stripping, upstream exhaustion, and client cancellation. No second TTS request or backend deployment was used.
- The live runner waits for an explicit tee-listening marker before launching Detox. Diagnostic failure logs emit only a bounded error name, rather than a raw native error that could contain a source URI.

### One real QA TTS capture

- Command: `VOICE_DIAGNOSTIC_MODE=live-proxy VOICE_QA_TEE_PROXY_UPSTREAM=<QA voice base> VOICE_QA_SCREEN_TIME_LIMIT=180 bash scripts/run-voice-stream-live-qa-android.sh`.
- QA/qa Android build succeeded: 842 tasks, 34 executed, 808 up-to-date. Detox passed 1/1 on `Pixel34AVD_2` using a fresh test-account chat and a synthetic response requested to end in `copper meadow nine`.
- Evidence root: `artifacts/qr-mob-021/live-qa-20260909T225042Z/`; Detox device artifacts: `artifacts/android.emu.release.2026-09-09 22-50-58Z/`.
- The evidence manifest records the then-current HEAD `c9984bb185ff806d40d51245d97236c39da49d31` with `dirty: true`; the capture was intentionally made from the implementation worktree before its final commit. The final commit therefore postdates the recording, while the recorded worktree state and artifacts remain locally auditable.
- Correlation: run `run-mtup1gvq-pw51n0`, attempt `attempt-mtup1gvq-gfrtbg`.
- Exact QA response: AAC mono 24 kHz, decoded 14.464 seconds, 136,189 bytes, SHA-256 `004e929896aba2bcf0c523fbaf3ceb82a33502e1c0fcaba8b9f53402d03a7548`. Tee: nine chunks, status 200 `audio/aac`, request `22:52:24.936Z`, first retained chunk `22:52:29.505Z`, final chunk/HTTP exhaustion `22:52:29.593Z`/`22:52:29.594Z`.
- Native `playing` was `22:52:29.399Z`; queue end was `22:52:44.248Z` at position `14.468`. The apparent 195 ms lead over proxy EOF is within cross-process clock and write-callback uncertainty, so it is not treated as strong proof of live progressive startup.
- Emulator recording: 58,584,237 bytes, SHA-256 `382ee0ef6d32f9f00ce02e04b08c271ebc5465e10bcd3d0552fd6358598aff20`. Detector v2: `complete`, alignment `0.9932`, closing `0.9898`, ending `0.9949`.
- The closing words were requested by the synthetic prompt but were not independently transcribed or checked by a physical listener; the detector proves the retained ending segment is present relative to the captured source, not its lexical content. Raw Detox logs can include that synthetic prompt and remain ignored local artifacts; the tee and structured diagnostic logs exclude prompts, assistant text, query values, tokens, and conversation identifiers.

### Exact-byte replay

| Replay | Run | Delivery / native result | Detector v2 |
| --- | --- | --- | --- |
| Complete file | `run-mtup92ec-ucypoj` | 136,189 bytes, normal EOF; playing 689 ms after EOF; queue end | `complete`, ending `0.9889` |
| Recorded nine-chunk schedule | `run-mtupb0h3-mx6k14` | 136,189 bytes in 107 ms, normal EOF; playing 1.064 s after EOF; queue end | `complete`, ending `0.9860` |
| Near-buffer stress, first | `run-mtupnyw0-6nks9o` | final 50,000 bytes at 9.027 s; playing 8.155 s before server EOF; queue end | capture `inconclusive` from full alignment `0.7446`, ending present `0.9958` |
| Near-buffer stress, repeat | `run-mtupqpiy-h6ooop` | final 50,000 bytes at 9.030 s; playing 7.838 s before server EOF; queue end | `complete`, alignment `0.9574`, ending `0.99995` |

The seven-second stress held 50,000 tail bytes. The last client poll clearly before the final release reported position `6.820` and buffered `8.959` at `23:10:02.745Z`, 1.238 seconds before server EOF, leaving 2.139 seconds of reserve at that poll. This bounds final receipt to roughly the last one-to-two seconds of the buffer despite cross-process timestamp uncertainty. An eight-second hold crossed the native idle timeout: four distinct requests each cancelled at about 10.53–10.54 seconds with 131,072/136,189 bytes written per request. The collector now reports retries as separate request instances instead of aggregating their chunk counts. This is a deliberate transport stress, not a field reproduction.

### Current boundary

No realistic live or replay emulator capture lost the ending. The exact QA bytes, complete replay, recorded-timing replay, and repeat near-buffer replay all retained it. No fix was selected because the plan requires a captured relevant failure first. Backend provider-internal exhaustion remains unverified because the current backend `finally` marker cannot distinguish it; the tee does prove the HTTP response ended normally at the proxy. Physical-device/output-route applicability remains separately pending as the plan’s last resort. Nothing was pushed, merged, deployed, or released.

Next: review this bounded emulator result with the user before considering one targeted physical-device capture. If statistical confidence is needed independently, repeat the requested matrix counts; do not infer root cause from the eight-second idle-timeout stress.
