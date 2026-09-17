# QR-MOB-021 TrackPlayer streaming progress

Status: detector v2, exact-byte replay, source-identity correlation, three fully recorded direct long replies, timing-v2 proxy evidence, and the bounded playback-lifecycle batch are present in the worktree. No realistic direct-path clipping failure or product fix is claimed.

## Worktree and baseline

- Worktree: `/Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-qr-mob-021-trackplayer-streaming-implementation`
- Branch: `codex/qr-mob-021-trackplayer-streaming-implementation`
- Implementation starting point: `15bbea006458eaef1543203b083e707777fa7d4e` (`Plan emulator investigation of TrackPlayer streaming tail clipping`).
- Plan-recorded base: `develop` at `a95b7f1ff7b91defe7a2d0c95958c237eefc38bb`; the local `develop` ref has since advanced to `6af628e150050c49515be1f2ff12f7247788beb0`.
- Plan file: `docs/qr-mob-021-trackplayer-streaming-plan.md` at the plan commit above. The tracker remains `QR-MOB-021 | In Progress` and now links this implementation evidence.

## Implemented in this checkout

- `src/lib/voicePlaybackDiagnostics.ts`: QA/local deep-link gate, fixture-source allowlisting, run/attempt IDs, monotonic timing, structured `QR_MOB_021_VOICE_DIAG` events, TrackPlayer version metadata, and field sanitization for credentials/private content.
- `src/components/MessageVoiceButton.tsx`: normal message-button path with diagnostic fixture routing, source assertion/fallback suppression, bounded source-identity hashing, TrackPlayer setup/reset/add/play/state/progress/queue-end/error/cleanup events, and stale-attempt guards.
- `scripts/voice-stream-fixture-server.mjs`: saved-message-shaped GET/HEAD fixture route, host-reachable binding, frozen MP3 manifest/hash, progressive cases (steady, delayed tails, chunk schedules, EOF variants), truncation negative control, range handling, and run/attempt-correlated server events. The default `steady` case paces chunks every 250 ms.
- `e2e/fixtures/voice-stream/`: frozen `closing-phrase-v1.mp3`, source text, and manifest. The manifest records 254,581 bytes, SHA-256 `888d4c1dae1ef1fadb3c850b5bf886bb6bb0833cdbb91e15713d5ebb899295fa`, 15.882 seconds, and the known closing phrase.
- `e2e/quiet-room.voice-stream-diagnostics.test.js`: Detox flow through the normal message voice button, including the playing-to-ended UI transition.
- `scripts/run-voice-stream-diagnostics.sh`: QA/local config check, native sync/build, fixture server startup on `0.0.0.0`, emulator address `10.0.2.2`, readiness probe, and cleanup trap.
- `scripts/check-voice-playback-capture.mjs`: VP9/Vorbis capture decoding, timestamp-preserving calibration, RMS-envelope alignment, local closing alignment, gain-normalized closing energy, and bounded classification.
- `scripts/collect-voice-stream-run.mjs`: run-manifest collection joining server and device logs by run/attempt ID, with retry request instances kept separate.
- `scripts/voice-stream-tee-proxy.mjs` and `scripts/run-voice-stream-live-qa-android.sh`: ephemeral local byte-preserving QA tee and real-QA emulator runner with explicit proxy readiness, emulator audio capture, and bounded cleanup.
- `e2e/quiet-room.voice-stream-live-qa.test.js`: fresh-chat, saved-message, real-QA-TTS short and long flows through the actual message voice button, with exact rendered-source evidence, phase timeouts, duration bands, recording synchronization, and post-terminal hold.
- `e2e/quiet-room.voice-lifecycle-batch.test.js`: retained-fixture replay/pause/ambient/message-switch coverage plus opt-in automatic Voice Mode coverage.
- `tests/voicePlaybackDiagnostics.test.mjs` and `tests/voiceStreamFixtureServer.test.mjs`: nine diagnostics tests and twelve fixture-server tests.
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

## Source completeness and normal emulator use (2026-09-10)

This round executes the plan section added on 2026-09-10 and supersedes the physical-device next step above. Work remained emulator-only. Luna subagents independently reviewed source recovery, Firestore correlation, source-identity instrumentation, tee timing, long-run and lifecycle harnesses, emulator inventory, exact-content test exposure, and the final diff; the primary agent integrated their work, reran evidence, and resolved review findings.

### Instrumentation and privacy boundary

