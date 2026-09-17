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

## Next investigation: source completeness and normal app use on the emulator (2026-09-10)

This section supersedes the preceding suggestion to consider physical-device capture next. The user reiterated that they want to avoid physical testing. Continue entirely on emulators for this round; do not install a phone build or make physical listening a prerequisite. Live QA testing still means an emulator using the actual QA backend. This section is proposed investigation work, not a claim of reproduction or a playback fix.

### Starting evidence and remaining gaps

Continue from `21e9680` (`Implement QR-MOB-021 emulator streaming handoff`) on `codex/qr-mob-021-trackplayer-streaming-implementation`. Read the sibling progress/results documents and retain the existing artifacts. The detector v2 and tee suites were independently rerun during review: 10/10 tests passed. Do not restart the completed detector work or repeat the short fixture matrix without a new hypothesis.

The new evidence establishes that one 14.464-second QA-generated AAC sample retained its ending through complete-file, recorded-schedule, and near-buffer-stress playback. It does not establish that the AAC contains all intended words. The synthetic prompt requested `copper meadow nine`, but the actual assistant ending and its spoken realization were not independently verified. The capture checker compares played audio to retained audio; it can pass if both omit the same intended words.

The live E2E requests one short paragraph, waits for send readiness, and manually taps the saved-message voice button. It does not exercise automatic Voice Mode, longer replies, or pause/resume and replay in this live comparison. Direct `live-trace` exists, but the documented retained live sample used `live-proxy`.

The proxy preserves bytes but changes transport behavior. In `scripts/voice-stream-tee-proxy.mjs`, each upstream chunk is written to disk, then downstream, then logged; its chunk timestamp is therefore not an upstream-arrival timestamp. It also removes Content-Length when present. The nine recorded chunks spanning about 88 ms and the apparent 195 ms native-playing lead do not establish precise live streaming order. The eight-second idle-timeout stress remains a known boundary, not a demonstrated explanation of field clipping.

### Ordered emulator-only work

1. **Separate intended text, generated speech, and rendered speech.** Start with the retained QA sample and the synthetic test conversation. Read back the actual saved assistant ending used by that GET and establish which conversation/message was selected; a requested phrase alone is insufficient. Compare that text with the retained AAC ending, then compare the retained AAC with the emulator recording. Use transcription as supporting evidence and keep ambiguous words inconclusive; do not require the user to listen. For new attempts, correlate the finalized assistant text and the backend TTS input using bounded IDs, length/hash, and completion timing where obtainable. Keep private text and credentials out of committed artifacts. If historical source identity cannot be recovered reliably, mark that check inconclusive and use a new synthetic attempt. Do not regenerate audio and present it as the old request's source.

2. **Run three longer replies through direct QA `live-trace`.** Aim for approximately 60–120 seconds of spoken output, recording actual duration rather than assuming text length guarantees it. Retain the normal authenticated saved-message GET and resolved engine; log configuration so QA AAC results are not generalized to an unverified engine/format. Capture emulator audio, native progress/buffering, ownership, terminal events, and cleanup reasons. Adjust test and recording timeouts to include setup, generation, playback, and at least two seconds after termination; record timeout as its own result. These direct runs provide normal-path observations. Without retained bytes from the same generation, they do not support byte-identical waveform completeness claims.

3. **Improve timing evidence before comparing direct and proxy runs.** Record monotonic upstream receipt, downstream submission/completion, and logging times separately. Document headers changed by the proxy and any backpressure or local disk delay. Compare direct/proxy behavior using the same synthetic text and configuration, while acknowledging that separate TTS requests generate different audio. For exact waveform comparisons, retain one generation and replay those exact bytes. If direct-only behavior differs, prioritize native data-source tracing/capture or separately scoped backend instrumentation instead of treating the proxy as transparent. A direct/proxy timing difference alone does not identify the cause. Claim progressive startup only when the measured separation exceeds the timing uncertainty.

