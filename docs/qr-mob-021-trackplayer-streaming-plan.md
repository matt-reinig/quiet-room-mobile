# QR-MOB-021: TrackPlayer streaming tail investigation

Status: Implementation in progress; deterministic Android harness and initial controls validated.
Date: 2026-09-07
Branch: `codex/qr-mob-021-trackplayer-streaming-plan`
Base: `develop` at `a95b7f1ff7b91defe7a2d0c95958c237eefc38bb`

## Goal and user constraints

Reproduce and fix voice playback losing the last few words while preserving playback that starts before TTS generation finishes. Make the primary investigation repeatable from an Android emulator, without requiring the user to listen to every attempt or repeatedly install phone builds.

The user reports that completed-file playback does not clip but requires waiting for all audio. Keep completed-file playback as a diagnostic control, not the proposed product solution. The user believes both installed QA and production apps use TrackPlayer; investigate TrackPlayer first and verify the actual runtime engine rather than inferring deployed behavior from branch defaults. Replay consistency is currently unknown.

This is an investigation plan, not a claim that cleanup, native decoding, or transport has been established as the cause. An emulator reproduction is possible but not guaranteed. A clean emulator run alone does not resolve the reported physical-device bug.

## Branch decision and prior evidence

Continue on a fresh branch from `develop`, the repository's integration branch. At planning time, `develop` has 86 commits absent from `codex/qr-mob-021-voice-playback-diagnostics`, while the old branch has 8 unique commits. Do not merge or cherry-pick the old playback implementation wholesale. It predates subsequent engine and audio-session changes.