- `MessageVoiceButton` emits a `source.identity` event only for QA/local `live-trace` and `live-proxy`: SHA-256 and Unicode character count for the exact source text, SHA-256 for the conversation identifier, and source slot. It makes no extra network request and emits no source text, identifier, token, or header value. Identity resolution is awaited before queueing so it cannot arrive after that attempt's terminal event; an identity failure emits `source.identity.unavailable` and aborts that diagnostic attempt instead of allowing it to be called source-correlated.
- `MessageBubble` exposes the exact assistant content through a test-only identifier. The Detox evidence file stores only hash/count/readability and whether the normalized text has the requested ending. The current harness treats a missing/unreadable ending as `source-inconclusive` rather than a complete run.
- The long runner separates setup, generation, playback, post-terminal, and timeout classifications. It records actual `Pause voice` to `Play voice` duration, labels target/short/long bands, waits for the runner's recording-start marker before tapping, and holds the terminal state for at least two seconds.
- The tee records monotonic upstream receipt, disk write submission/completion/wait, downstream write submission/completion/wait, backpressure, and event-log submission/completion. It records only forwarded/omitted/removed header names. `Content-Length` remains deliberately removed on the proxied response.

### Historical and fresh source completeness

Read-only lookup against QA Firestore recovered the historical 2026-09-09 saved assistant source at message index 1 selected by the retained GET. Its private content was not copied into committed artifacts. The bounded identity is 220 Unicode characters/bytes, SHA-256 `c5f3f5d6012cbb2f26f90d80144040ed6bdf8d9c669c6d9e4091a63b91d5ad4d`, and its normalized ending is `copper meadow nine` (phrase SHA-256 `9e1b6bf5f783b68df72bfad695e3cd5f184dc5d15a89745b30dfdf1cc4f55ced`). This establishes that the saved text supplied to the selected message contained the intended ending.

The historical AAC remains 136,189 bytes with SHA-256 `004e929896aba2bcf0c523fbaf3ceb82a33502e1c0fcaba8b9f53402d03a7548`; detector v2 previously classified its emulator rendering `complete` with ending correlation 0.9949. Only FFmpeg/FFprobe were available locally—no Whisper, Vosk, or speech model—so the actual words realized in the AAC were not independently transcribed. The generated-speech lexical check is therefore `inconclusive`; the rendering check establishes that the emulator retained the AAC ending, not what those samples say.

Read-only QA lookup also matched every fresh long-run app identity exactly and confirmed the normalized requested ending:

| Run | Saved source characters | Source SHA-256 | Ending present |
| --- | ---: | --- | --- |
| `run-mtvk7up0-hv4dtc` | 1,991 | `4e71b5d048e6d167ba36517d67038db28fbf42dd2508bf2123f361ed40e68120` | yes |
| `run-mtvki30s-pmb5v6` | 1,854 | `ceae43cd574b464d8dd84e56e9c9b1778642762fd847beab9c06766f98fbeb48` | yes |
| `run-mtvkn7zo-7ihszd` | 1,907 | `4a0036da9eb925a37e3dc0eace20ccaf8c00cfbafb8a5b3e2d2587963d002e26` | yes |
| `run-mtvks80y-6reze4` | 1,837 | `4f8410da4ad0c3d5dee5920b7130e78e5ea8b4cd2a7ba1ab987b12dc21fd12a9` | yes |

### Direct long-reply observations

Command shape: `VOICE_QA_LONG_REPLY=1 VOICE_QA_LONG_REPLY_ATTEMPTS=1 VOICE_DIAGNOSTIC_MODE=live-trace bash scripts/run-voice-stream-live-qa-android.sh`. Each invocation used the QA/qa TrackPlayer build on `Pixel34AVD_2` (API 34, arm64-v8a), one normal authenticated saved-message GET, a fresh synthetic conversation, phase-specific timeouts, and a two-second post-terminal hold.

| Evidence root | Run / attempt | Measured playback | Native result | Recording result |
| --- | --- | ---: | --- | --- |
| `artifacts/qr-mob-021/live-qa-20260910T132311Z/` | `run-mtvk7up0-hv4dtc` / `attempt-mtvk7up0-9xqyxd` | 127.442 s (`long`) | queue ended | timing only; the 180.010 s capture began before login and omitted about 49 s of playback |
| `artifacts/qr-mob-021/live-qa-20260910T133150Z/` | `run-mtvki30s-pmb5v6` / `attempt-mtvki30s-sqkq4y` | 116.296 s (`target`) | queue ended | full, 123.220 s, SHA-256 `d3928224580544816b14e6c30b6f0506ebf11f9e6240354f130b0e1aac6ae68f` |
| `artifacts/qr-mob-021/live-qa-20260910T133553Z/` | `run-mtvkn7zo-7ihszd` / `attempt-mtvkn7zo-ky37vm` | 115.220 s (`target`) | queue ended | full, 122.278 s, SHA-256 `30ae33113d0677724210d878fcb0f0575e1f941b4dc400130cc080c7b1550cef` |
| `artifacts/qr-mob-021/live-qa-20260910T133935Z/` | `run-mtvks80y-6reze4` / `attempt-mtvks810-enzijn` | 124.913 s (`long`) | queue ended | full, 131.750 s, SHA-256 `a9644081a71499ca042ef592dc984ead1ec4c84aebb5a6eb622f20b296a1186f` |