4. **Exercise playback lifecycle in small controlled batches.** Use the long-reply baseline, then run three automatic Voice Mode attempts. Verify that autoplay actually triggers from reply completion rather than another scripted tap. Trace reply completion, source selection, ownership, unmounts, and cleanup so early requests or component changes are visible. Next, use retained audio to compare uninterrupted playback, replay, and pause/resume, with two attempts per case. Test switching messages and ambient enabled/disabled separately if the first lifecycle cases remain clean; start with two attempts per added case. Keep cancellation caused by a deliberate user action separate from unexpected missing speech. Stop expanding the matrix when a relevant failure is captured and reproduce that case before selecting a fix.

5. **If needed, test a second Android emulator system image.** After the source, direct-path, and lifecycle checks above remain clean, repeat the most representative long/manual and autoplay cases on another Android API level, ideally matching the affected installation's OS version when known. Start with two attempts per selected case. Preserve the same app code/configuration and retained replay bytes where applicable; record the system image, API, ABI, and audio-capture validation. This explores OS-dependent behavior without physical hardware. Do not infer that emulator coverage proves a particular phone/output route is unaffected.

### Interpretation and completion criteria

- Intended saved text lacks the expected ending: investigate response generation or source selection before playback.
- Saved TTS input is complete but retained generated audio omits words: investigate speech generation, input handling, or upstream delivery; matching playback cannot clear this failure.
- Retained source is complete but rendered output loses speech: use receipt, buffering, ownership, and cleanup evidence to distinguish transport from player/lifecycle behavior. Server writes alone do not prove native receipt.
- A lifecycle action intentionally cancels playback: classify it as cancellation; investigate only unexpected interruption or failure to resume/replay correctly.
- Direct runs differ from proxy runs: document the difference and improve normal-path capture before attributing it to one layer.

The deliverable is a source-completeness assessment plus the bounded long-reply/direct-path/lifecycle results, with commands, exact code/configuration, source/capture hashes where available, run IDs, timing uncertainty, and classifications. Update the progress/results documents with what was actually executed and any blocked checks. Preserve the requirement that a proposed product fix starts playback before generation finishes and has a relevant before/after comparison.

If all selected emulator cases remain clean, stop and summarize the remaining uncertainty for the user. Do not automatically escalate to a physical device, declare the field issue fixed, expand into unbounded retries, or select a player replacement, arbitrary cleanup delay, or transport migration without supporting evidence. This section does not authorize a merge, store release, production change, or physical-device run.

## Emulator-only investigation result (2026-09-10)

This section was executed in the implementation worktree with Luna subagents performing bounded source, harness, timing, environment, and final-review tasks while the primary agent integrated and verified the work. Detailed commands, run IDs, hashes, classifications, caveats, and local artifact paths are recorded in `docs/qr-mob-021-trackplayer-streaming-progress.md`; the condensed outcome is in `docs/qr-mob-021-trackplayer-streaming-results.md`.

- The historical saved assistant source was recovered without exposing its text: 220 Unicode characters, SHA-256 `c5f3f5d6012cbb2f26f90d80144040ed6bdf8d9c669c6d9e4091a63b91d5ad4d`, and the normalized ending matched `copper meadow nine`. The retained historical AAC and emulator recording still match strongly at the ending, but no local speech recognizer/model was available to independently establish the words encoded in the AAC. Generated-speech lexical completeness therefore remains `inconclusive`, not assumed from the prompt.
- Four direct long-reply observations reached native queue end. Three have full playback recordings and measured playback durations of 116.296, 115.220, and 124.913 seconds; the last exceeds the requested target band by 4.913 seconds and is retained as an out-of-band clean observation. The first 127.442-second observation is timing-only because the 180-second recording began too early and omitted the final playback segment. Read-only QA source lookup exactly matched each app-emitted source hash/count and confirmed the requested ending.
- The tee now separates upstream receipt, disk completion, downstream completion, event-log timing, backpressure, and privacy-safe header-name policy. A short proxy run exhausted normally with exact retained bytes and native queue end. Its source-versus-emulator checker result is `inconclusive` overall because of low full-recording alignment/gain, while closing and ending correlations were 0.9782 and 0.9979. A long proxy request instead hit the existing Android connection timeout before upstream headers arrived; this is a proxy-path startup limitation and not a clipping reproduction.
- The retained-audio lifecycle batch covers two attempts each for uninterrupted playback plus replay, deliberate pause/restart, ambient enable/disable during voice, and message switching, plus three automatic Voice Mode replies. Deliberate pauses are classified separately from unexpected interruption.
- A second API 35 AVD was inventoried and launch attempts were preserved, but both installed API 35 AVD definitions exited before Android readiness. No second-image playback result is claimed.