Historical branch: [QR-MOB-021 diagnostics](https://github.com/matt-reinig/quiet-room-mobile/tree/codex/qr-mob-021-voice-playback-diagnostics/docs/qr-mob-021-voice-playback-diagnostics).

Read these historical files for evidence, not instructions to replace current code:

- `progress.md`: recorded Android completed attempts, an iOS stall, and earlier player comparisons.
- `physical-device-findings.md`: diagnostics GET failed to start on a phone while the normal voice button worked during that test.
- `phase-5-native-player-investigation.md` and `phase-5-hls-delivery-plan.md`: earlier proposals; neither establishes the present root cause.
- Backend [voice playback history](https://github.com/matt-reinig/Gabriel/blob/main/docs/voice-playback-history.md): endpoint and delivery history; some player descriptions are historical.

The old classifier only detects `positionMillis + 750 < durationMillis`, treats unknown duration as not clipped, and does not inspect audible content. Its pass counts cannot establish that the last words were spoken. Separate requests also generate different speech, even for identical text. Use byte-identical audio for controlled comparisons.

## Current code to inspect before editing

| Location | Purpose |
| --- | --- |
| `src/components/MessageVoiceButton.tsx` | Normal saved-message GET, TrackPlayer events/polling, stop/reset cleanup, pause and replay ownership |
| `src/config/env.ts` and build scripts | Engine selection and build overrides |
| `src/lib/trackPlayerService.ts` | Native playback service and remote events |
| `src/lib/voicePlaybackBus.ts` | Playback ownership and cross-player events |
| `src/lib/audioSession.ts`, `src/hooks/useAmbientAudio.ts` | Audio focus, session changes and ambient interaction |
| `e2e/helpers.js`, `.detoxrc.js` | Existing emulator launch and automation conventions |
| Gabriel `gabriel_routes/voice_stream.py` | TTS input metadata, streamed byte counts and completion/cancellation logging |

The checked-in engine default still differs by app variant, but this is not evidence of what the user's installed builds execute. Log the resolved engine and explicitly select TrackPlayer for the experiment without changing product defaults.

## Phase 1: Instrument the actual playback path

Use a QA/dev-only diagnostic flag and existing normal message voice button. Do not build a separate player implementation whose lifecycle differs from the app. A diagnostic source override may route a seeded message to the fixture server; assert the selected source so fallback cannot silently turn a streaming test into a file test.

Emit structured events with a run ID, attempt/generation ID, monotonic elapsed time, app commit/version, variant, runtime engine/version, emulator image/API/ABI and endpoint mode. For native versions and event fields, inspect the installed TrackPlayer dependency before choosing APIs.

Capture:

- Play request, source creation, first native playback progress, pause/resume and buffering transitions.
- Position, buffered position and duration when available; preserve unknown values as unknown.
- Native errors, queue-end/state-ended events, stop/reset calls, unmount, ownership changes and audio-session changes. Record the reason and initiating operation for each cleanup.
- Stream request ID, input text hash/length, fixture hash, response status/MIME/transfer headers, bytes written by the server, and whether the source ended normally, errored or was cancelled.
- Client bytes received if obtainable from the actual native path. Server writes alone do not prove receipt or audible rendering. Do not issue a second TTS GET merely to collect headers; correlate the real request through a supplied run ID or server-side mapping.

In Gabriel, distinguish iterator exhaustion from exception and generator closure/client cancellation. A `voice_stream.stop` log from a `finally` block must not automatically mean successful completion. Preserve exception propagation. Record any required backend implementation in a separate Gabriel branch and link its exact commit in results.

Never record auth tokens or private conversation text in committed artifacts. Use synthetic fixture text for the primary experiment.

Deliverable: one normal-app emulator playback with confirmed TrackPlayer and correlated lifecycle/server events. No claimed clipping fix yet.

## Phase 2: Build a deterministic progressive source

Create one short, synthetic spoken fixture, approximately 15–30 seconds, with a distinct closing phrase, for example: "The final words are silver lantern seven." Verify those words in the original decoded audio, retain its SHA-256, and identify the final speech interval. Freeze the bytes; do not regenerate TTS between runs.

Add a small local test server, preferably in this mobile repository's test tooling, serving that fixture through a saved-message-shaped GET route. All complete-stream cases must send exactly the same bytes in the same order. Mirror observed backend headers, MIME, authentication behavior and range-request handling where relevant; log native retries and additional requests.

Serve progressive cases without a known full response length where that matches the live route. Flush chunks as scheduled and verify buffering by the server or proxy has not converted the experiment into completed-file delivery. Playback must measurably begin before the final chunk is sent. A saved fixture served progressively is a transport test, not a test of live generation latency.

| Case | Delivery | Expected use |
| --- | --- | --- |
| Complete-file control | Existing download-then-play control, same fixture bytes | Prove the fixture and audio capture contain the full ending |
| Steady stream | Paced complete chunks, normal EOF | Baseline streaming path |
| Delayed tail | Hold the final speech-bearing bytes for 250, 750, then 1500 ms | Exercise buffering near the ending |
| Chunk boundaries | Two repeatable chunk schedules, including different final-chunk sizes | Detect sensitivity to delivery timing/boundaries |
| Connection close | Same complete bytes, immediate versus delayed normal EOF | Isolate closure from content loss |
| Deliberate truncation | Remove a known speech-bearing tail | Negative control that the detector must flag; not reproduction proof |

Use a 120-second per-attempt timeout for the short fixture, recording timeout as a failure category rather than completion; close test connections and restore diagnostic switches between batches. Android emulator requests should target the host through the configured reachable address (typically `10.0.2.2`), not emulator loopback. Start with two runs per control and three per complete-stream case. Stop expanding the matrix once a realistic complete-stream failure is reproducible. A server intentionally withholding/removing audio is only a test of detection or error handling, not proof of the user's root cause.

## Phase 3: Measure the audio that was actually played

Capture emulator output, not just player status. First validate that the installed emulator's WebM recording contains a usable audio track and the complete-file control's closing phrase. Android's [emulator recording documentation](https://developer.android.com/studio/run/emulator-record-screen) describes audio/video capture; inspect the actual recording rather than assuming any screen-recording command includes audio. If unavailable, configure host output/loopback capture and record the exact setup. If neither works, classify the audible check as blocked, not passed.

Keep capture running through the final speech and at least two seconds after the terminal event. Align decoded reference and captured audio to remove startup offsets and accommodate resampling. Prefer waveform/audio matching of the closing interval, with transcription or manual listening for ambiguous cases. Transcription alone can hallucinate missing words or omit quiet speech. Validate the checker against complete and deliberately truncated controls before trusting batch results.

Classify results as `complete`, `audible-tail-missing`, `stalled`, `playback-error`, `cancelled`, or `inconclusive`. Never count unknown duration, missing recording or a player completion event alone as complete. Successful streaming requires both the audible closing phrase and playback beginning before final delivery.

Automate launch, fixture selection, playback, output capture and result collection using the repository's existing E2E conventions where practical. Save a per-run JSON manifest plus relevant event logs, reference/capture hashes and recordings. Keep small synthetic failure evidence in the repository; avoid committing every passing video. Provide exact commands and tool versions so another Codex session can reproduce the result.

## Phase 4: Test one explanation at a time

Only after an audible failure with a complete source has been captured, choose the next change from the evidence.

1. Compare final server delivery, native queue-end, last audible output and stop/reset timing. Do not assume their order establishes causation without a controlled comparison.
2. If immediate cleanup is implicated, add a diagnostic-only mode that briefly defers terminal stop/reset (bounded to at most two seconds) while continuing capture. Do not delay first playback, manual pause/stop, or cancellation. Bind delayed work and callbacks to the attempt ID so an old attempt cannot stop a new one. Cancel pending cleanup on new playback/unmount.
3. Run the same failing fixture and schedule against baseline and experiment. If the tail returns, refine a lifecycle fix based on the verified native player contract. Do not ship an arbitrary sleep as the final solution.
4. If bytes are lost before playback completion, investigate the transport/request cancellation path. If all bytes arrive but decoding/rendering still loses the tail, investigate native extraction/output behavior. Additional native instrumentation may be needed to distinguish these cases.
5. Consider HLS or another progressive delivery change only if the evidence supports it. Any proposed solution must still start before generation completes and report its startup-latency impact.

Check pause/resume, replay, starting another message and ambient enabled/disabled around the selected fix. Add targeted regression coverage for the demonstrated defect, not a broad player rewrite.

## Phase 5: Validate against real TTS and close the loop

Once the controlled case is understood, test synthetic text through actual QA TTS using the normal TrackPlayer path. Preserve the bytes from the same generation while streaming continues; a later request is not the same sample. Record backend generation completion, first playback progress and audible ending. Where a proxy/tee is needed, validate that it preserves progressive delivery and record that it changes the path.

For the candidate fix, rerun the previously failing schedule ten times and the steady/control cases three times each; all audible endings must be complete with no new stalls. Run three live QA TTS attempts and compare startup timing with baseline. Report timings and any latency tradeoff rather than claiming a universal zero-clipping rate.

If the emulator still cannot reproduce clipping, stop after the defined matrix and live QA checks. Record the exact tested boundary and retain the instrumentation. The follow-up is one targeted physical-device capture through the same instrumented app, not more unbounded emulator retries or declaring the bug fixed. Emulator automation remains the main regression workflow; a physical check validates applicability to the user's original symptom.

## Completion and handoff

- [x] Runtime TrackPlayer and progressive playback confirmed in the normal app flow.
- [x] Capture/checker accepts the complete control and rejects the missing-tail control.
- [x] Controlled matrix has auditable results and a reproducible command.
- [x] Actual failure reproduced, or the emulator reproduction limit explicitly recorded.
- [ ] Any proposed fix has a before/after comparison using identical audio and delivery.
- [x] Streaming startup is preserved; latency and cleanup behavior are reported for the initial emulator runs.
- [x] Live QA TTS and physical-device validation are recorded separately, including any pending check.
- [x] Update this plan and QR-MOB-021 tracker with findings, commits and next step.

## Implementation update: 2026-09-09

The isolated implementation branch now contains a QA/local-only diagnostic route through the normal `MessageVoiceButton` TrackPlayer lifecycle, a byte-frozen MP3 fixture and paced server, correlated run manifests, emulator audio capture, and a conservative waveform-envelope checker. The complete-file control classified `complete`, deliberate truncation classified `audible-tail-missing`, two paced steady runs classified `complete`, and a delayed-tail-1500 run classified `complete`.

The paced run demonstrated native playback state `playing` 5.635 seconds before the fixture server's normal EOF, so progressive startup is preserved in this harness. No realistic clipping failure has been reproduced in the partial matrix, and no product playback fix has been applied. See `docs/qr-mob-021-trackplayer-streaming-progress.md` for exact run IDs, scores, artifact paths, limitations, and the next cases.

Implementation should produce a brief results document alongside this plan with environment, run table, evidence paths, root-cause confidence and remaining limits. This planning branch does not authorize claiming a fix, merging, or releasing untested changes. No app or backend behavior has been changed by the planning commit.

## Investigation handoff: emulator-first next steps (2026-09-09)

This section updates the investigation order and physical-device follow-up described above. The user wants to exhaust useful emulator investigation before considering a phone. **Live/real TTS means the Android emulator playing audio generated by the actual QA backend; it does not mean physical-device testing.** Keep physical-device testing as a last resort, discussed with the user only after the emulator steps below have been completed and their limits documented. Do not make phone installation or listening a prerequisite for the next phase.

Continue from implementation commit `c9984bb185ff806d40d51245d97236c39da49d31` on `codex/qr-mob-021-trackplayer-streaming-implementation`, in worktree `/Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-qr-mob-021-trackplayer-streaming-implementation`. Read the sibling progress and results documents before changing the harness. This handoff adds findings and proposed work; it does not implement a playback fix or authorize a merge, release, or production mutation.

### Findings that change the next experiment

- The 24 existing diagnostics, fixture-server, capture-checker, and run-collector tests passed during the read-only investigation. Their passing status does not establish sensitivity to short clipped endings.
- The capture checker has a demonstrated false negative. Decode the frozen MP3 to 8 kHz mono, replace its final samples with silence, retain the capture length, and append two seconds of silence to simulate recording continuing after playback stops. Using the manifest closing interval (`13.345–15.855 s`) and the current exported checker functions produces the results below. A Luna probe and an independent parent-agent check reproduced the 250/500/750 ms results. These are detector calibration experiments, not reproductions of the app bug.

| Final audio replaced by silence | Closing score | Current classification |
| --- | ---: | --- |
| None | 1.0000 | `complete` |
| 250 ms | 0.9235 | `complete` |
| 500 ms | 0.8077 | `complete` |
| 750 ms | 0.6664 | `audible-tail-missing` |

- Full and closing capture coverage remain `1.0` in these probes because the recording continues. Coverage and an aggregate closing score can therefore pass despite lost ending audio. Earlier `complete` classifications do not rule out shorter losses; this finding does not establish that those recordings actually clipped.
- The delayed-tail-1500 run did not approach buffer exhaustion. Its last poll before final delivery reported position `5.124 s` and buffered position `13.217 s` at `21:28:02.877Z`. The final 42,000 bytes arrived at `21:28:03.403Z`, about 6.043 seconds after the GET. There were roughly eight seconds of buffered audio in reserve. Evidence: `artifacts/qr-mob-021/20260909T212747Z-delayed-tail-1500/run-manifest.json` and its referenced device log.
- The frozen fixture is macOS Samantha speech encoded by FFmpeg as 128 kbps, mono, 44.1 kHz MP3; its bytes include an `Info` header. Live TTS encoding/metadata equivalence has not been verified. An unknown HTTP response length alone does not establish equivalent media metadata.
- Diagnostics currently couples emitter creation to a fixture override in `MessageVoiceButton.tsx`; the selected fixture path also omits live auth headers. Ordinary QA TTS playback does not currently produce the equivalent diagnostic trace. Extend this explicitly before claiming to test live TTS with the same instrumentation.

### Ordered work for the next implementer

1. **Repair and validate ending detection.** Add deterministic controls for an intact ending, removal of the final word, and 250/500/750 ms of known speech loss while capture continues through trailing silence. Use `decodeMediaToMonoPcm`, `buildRmsEnvelope`, `alignEnvelope`, `scoreAlignedCapture`, and `classifyCaptureResult` to preserve the probe method. Evaluate a separate final-speech segment or shorter windows so the earlier closing phrase cannot hide a missing last word. Calibrate against intact emulator recordings and gain/alignment variation; do not merely raise a threshold until one control fails. Recheck retained recordings with the revised checker and preserve old versus revised classifications. Treat ambiguous recordings as inconclusive.

2. **Separate tracing from source selection.** Add an explicit QA/local live diagnostic mode that retains the normal authenticated saved-message GET and resolved playback engine. Keep fixture routing as a separate mode. Record run/attempt identity, actual endpoint mode, native progress/buffering, terminal events, ownership changes, and cleanup reasons. Capture relevant audio-session/ambient transitions. Do not issue a second TTS request for headers or diagnostics. Keep tokens and private text out of logs and committed artifacts.

3. **Capture one real QA generation on the emulator.** Use synthetic text with a distinct ending and a length representative of a saved assistant reply. Preserve the exact bytes of that generation while streaming continues, alongside delivery timing and emulator audio. A later TTS request is not an identical control. If a tee/proxy is needed, verify that it preserves progressive startup and document the changed transport path. Correlate backend exhaustion, error, and cancellation separately: a `voice_stream.stop` emitted from `finally` is insufficient proof of completion. Implement any necessary backend instrumentation in a separate Gabriel branch, preserving existing local changes and following the normal QA deployment authorization rules.

4. **Replay that generation as controlled comparisons.** Compare its completed-file playback with progressive playback using the same retained bytes. Match observed live headers, range behavior, encoding, and chunk timing where relevant. Include a bounded case where the tail arrives near buffer exhaustion, verified by client progress/buffering, rather than assuming a named delay creates that condition. An intentionally stressed stream is diagnostic evidence, not proof of the field root cause. Assert that playback starts before final delivery and that the revised checker detects the ending.

5. **Choose a fix only from a captured failure.** If retained generation bytes already lack the spoken ending, investigate generation. If those bytes are complete but streamed output loses the ending, distinguish delivery/cancellation from decoding/rendering using the available client and server evidence; server writes alone do not prove native receipt. If cleanup is implicated, use the bounded diagnostic comparison in Phase 4 before choosing a lifecycle change. Retain TrackPlayer and progressive startup during this investigation. Any candidate fix needs a byte-identical before/after comparison and the regression counts already specified above, including pause/resume, replay, switching messages, and ambient interaction.

### Stop condition and handoff evidence

If the revised checker, actual QA TTS on the emulator, and controlled replay still do not reproduce the symptom, record that boundary and the remaining device/output-route uncertainty. Only then propose one targeted physical-device capture as a last resort; do not silently escalate into phone builds or repeated listening requests. A clean emulator result remains bounded evidence, not a declaration that the field bug is fixed.

Update the progress/results documents with exact commits, commands, fixture and capture hashes, correlated run IDs, first-playback/final-delivery timing, revised checker results, and any limitations introduced by capture or proxying. Preserve the existing recordings for comparison. The immediate deliverable is a validated detector and an auditable real-QA-TTS emulator comparison, or a specific documented blocker—not a player rewrite or release.

## Handoff implementation result: 2026-09-09

The added emulator-first work is implemented in this worktree. Capture checker schema v2 adds a narrowly aligned final-speech window and deterministic intact/final-word/250/500/750 ms controls. The revised detector catches every deliberate ending loss while treating a low-correlation/high-energy retained recording as `inconclusive`. Rechecking retained recordings changed only `delayed-tail-750-repeat-capture` from legacy `complete` to revised `inconclusive`; this is an ambiguity finding, not proof of app clipping.

One authenticated QA saved-message TTS request was captured through an explicitly labeled local application-level tee. The tee forwarded the original authenticated GET once, streamed and retained the same response bytes, stripped local correlation headers before QA, and did not log tokens, conversation identifiers, prompt text, or assistant text. The retained QA response is AAC, 136,189 bytes, SHA-256 `004e929896aba2bcf0c523fbaf3ceb82a33502e1c0fcaba8b9f53402d03a7548`; the proxy observed nine chunks and normal upstream HTTP exhaustion. Its emulator recording classified `complete` with ending score `0.9949`. Cross-process wall clocks place native `playing` about 195 ms before the proxy's final write callback, which is too close to treat as strong ordering proof; exact recorded-schedule replay started after EOF, while the bounded progressive stress independently confirmed startup before final delivery.

Complete-file and recorded-progressive replays of the exact retained bytes both passed and classified `complete`. A final 50,000-byte release after seven seconds arrived after playback had started, with the last unambiguously pre-release poll showing 2.139 seconds of reserve 1.238 seconds before server EOF; the final release therefore occurred near buffer exhaustion, subject to cross-process clock/callback uncertainty. The repeat passed and classified `complete` with ending score `0.99995`. An eight-second gap crossed the native HTTP idle boundary: the client cancelled about 10.54 seconds after the GET, roughly 0.24 seconds before the scheduled final write, then retried. That intentionally stressed cancellation is transport-boundary evidence, not the reported field bug and not a basis for a product fix.

No realistic emulator clipping failure was reproduced, so no playback fix was selected. No backend instrumentation, backend deployment, merge, release, production mutation, or physical-device run was performed. The remaining uncertainty is device/output-route applicability; per this handoff, physical-device capture is now a separately pending last resort to discuss with the user.