The requested deliverable of three fully captured direct observations is satisfied by the last three rows. Two are inside the 60–120 second target and one is 4.913 seconds above it; the out-of-band run is retained as such rather than silently counted in-band. All three reached native queue end and stayed terminal for two seconds. Direct mode intentionally retained no response bytes, so these recordings cannot establish byte-identical waveform completeness. The exact-content hook was rebuilt during this sequence: older UI evidence for the first three runs is not authoritative, while the app source-identity events and Firestore readback match exactly.

### Direct/proxy timing comparison

Command shape: `VOICE_DIAGNOSTIC_MODE=live-proxy VOICE_QA_TEE_PROXY_UPSTREAM=<QA voice base> bash scripts/run-voice-stream-live-qa-android.sh`; the comparison direct run used the same wrapper with `VOICE_DIAGNOSTIC_MODE=live-trace`. The secret upstream value came from the existing QA environment and is not recorded.

The short proxied comparison is under `artifacts/qr-mob-021/live-qa-20260910T180641Z/`, run `run-mtvuc1l9-mipopc`, attempt `attempt-mtvuc1l9-hiyzy6`. It reached native queue end after 28.367 seconds. The tee retained an HTTP 200 `audio/aac` response with 220,147 bytes, SHA-256 `601d2cc46767b97c8ef12b8bdeaef60741f88aa0bf6b84437a9ea135f64cd370`, 14 chunks, and normal upstream exhaustion. Upstream headers arrived at 4,432.855 ms; the first chunk was received at 4,434.657 ms, its disk write completed at 4,434.941 ms, and its downstream write completed at 4,435.586 ms. The last chunk receipt/disk/downstream completions were 5,015.210/5,017.357/5,017.501 ms and terminal logging completed at 5,018.828 ms. Maximum disk wait was 2.121 ms, maximum downstream wait 0.639 ms, and neither path reported backpressure.

Request header names forwarded were `accept-encoding`, `authorization`, and `user-agent`; local correlation, connection, host, and ICY metadata names were omitted. Response names forwarded were `cache-control`, `content-type`, and `vary`; AWS/CORS/TTS metadata names and `content-length` were omitted, with `content-length` explicitly removed. No values are stored.

The matching source-to-emulator checker used the exact retained bytes and `emulator.webm` (79,553,129 bytes, SHA-256 `91d2412f39e10a066dfdb35869250e72c2529ec64670c663815cb2a3dc949927`). It classified the overall result `inconclusive`: full alignment 0.7147 was below threshold at very low capture gain, while closing correlation was 0.9782 and ending correlation 0.9979 with full coverage and gain-normalized ending energy 0.9784. Per detector policy, low whole-capture correlation plus strong ending evidence remains inconclusive rather than being promoted to complete.

The separate short direct run is under `artifacts/qr-mob-021/live-qa-20260910T180915Z/`, run `run-mtvufaec-c5dgj7`, attempt `attempt-mtvufaed-ve3md9`; it reached queue end after 29.903 seconds. Native queue-add to playing was 3.754 seconds direct versus 5.543 seconds proxied. The requests generated different source lengths (405 versus 352 characters), and direct mode has no upstream-receipt timestamp, so the 1.789-second difference does not isolate proxy overhead or establish causation.

A long proxy run under `artifacts/qr-mob-021/live-qa-20260910T180400Z/` failed before playback with `android-io-network-connection-timeout`. Four separate tee requests each closed near eight seconds with zero bytes/status because the QA TTS upstream had not returned headers; the upstream then reported connection reset. This is a meaningful direct/proxy difference and an existing proxy-path slow-first-byte limitation, not evidence that the direct TrackPlayer path clips final speech.

### Playback lifecycle batch