No emulator case reproduced the reported missing ending on the normal direct path, and no evidence-supported product fix was selected. Nothing was installed on a physical device, deployed, merged, pushed, or released. Remaining uncertainty is the lexical content of retained generated AAC without independent transcription, direct-path byte capture, physical output routes, and the unavailable second emulator image.

## Next handoff: verify spoken endings and live-QA autoplay (2026-09-10)

Continue from `8812601` (`Execute QR-MOB-021 emulator source investigation`) on the existing implementation branch/worktree. This entry follows review of the latest progress, results, lifecycle test, and emulator startup logs. It narrows the next round to unfinished evidence checks. The user continues to prefer emulator-only work; do not make a physical-device installation or user listening session a prerequisite or automatically escalate to one.

### Evidence boundary to preserve

- The source text hashes and read-only QA readbacks agree and include the expected ending. The three fully recorded long direct runs reached native queue end, but their spoken endings have no independent transcript or byte-identical source comparison. Describe them as completed native observations, not verified absence of lost words.
- The lifecycle batch passed, but `e2e/quiet-room.voice-lifecycle-batch.test.js` selects `mode: 'fixture'`, including its automatic Voice Mode test. It proves automatic triggering with fixture audio; it does not satisfy the long-reply/live-QA-autoplay comparison. Its completion checks observe UI labels rather than audible ending content.
- The retained AAC samples permit analysis now. Lack of an installed local speech recognizer is a tooling gap, not a reason to skip spoken-content verification or require a phone.
- The API 35 launch logs explicitly report an existing system-image path. The available failure diagnostic is `child_port_handshake.cc:197: no client check-in`; the logs do not establish a missing image, port conflict, or resource cause. Preserve this distinction if revisiting the optional second emulator.

### 1. Analyze existing recordings before generating more audio

Provision a local speech-recognition tool/model in an isolated environment if needed, without changing the app's dependency set. Record its version, model identity, decoding settings, and reproducible commands. Use local processing for the retained recordings and recovered source text; do not upload them to a third-party transcription service as an implicit fallback. Do not stop at discovering that a recognizer executable is absent: attempt routine local setup and document a concrete blocker if setup cannot be completed.

Start with the historical AAC under `artifacts/qr-mob-021/live-qa-20260909T225042Z/`, the retained short proxy sample under `artifacts/qr-mob-021/live-qa-20260910T180641Z/`, and the three complete direct recordings under `live-qa-20260910T133150Z`, `live-qa-20260910T133553Z`, and `live-qa-20260910T133935Z`. Resolve exact file names and hashes from the progress document/manifests. The earlier `live-qa-20260910T132311Z` recording lacks the ending and must remain timing-only.

Recover each actual saved assistant ending read-only and correlate it with the recorded source identity. Transcribe the audio independently before comparing text: do not give the recognizer the expected phrase as a prompt, vocabulary hint, or forced output. Include sufficient preceding speech around the ending, and document any decoding, cropping, or gain adjustment while preserving original files. Normalize punctuation, case, and equivalent spoken numbers for comparison, without silently removing missing substantive words.

Validate the recognizer workflow against an intact retained sample and deliberately shortened copies with known final speech removed while trailing silence remains. A recognizer that supplies the missing expected words on those controls cannot establish completeness. Transcription is supporting evidence, not a replacement for the waveform checker: use a second independent local recognition pass or additional signal inspection for disputed words, and retain `inconclusive` when the evidence is ambiguous. No user listening is required.

Produce a compact per-sample table separating saved-text ending, generated-AAC ending when available, emulator-rendered ending, and confidence/limitations. Keep private text and raw transcripts in ignored local artifacts; commit only bounded classifications, hashes, and synthetic evidence appropriate for sharing. For direct recordings without source bytes, a missing rendered word does not by itself distinguish generation from transport or playback loss.

### 2. Run three genuine long-reply live-QA autoplay attempts

Extend the live-QA harness rather than counting the fixture autoplay test again. Use `live-trace`, the normal authenticated saved-message GET, automatic Voice Mode enabled before reply completion, and no scripted voice-button tap. Assert the selected endpoint mode and absence of fixture routing. Use synthetic replies targeting roughly 60–120 seconds of actual speech and record their measured durations, including out-of-band cases.

Start emulator audio recording before the automatic trigger, with enough recording budget for the remaining generation, complete playback, and at least two seconds after termination. Preserve phase-specific timeouts and verify that the recording actually contains the final segment. Correlate reply completion, source identity, native start/progress/buffering, ownership, cleanup, and final state. Assess the recorded words using the validated local workflow above. A UI transition or queue-ended event alone is not an audible-completeness result.

Keep the initial batch to three attempts. If a relevant missing ending is captured, stop expanding the matrix, preserve that attempt, and choose the next diagnostic comparison from its evidence. Do not change product playback behavior to make the test pass.

### 3. If still ambiguous, capture bytes inside the normal Android playback path

If direct playback remains inconclusive because its exact source bytes are unavailable, inspect the installed TrackPlayer/native dependency version and identify a QA-only data-source capture point. Retain bytes from the same native request while preserving its direct endpoint, authentication, streaming, retries, and cancellation behavior. Do not assume a particular Media3/ExoPlayer API is available without inspecting the installed dependency. Avoid a second request or full-response buffering before playback.

Record each native request/retry separately with byte count/hash, completion/error/cancellation, and timing. Validate capture overhead and progressive startup with a known fixture before interpreting a live result. Compare the retained source ending against the emulator output from that exact attempt. This is diagnostic instrumentation, not a player replacement or product fix. If native capture requires a larger dependency change than expected, document the smallest proposed approach and tradeoffs before expanding scope.

The long proxy timeout remains a startup observation. It does not establish final-word clipping or justify an arbitrary timeout increase as the product solution. Use direct capture to reduce transport ambiguity rather than assuming the local proxy is equivalent to the normal connection.

### Optional second image and stopping rule

After the content and live-autoplay checks, a bounded API 35 readiness investigation remains available without a phone. Inspect existing processes, port use, AVD configuration, and the installed image; attempt one controlled launch with explicit ports and complete stderr capture. Do not delete AVD data, kill unrelated emulator sessions, or reinstall an image solely because an earlier inventory command called it missing. If readiness succeeds, validate audio capture and repeat only representative cases. If it fails, report the observed cause or remaining uncertainty rather than inferring one from the handshake warning.

Update the progress/results documents with exact commits, commands, model/tool versions, sample hashes, correlation IDs, transcript-control outcomes, actual autoplay endpoint mode, and per-attempt classifications. The immediate deliverables are an assessment of existing spoken endings and three real-QA-autoplay observations, or specific documented blockers. Preserve inconclusive results and distinguish source-generation loss from rendered loss wherever the evidence allows.

If these checks remain clean or inconclusive, stop and review the remaining uncertainty with the user. Physical-device testing remains a separately discussed last resort. This entry does not authorize a merge, push, deployment, store release, production mutation, or physical-device run, and no field fix should be claimed without a relevant before/after reproduction.

## Spoken-ending and live-autoplay execution result (2026-09-10)

The requested local spoken-content workflow, controls, existing-sample analysis, and three genuine live-QA autoplay attempts are complete. Both independent recognizers omitted the saved requested ending from every prior direct recording and every new autoplay recording, while the historical retained AAC was complete and deliberate shortened controls were detected. All three autoplay attempts used the live endpoint with fixture routing rejected, enabled Voice Mode before reply completion, recorded before the prompt, performed zero scripted taps, reached native queue end, completed cleanup/ownership release, and retained the post-terminal segment. Read-only QA readback matched the native source identity and confirmed the ending in all three saved messages.

The result remains `inconclusive` about the failing layer because direct response bytes were not retained: it cannot separate TTS generation, transport, and emulator rendering. Inspection established that the active Android path is KotlinAudio 2.1.0 over ExoPlayer 2.19.0 and has no public byte-capture injection point. The smallest next experiment is a QA-only KotlinAudio AAR fork wrapping its `DefaultHttpDataSource`; because that is a material dependency/build-maintenance expansion, the proposal and tradeoffs are recorded in the progress document and no fork was implemented without explicit approval. No product playback behavior, physical device, deployment, merge, push, or release was changed.