`e2e/quiet-room.voice-lifecycle-batch.test.js` uses the retained `steady` fixture through the normal message button. Start `node scripts/voice-stream-fixture-server.mjs --host 0.0.0.0 --port 8787`, then run `QR_MOB_021_LIFECYCLE_AUTO=1 VOICE_FIXTURE_BASE_URL=http://10.0.2.2:8787 VOICE_FIXTURE_CASE=steady DETOX_AVD_NAME=Pixel34AVD_2 bash scripts/with-mobile-env.sh qa qa npx detox test -c android.emu.release e2e/quiet-room.voice-lifecycle-batch.test.js`. The consolidated run is `artifacts/qr-mob-021/lifecycle-final-20260910T132100Z/`; it executes two attempts each for uninterrupted playback plus replay, deliberate pause/restart, ambient enable/disable while voice remains active, and switching ownership from one assistant message to another. With `QR_MOB_021_LIFECYCLE_AUTO=1`, it also executes three completed QA replies in automatic Voice Mode without tapping their voice buttons. Deliberate pause is recorded as an expected restart action, not an unexpected interruption. Earlier single-pass and focused rerun artifacts remain under `lifecycle-20260910T134355Z`, `lifecycle-auto-20260910T135110Z`, and `lifecycle-ambient-20260910T132000Z`.

### Optional second Android image

The host has `QuietRoom_Play_API35` and `Galaxy_S22_Plus` definitions and API 35 system-image directories, although `avdmanager list` reported the image as missing for those definitions. Normal, headless, and read-only launch attempts exited before producing an ADB-ready device; logs are under `artifacts/qr-mob-021/api35-emulator/`. No application test ran on those AVDs and no API 35 result is inferred. The working primary emulator remained API 34. The optional image check is recorded as blocked by emulator readiness rather than expanded into AVD repair.

### Current conclusion

The saved source text was complete in the historical lookup and all four fresh direct observations. The normal direct path completed three fully recorded long playbacks without a native error or early terminal transition. The retained proxy source has strong captured-tail correspondence but an intentionally inconclusive whole-recording classification, and its spoken lexical content was not independently transcribed. Lifecycle cases completed at their planned bounded counts. No realistic missing-ending failure was captured, so no playback behavior, player, cleanup delay, or transport was changed as a product fix. No physical-device test, merge, push, deployment, or release was performed.

### Final verification for this section

- Consolidated lifecycle Detox: 5/5 tests passed in 592.894 seconds. Those five tests contain the planned 2/2 retained/replay, 2/2 deliberate pause/restart, 2/2 ambient, 2/2 message-switch, and three-reply autoplay loops. Status file: `artifacts/qr-mob-021/lifecycle-final-20260910T132100Z/status.txt` = `0`.
- `npm run typecheck` — passed.
- `npm run test:voice-playback-diagnostics` — passed, 9/9.
- `npm run test:voice-tee` — passed, 2/2.
- `npm run test:voice-fixture` — passed, 12/12.
- `npm run test:voice-capture-checker` — passed, 8/8.
- `npm run test:voice-run-collector` — passed, 3/3.
- `npm run test:ambient-audio` — passed, 5/5.
- JavaScript syntax checks for both changed E2Es and shell syntax for the live runner — passed.
- Final Android QA/qa TrackPlayer Detox build — passed: 842 tasks, 22 executed, 820 up-to-date; `BUILD SUCCESSFUL in 11s`.
- `git diff --check` — passed before final commit.

## Spoken endings and genuine live-QA autoplay (2026-09-10)

This round executes the plan entry added after `8812601`. Work stayed on the emulator and used Luna subagents for bounded ASR, source readback, native dependency inspection, API 35 follow-up, and independent review. The primary agent integrated and verified the returned evidence. No playback behavior, dependency, cloud data, physical device, deployment, merge, push, or release was changed.

### Local spoken-content workflow

An ignored Python 3.12.13 environment under `.local/qr-mob-021-asr/` runs `faster-whisper==1.1.1` locally; audio was not uploaded. The reproducible command shape is `.local/qr-mob-021-asr/venv/bin/python .local/qr-mob-021-asr/transcribe.py <local-media> <ignored-json> --model <model> --language en --beam-size 5`. Both passes use CPU `int8`, task `transcribe`, beam/best-of 5, temperature 0, previous-text conditioning enabled, VAD disabled, and no prompt or vocabulary hint. The independent models are:

- `base.en`, `Systran/faster-whisper-base.en` revision `3d3d5dee26484f91867d81cb899cfcf72b96be6c`.
- `small.en`, `Systran/faster-whisper-small.en` revision `d1d751a5f8271d482d14ca55e9d2deeebbae577f`.

The intact synthetic control, SHA-256 `888d4c1dae1ef1fadb3c850b5bf886bb6bb0833cdbb91e15713d5ebb899295fa`, was complete in both passes. A copy with the whole final phrase silenced while retaining trailing silence, SHA-256 `706f94cfd98f3c3124c862935470b3a4c9d5d20f3a7d4e7f1bfee8b7c3b2de56`, and a copy with the final 750 ms silenced, SHA-256 `4fa4d1150da6b41cacd9e229bee1accc687817ef8383e97938b8695d695151ab`, were both classified `audible-tail-missing`. The recognizers therefore did not supply the requested ending when known final speech was absent.