The optional API 35 retry reached readiness on an explicit port. A representative retained-fixture run attached to that emulator passed, exhausted the full fixture normally, reached native queue end, and classified the recorded waveform `complete`. The primary API 34 emulator was not disturbed.

## Native normal-path byte-capture execution result (2026-09-17)

The explicitly approved normal-path capture experiment is implemented and exercised on the Android emulator. A source-vendored KotlinAudio 2.1.0 module, pinned to upstream commit `bf71120704bfe4be2311cf86fc1e2ee1c3c702b7`, wraps the same ExoPlayer 2.19.0 HTTP `DataSource` read path used by TrackPlayer. The fork is selected only when the Gradle property `QR_MOB_021_NATIVE_CAPTURE=true`; a normal dependency resolution still selects the published `com.github.doublesymmetry:kotlinaudio:v2.1.0` artifact. The JavaScript capture flag is separately opt-in. Internal correlation headers are bounded and removed case-insensitively before the network request, and capture metadata excludes URLs, authorization values, prompt text, assistant text, and response-header values.

Each native `open()` retains its own ignored body and privacy-bounded JSON record. The collector validates run/attempt correlation, endpoint mode, body hash/count, request sequence, retry/range layout, gaps, conflicts, completion evidence, and forbidden metadata keys before reconstructing a source. A single position-zero request is labeled directly comparable only when native EOF/content length or an independent expected SHA proves completeness. The fixture and live runners opt into both the JavaScript and Gradle gates and pull only the correlated app-scoped capture.

The known `steady` fixture passed first. One native request captured all 254,581 expected bytes with SHA-256 `888d4c1dae1ef1fadb3c850b5bf886bb6bb0833cdbb91e15713d5ebb899295fa`; the independent expected hash matched, with zero gaps, conflicts, or capture errors. ExoPlayer closed after consuming the known complete chunked MP3 without an additional EOF read, so the native record says `closed-before-eof`; the server's normal EOF plus exact fixture hash is the independent completion proof. Total synchronous capture-write time was 16.95 ms across a 6.304-second stream, with a 7.77 ms maximum write.

Exactly one qualifying live-QA autoplay sample was then generated after setup-only authentication/DNS failures produced no conversation, TTS request, or capture. Evidence root `artifacts/qr-mob-021/live-qa-20260917T193055Z/` contains run `run-mu5xei7u-ndfltn` / attempt `attempt-mu5xei7u-pg7y9b`. The normal authenticated live request produced one position-zero native capture, reached real EOF, and retained 1,142,871 AAC bytes with SHA-256 `e3c3ab89c7b0e12a46bad296667c8462d9eb16580d86505f4d74a9481ac22920`; reconstruction found zero gaps, conflicts, or capture errors. Native playback began about 62.1 seconds before the last response byte, then reached queue end at 121.908 seconds with cleanup and ownership release. This proves the capture did not turn the direct request into completed-file playback.

The exact native AAC versus the same attempt's emulator recording classified `complete`: full alignment 0.8983, closing correlation 0.9963, and final-750-ms correlation 0.9900, all with full coverage. The saved assistant source identity and UI readback both contain the requested synthetic ending. Local `base.en` and `small.en` transcription of the full source, full recording, and independent final-20-second crops is retained as supporting evidence in ignored artifacts; both models recover the requested ending from both the native source and rendered emulator recording. This resolves the earlier ambiguity for this exact attempt: QA generated the ending, the normal Android request delivered it through native EOF, and emulator TrackPlayer rendered it. It is one bounded clean sample, not proof that the intermittent field symptom cannot occur.

No product playback behavior was changed, and no physical-device run, backend mutation, deployment, merge, push, store release, or player replacement was performed. The reusable QA-only capture instrumentation remains available for a future captured failure. The next meaningful step is review/merge of this diagnostic branch if the team wants to retain the instrumentation; otherwise stop rather than expand into unbounded emulator retries. A product fix still requires a relevant failing sample and byte-identical before/after evidence.