| Existing sample | Source/AAC or recording identity | Local recognition result | Bounded classification |
| --- | --- | --- | --- |
| Historical retained AAC | AAC `004e929896aba2bcf0c523fbaf3ceb82a33502e1c0fcaba8b9f53402d03a7548`; saved text ending present | Both models recovered the ending semantically; `small.en` rendered the final number as a digit. Prior waveform ending correlation was 0.9949. | `complete` |
| Short retained proxy AAC | AAC `601d2cc46767b97c8ef12b8bdeaef60741f88aa0bf6b84437a9ea135f64cd370`; saved text ending present | Both models produced an ambiguous phonetic ending; prior waveform result remains overall inconclusive despite closing/ending correlations 0.9782/0.9979. | `inconclusive` |
| Direct `133150Z` | recording `d3928224580544816b14e6c30b6f0506ebf11f9e6240354f130b0e1aac6ae68f`; saved source `ceae43cd574b464d8dd84e56e9c9b1778642762fd847beab9c06766f98fbeb48` | Both models omitted the expected ending in the full recording and an independent final-20-second crop. | `inconclusive`; no direct source bytes |
| Direct `133553Z` | recording `30ae33113d0677724210d878fcb0f0575e1f941b4dc400130cc080c7b1550cef`; saved source `4a0036da9eb925a37e3dc0eace20ccaf8c00cfbafb8a5b3e2d2587963d002e26` | Both models omitted the expected ending in both passes. | `inconclusive`; no direct source bytes |
| Direct `133935Z` | recording `a9644081a71499ca042ef592dc984ead1ec4c84aebb5a6eb622f20b296a1186f`; saved source `4f8410da4ad0c3d5dee5920b7130e78e5ea8b4cd2a7ba1ab987b12dc21fd12a9` | Both models omitted the expected ending in both passes. | `inconclusive`; no direct source bytes |

Raw transcripts, derived crops, models, and summaries remain ignored. The shareable conclusion is deliberately bounded: repeated recognition absence is relevant evidence, but without the exact direct response bytes it cannot distinguish TTS generation loss from transport or emulator rendering loss.

### Three genuine live-QA autoplay attempts

The live harness now has an explicit `VOICE_QA_AUTOPLAY=1` mode. It requires `VOICE_QA_LONG_REPLY=1` and `VOICE_DIAGNOSTIC_MODE=live-trace`, rejects fixture variables, enables Voice Mode before sending the prompt, starts emulator audio recording before prompt submission, observes automatic playback without tapping the voice button, and records reply completion, source identity, native lifecycle, duration, cleanup, ownership release, and the final state. Manual live-trace and proxy modes keep their previous tap behavior. A strict collector produces `live-autoplay-evidence.json`; `tests/voiceAutoplayEvidence.test.mjs` covers correlation, fixture rejection, and Detox `device.log` discovery.

Two DNS/login setup failures (`live-qa-20260911T021433Z` and `live-qa-20260911T021709Z`) and one user-interrupted setup (`live-qa-20260910T185732Z`) had no qualifying playback and are excluded. After restarting only `Pixel34AVD_2`, the three qualifying invocations used `VOICE_QA_SKIP_BUILD=1 VOICE_DIAGNOSTIC_MODE=live-trace VOICE_QA_LONG_REPLY=1 VOICE_QA_AUTOPLAY=1 VOICE_QA_LONG_REPLY_ATTEMPTS=1 ANDROID_SERIAL=emulator-15364 DETOX_AVD_NAME=Pixel34AVD_2 bash scripts/run-voice-stream-live-qa-android.sh`.

| Evidence root | Run / attempt | Authoritative saved source | Playback / native result | Emulator recording | ASR ending assessment |
| --- | --- | --- | --- | --- | --- |
| `live-qa-20260911T022032Z` | `run-mtwbyfct-v09yto` / `attempt-mtwbyfct-axc1yr` | 1,865 code points / 1,872 bytes; `13a3ddd146503d36f9b0ae121eee477a6db2cf095246cbb06f891c107731d4b7`; ending present | 118.785 s (`target`); queue end at 120.241 s; cleanup/release; 2.001 s hold | 152.879 s; 84,785,819 bytes; `e30a7d846eafb766514ca9b343fc924ec3c900cbe659e0de4b527de598984e7f` | Both models omitted the ending in full and final-20-second passes; `inconclusive` |
| `live-qa-20260911T022506Z` | `run-mtwc4gp8-8sx6be` / `attempt-mtwc4gp8-nissnl` | 2,028 code points / 2,054 bytes; `d4d31a6c215141b7972ab23b451ff669601518c08349baa7b5cd05e806d2c4eb`; ending present | 121.926 s (`long` by 1.926 s); queue end at 123.868 s; cleanup/release; 2.001 s hold | 151.402 s; 87,507,396 bytes; `74a7f2697cf7af49b33b6c1e42138d1f7171268915351fd93da89e7dc3ba0328` | Both models omitted the ending in both passes; `inconclusive` |
| `live-qa-20260911T023010Z` | `run-mtwcar0k-simjvz` / `attempt-mtwcar0k-xhojoq` | 1,973 code points / 1,985 bytes; `cfaff864369c48a42f466e2a8d83a8abf03d84a902bb24c1f9508ee7ec0147d7`; ending present | 121.100 s (`long` by 1.100 s); queue end at 123.181 s; cleanup/release; 2.002 s hold | 151.400 s; 79,382,519 bytes; `0c26e17fa50b74c3619cfd85ff71300c25fb9e98301b1a5a2c0cd8714ff277a2` | Both models omitted the ending in both passes; `inconclusive` |

All three strict collectors passed with exactly one matching native/UI attempt: live endpoint, no fixture routing, source assertion and identity present, reply completion recorded, native lifecycle and durations present, Voice Mode enabled before reply, recording started before prompt, automatic playback observed, and zero button taps. Read-only QA readback matched every native `source.identity` hash/count/slot and confirmed the requested ending. The screen accessibility hash also matched on the first attempt; the other two differed by two and four rendered characters because inline Markdown markers are removed from nested rendered text. The native hash is the exact `message.content` passed to `MessageVoiceButton` and is authoritative; future UI evidence now labels itself `rendered-accessibility-text` and explicitly non-comparable to the playback-source identity.

The final-20-second crop hashes are `eb53f224b06634971d7e3aa47a77c4a11ba919951d232643384a29015433a113`, `7fc2030821f32ca08b10913a30fe9d1cca9ffb42bdd1ca68786b94afd1c421f4`, and `8a99fc72e36495ccac187b607428ff41f72495bc14a0ff60399c764a6a44085b`. The three observations are not clean audible-completeness passes: both validated recognizers omit the saved ending while native playback reaches queue end. They remain `inconclusive` because no exact bytes from those direct requests were retained.

### Smallest normal-path byte-capture proposal

Installed `react-native-track-player` 4.1.2 uses KotlinAudio 2.1.0 and legacy ExoPlayer 2.19.0 for this path; the unrelated Media3 1.8 transitive dependency is not the active player. The direct URL and authentication headers enter KotlinAudio's binary AAR, where `BaseAudioPlayer.getMediaSourceFromAudioItem` constructs a `DefaultHttpDataSource.Factory` and `ProgressiveMediaSource`. There is no public data-source-factory injection point, and the player/ExoPlayer members needed for an external listener are private/final; a transfer listener would provide counts/timing, not retained bytes.

The smallest viable diagnostic is therefore a QA-only KotlinAudio fork/AAR patch that wraps the existing `DefaultHttpDataSource` in a capturing `DataSource`. It would forward the same direct request, headers, streaming reads, retries, exceptions, and cancellation while writing each request/retry to a separate ignored file and recording only byte count/hash, completion/error/cancellation, and timing. It must be gated to QA diagnostics, avoid URLs/tokens, sit before any future cache, and first prove unchanged progressive startup and acceptable overhead against a known fixture. This is a material dependency fork with build and maintenance cost, not a small application hook. Per the plan's scope boundary it is documented here and was not implemented without explicit expansion.

### API 35 representative follow-up

The earlier handshake warning was not an absent-image result. A controlled read-only launch of `QuietRoom_Play_API35` on explicit port 5584 reached ADB readiness, and a representative attached-device run under `artifacts/qr-mob-021/api35-emulator-followup/representative-20260911T024005Z/` passed on `emulator-5584` (API 35, arm64-v8a). Detox delivered the frozen 254,581-byte fixture in 26 chunks with normal EOF; TrackPlayer traversed loading, buffering, ready, playing, and ended, then reported queue end at 15.886 seconds. The 33.782-second screen/audio capture is 22,114,247 bytes, SHA-256 `c0797ad62eccf78cadad2abaef5f027d3d80d56b0d25c16f61f00933efe044cc`.

The reproducible comparison command is `node scripts/check-voice-playback-capture.mjs --reference e2e/fixtures/voice-stream/closing-phrase-v1.mp3 --capture artifacts/qr-mob-021/api35-emulator-followup/representative-20260911T024005Z/api35-fixture-screen-audio.webm --manifest e2e/fixtures/voice-stream/manifest.json`. It classified the API 35 capture `complete`: full alignment 0.9664, closing correlation 0.9719, ending correlation 0.9669, and full coverage. Both local recognizers recovered the synthetic ending semantically, rendering the final number as `7`. A generic collector initially described the first connected ADB device (API 34); the attached-device Detox log proves assignment to `emulator-5584`, and `fixture-run-manifest.api35-corrected.json` records the corrected identity. Only the API 35 emulator started for this check was stopped; the primary API 34 emulator remained running.

### Verification and stopping boundary

- Three qualifying live-QA autoplay Detox invocations passed; each strict evidence collector passed.
- API 35 representative retained-fixture Detox and audio capture — passed; waveform classification `complete`.
- `npm run test:voice-autoplay-evidence` — passed, 4/4, including exclusion of later device logs when an earlier run is recollected.
- `npm run typecheck` — passed.
- Existing focused suites passed: playback diagnostics 9/9, tee 2/2, fixture 12/12, capture checker 8/8, run collector 3/3, ambient audio 5/5.
- Syntax checks for the changed E2E and runner and `git diff --check` — passed.

The relevant missing spoken ending is repeatable in local recognition across all three earlier direct recordings and all three genuine autoplay recordings, but the evidence still cannot locate the loss among TTS generation, direct transport, and rendering. The matrix stops at the requested three autoplay attempts. Native response-byte capture is the next discriminating experiment and requires explicit approval for the dependency fork described above. Physical-device testing remains a separately discussed last resort.

## 2026-09-17 QA-only native response-byte capture

The user approved the dependency-fork experiment described above. Work remained isolated on `codex/qr-mob-021-trackplayer-streaming-implementation`; no physical device, backend mutation, deployment, merge, push, or release was used.

### Implementation and privacy boundary

- `vendor/kotlinaudio-2.1.0/` is a source vendoring of KotlinAudio `v2.1.0` at upstream commit `bf71120704bfe4be2311cf86fc1e2ee1c3c702b7`, with the upstream Apache-2.0 license retained. The only functional fork is the opt-in native HTTP capture.
- `patches/react-native-track-player+4.1.2.patch` selects the local project only when `QR_MOB_021_NATIVE_CAPTURE=true`. Gradle dependency readback without the property selected `com.github.doublesymmetry:kotlinaudio:v2.1.0`; with the property it selected `project :qrMob021KotlinAudio`.
- `scripts/patch-android-gradle.js` idempotently registers the local project in generated `android/settings.gradle`. The fixture/live runners pass the matching `EXPO_PUBLIC_QR_MOB_021_NATIVE_CAPTURE=1` and Gradle property only for requested diagnostic builds.
- `NativeHttpCapture.kt` wraps the actual ExoPlayer `DataSource` before any cache. Each `open()` gets a separate body/metadata record. Four internal correlation headers are removed before the upstream request. Capture records include only bounded run/attempt/endpoint identity, request position/length/sequence, byte count/hash, EOF/error/cancellation state, monotonic timing, capture-write timing, response-header names, and a bounded body filename. They exclude URI, query, authentication/header values, prompt, assistant text, messages, and transcript.
- `scripts/collect-native-trackplayer-capture.mjs` pulls only the exact correlated app-scoped directory, rehashes every body, rejects privacy-unsafe keys and correlation mismatch, detects duplicate sequences/gaps/conflicts, and reconstructs ranges without overwriting conflicting bytes. A completed position-zero request, or an independently expected fixture SHA, is required for `direct` comparison.
- `.detoxrc.js` now uses app-scoped Android test build tasks. The earlier root-level `assembleAndroidTest` attempted instrumentation APKs for every library and exhausted D8 memory after adding the local library; app-scoped tasks produced the same Detox app/test APKs without that unrelated packaging work.

Operational caveats from the independent Luna audit: the JavaScript gate is compiled into the bundle, so `VOICE_QA_SKIP_BUILD=1` must reuse an APK built with the same capture-mode value; changing the runner environment alone cannot change a prebuilt bundle. Also, a fresh generated Android tree must run the normal native sync/patch step before a capture-enabled build so `:qrMob021KotlinAudio` is registered in `android/settings.gradle`. The checked run used a freshly synced capture-enabled build before its build-skipped live invocation.

### Known-fixture validation

Command shape: `VOICE_NATIVE_CAPTURE=1 VOICE_FIXTURE_CASE=steady bash scripts/with-mobile-env.sh qa local bash scripts/run-voice-stream-diagnostics.sh`.

Evidence root: `artifacts/qr-mob-021/20260917T151522Z-steady/`.

| Check | Result |
| --- | --- |
| Detox | passed |
| Correlation | run `run-mu5oa1mx-81yazx`, attempt `attempt-mu5oa1mx-dp64ey`, one request |
| Captured source | 254,581 bytes, SHA-256 `888d4c1dae1ef1fadb3c850b5bf886bb6bb0833cdbb91e15713d5ebb899295fa` |
| Exact fixture comparison | matched expected byte count and SHA; zero gaps/conflicts/capture errors |
| Streaming | fixture server sent 26 chunks over 6.304 seconds and recorded normal EOF |
| Native terminal | `closed-before-eof`; ExoPlayer consumed all known bytes but made no extra EOF read |
| Capture overhead | 16,949,930 ns total synchronous writes; 7,769,209 ns maximum write |
| Classification | `direct`, based on the independent expected fixture SHA |

The native terminal wording is not treated as completion by itself. Exact equality to the independently known fixture plus server normal EOF proves completeness for this control.

### One live-QA autoplay sample

Setup attempts that failed before authenticated QA use generated no conversation, TTS request, or native capture and are excluded. The sole TTS/autoplay sample used the normal authenticated `live-trace` endpoint and evidence root `artifacts/qr-mob-021/live-qa-20260917T193055Z/`.

| Check | Result |
| --- | --- |
| Detox / evidence collector | passed; `detox_status=0`, strict autoplay and native collectors passed |
| Correlation | run `run-mu5xei7u-ndfltn`, attempt `attempt-mu5xei7u-pg7y9b`; one native request at position 0 |
| Saved source | 1,963 rendered characters; requested final phrase present; playback-source SHA `342df5d6d02a42ab4259a636531f1dd3a7a6481fb295c9e63f21b516002226a3` |
| Native source | 1,142,871-byte AAC LC mono 24 kHz; SHA-256 `e3c3ab89c7b0e12a46bad296667c8462d9eb16580d86505f4d74a9481ac22920` |
| Native transport | one GET, real EOF observed, zero gaps/conflicts/errors, `direct` classification |
| Progressive timing | first byte about `19:31:58.060Z`; playback state `playing` at `19:31:58.458Z`; final byte about `19:33:00.595Z`, approximately 62.1 seconds after playback began |
| Playback terminal | queue end at position 121.908 seconds; cleanup/reset, ownership release, and post-terminal evidence completed |
| Emulator recording | 97,807,976-byte WebM; SHA-256 `107f333ebccfc4681c5a1a9a71a802a240f53381c0d12404f989d8db3daab639`; 145.488-second container |
| Capture overhead | 40,885,713 ns total synchronous writes; 1,752,375 ns maximum write over about 62.5 seconds of native receipt |

FFmpeg decoded the raw AAC to 121.899 seconds; its initial `ffprobe` duration estimate of 115.430 seconds was bitrate-based and explicitly warned that it may be inaccurate. The decoded duration agrees with TrackPlayer's 121.864-second duration and queue end.

The exact native source was then compared with the same emulator recording using checker v2. `native-source-vs-emulator-check.json` classified `complete`: alignment `0.8982796`, closing `0.9962911`, ending `0.9900167`, and full closing/ending coverage. The final-speech interval was derived locally from the exact source with FFmpeg silence detection and used only to place the waveform windows; the classifier still compares the captured waveform to the native bytes.

The isolated `faster-whisper==1.1.1` workflow was rerun on full source/full recording and independent final-20-second crops with `base.en` and `small.en`, using the already documented no-prompt CPU/int8 settings. Both recognizers recover the requested ending semantically in all four views. Raw transcripts remain ignored local artifacts.

### Verification and interpretation

- `npm run test:voice-native-capture` — 4/4 passed.
- `npm run test:voice-playback-diagnostics` — 10/10 passed.
- `npm run test:voice-autoplay-evidence` — 4/4 passed.
- `npm run typecheck` — passed.
- `ORG_GRADLE_PROJECT_QR_MOB_021_NATIVE_CAPTURE=true ./android/gradlew -p android :qrMob021KotlinAudio:testDebugUnitTest --no-daemon` — passed.
- Capture-enabled `:app:assembleDebug` and app-scoped release Detox build — passed.
- `git diff --check` — passed.

For this exact live sample, the saved text contained the ending, the native direct response contained spoken ending audio and reached EOF, and the emulator recording retained that same ending. This closes the generation/transport/rendering ambiguity for this attempt. It does not reproduce or disprove an intermittent field failure, and it does not justify a product playback change. Retain the QA-only capture for a future failing attempt; do not select a fix until native source versus rendered output differs in a captured failure.
