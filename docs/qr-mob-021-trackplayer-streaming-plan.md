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


## Next handoff: investigate a captured upstream omission (2026-09-17)

The follow-up used the same saved assistant reply as the suspect 2026-09-11 autoplay sample, rather than generating another chat reply. Read-only QA lookup and the normal voice button both matched source SHA-256 `13a3ddd146503d36f9b0ae121eee477a6db2cf095246cbb06f891c107731d4b7`, slot 1, and conversation SHA-256 `fedc6a8525c9a5f212a974140d84e82630ea10b239b8a6648219fa257fa285a5`. The retained historical identity establishes the intended ending `copper meadow nine`. These follow-ups are manual replay of an existing reply, not a recreation of the original autoplay timing.

The first published-library replay again omitted the ending in local transcription. More decisively, the capture-enabled replay retained a complete position-zero AAC response through native EOF (1,085,039 bytes; SHA-256 `c37d9680c9d027eb2ec91ccd72b5847ba0cfef5e427f13e734e8a940dba885be`). Both local recognizers omit the expected phrase from the native source. The source-to-emulator waveform check is `complete`, with full correlation 0.9523, closing 0.9932, final-750-ms correlation 0.9912, and full coverage. This supports an omission before TrackPlayer rendering for this attempt. ASR agreement is supporting semantic evidence, not a byte-level proof of which words the AAC encodes. It does not yet separate incomplete TTS input, speech generation, or an upstream response ending early. HTTP EOF alone does not establish provider-side semantic completeness.

A second capture on September 18 confirms the same boundary: both recognizers omit the sentinel from source and recording, while waveform comparison is `complete` (ending correlation 0.9532). Its native response SHA-256 is `1f157068dd2973a50a8a48fb560e8c1b9cce4a908300819cb188dcc86f0c6ddc` (1,124,878 bytes, real EOF). This repeat occurred after a continuation gap; backend parity across that gap is unverified. Artifacts are under `artifacts/qr-mob-021/controlled-comparison-20260917/`; see progress/results for the confirmation pair and harness caveats. No physical-device test is required for the next discriminator. Stop broad player A/B repetition once source-versus-rendering evidence is confirmed; a third arbitrary pair adds less information than correlating the server request.

### 1. Correlate the captured request with QA backend evidence

The attempted read-only AWS lookup was blocked by an expired local AWS session. Restore the existing QA read access before investigating logs; do not deploy a backend change as a substitute. Identify the actual deployed streaming function/version and its configuration. A local backend checkout is not proof of deployed code.

For capture run `run-mu68fahj-ooqihy` / attempt `attempt-mu68fahj-9vqt4o`, use the original event timestamps in `capture-1/events.json` and the ignored saved-conversation locator to find the matching `voice_stream.request`, `voice_stream.openai_call_started`, `voice_stream.stop`, and any error events. The mobile attempt ID is not automatically a backend request ID: the capture-only correlation headers are stripped before HTTP. Match the time window, saved conversation, message index, and server TTS request ID; preserve ambiguity if more than one request fits.

Compare the server's actual TTS input SHA-256/byte count with the saved source, allowing only explicitly verified normalization such as outer whitespace trimming. Record model, voice, format, speed, instructions, upstream completion/error, chunk count, and emitted byte count. Compare the latter with the exact native byte count; equal length alone is not byte equality. Existing native metadata retains response-header names, including `x-gabriel-tts-request-id` and `x-gabriel-tts-text-sha256`, but deliberately excludes values. Those names cannot establish the TTS input hash or request identity for this capture.

If logs cannot uniquely correlate requests, propose a narrow QA-only allowlist for those diagnostic header values (validated request identifier, SHA-256, bounded numeric counts), with tests preserving exclusion of authorization, cookies, URLs, and response text. Do not broadly retain headers. This is a proposed instrumentation change, not an assertion that the current capture contains these values.

### 2. Choose the next experiment from the boundary that fails

- Server TTS input differs from the complete saved reply: trace source selection, normalization, or truncation and reproduce that exact transformation locally before changing playback.
- Input matches but provider output omits the ending: retain the exact provider response and compare with native bytes. Use the same frozen text/settings for a bounded TTS-side control. If testing shorter chunks, codec/container behavior and continuous playback must be measured; do not concatenate arbitrary AAC files or accept waiting for the whole reply as a streaming fix.
- Provider output contains the ending but server/native bytes do not: investigate server iteration, exceptions, response closure, and transport, preserving byte hashes and terminal signals at both boundaries.
- Native bytes contain the ending but emulator output does not in another attempt: return to the player/lifecycle branch using that exact response and recording. The current captured omission does not support this branch.

A product change needs a failing same-source case, a relevant before/after comparison, and evidence that playback still starts before generation completes. Keep ASR corroborated by source/recording comparisons and distinguish recognizer uncertainty from proven byte loss. Continue emulator and backend evidence collection; physical hardware remains a last resort for a remaining device-specific question. This handoff authorizes no deployment, merge, release, production mutation, or automatic physical-device escalation.

### Execution result (2026-09-18)

The read-only QA backend correlation is complete. The deployed `gabriel_streaming_lambda` was active on image `78ea789` with the expected observability, QA environment, and AAC override. Both captured requests used the exact saved-source SHA and full 1,865-character / 1,872-byte input with `gpt-4o-mini-tts`, `cedar`, AAC, and speed `1.0`; neither logged an error. Backend stop counts exactly matched native receipt for both attempts: 1,085,039 bytes and 1,124,878 bytes, respectively. Native capture reached EOF with zero gaps, conflicts, or errors in both cases.

This executes section 1 and selects the second branch in section 2: input matches, while the captured audio semantically omits the ending. Equal server/native byte counts are not byte identity because the backend did not log response hashes, but there is no observed count-level relay loss. The next bounded experiment is a direct frozen-input TTS control retaining the exact provider response locally. It requires a new paid provider request and was not implicitly authorized by the read-only AWS correlation. No deployment or product change was made.

### Direct provider control execution (2026-09-18)

The separately authorized provider control is complete. The frozen input SHA/byte count and deployed model, voice, exact instruction identity/value, speed, and AAC format were verified before the request. OpenAI returned HTTP 200 with no error; the complete 1,133,777-byte AAC response and completion metadata are retained locally. Both established offline recognizers omit every expected ending token from the full decoded response and an independent final-25-second crop.

This bounded control reproduces the omission without the backend relay, native data source, or TrackPlayer in the path. Because TTS output can vary across calls, the control is not required to byte-match either historical response, and ASR remains semantic rather than byte-level lexical evidence. The combined evidence now supports generation-side omission as the working cause and does not support a mobile playback change. No additional provider call, deployment, product mutation, physical-device run, merge, push, or release was performed.

### Pinned-snapshot instruction isolation (2026-09-18)

Two explicitly authorized Speech API controls pinned `gpt-4o-mini-tts-2025-12-15`; Realtime was deliberately excluded. Frozen source, `cedar`, speed `1.0`, and AAC were identical. The only payload difference was including the exact deployed instruction string versus omitting the `instructions` key.

Both responses completed and decoded without error. With deployed instructions, both full recognizers and both independent tail crops omit all ending tokens. Without instructions, both full recognizers recover the complete ending, and `small.en` recovers it in both tail crops; `base.en` is inconsistent on isolated tail crops. The pair therefore supports, but does not conclusively prove, an instruction-dependent generation omission. Pinning the newer snapshot alone did not correct the behavior.

The next product-oriented work should remain within the dedicated Speech API: design a smaller instruction prompt (or no instruction) that preserves voice quality, then repeat enough frozen-input controls to establish reliability before a QA backend change. Do not expand into Realtime or mobile playback changes from this evidence.

### Append-only fidelity experiment (2026-09-18)

Three explicitly authorized direct controls retained the complete deployed persona and appended a sentence requiring exact, complete, non-paraphrased reading. The deployed alias `gpt-4o-mini-tts`, frozen source, `cedar`, speed `1.0`, and AAC were held constant. All three provider responses completed and decoded normally.

Both local recognizers omit every expected ending token from the full audio and final-25-second crop in all three runs. The append-only mitigation is therefore rejected at 3/3: it does not restore the ending and should not be deployed. Persona retention remains a valid product goal, but the next candidate must materially simplify/reorder the instruction prompt rather than merely append a fidelity suffix. Realtime and mobile playback changes remain out of scope.

### Fidelity-first condensed persona execution (2026-09-18)

Three explicitly authorized direct controls tested the materially shorter, reordered instruction while holding the deployed alias, frozen source, voice, speed, and AAC constant. All three responses completed and decoded normally. Both recognizers omit every expected ending token from both full audio and final-25-second crops in all three runs.

This mitigation is also rejected at 3/3. The failure survives both an append-only fidelity requirement and a condensed fidelity-first persona. Current evidence therefore points beyond prompt length/order toward an instructions-present or persona-style generation effect for this frozen text. Before changing QA, the next useful discriminator is repeated no-instructions or minimal style-only controls; do not deploy either failed prompt, switch to Realtime, or change mobile playback.

### Deployed-alias no-instructions gate (2026-09-18)

Three explicitly authorized controls used the deployed `gpt-4o-mini-tts` alias with the same frozen source, `cedar`, speed `1.0`, and AAC, while omitting the `instructions` key entirely. All three responses completed with HTTP 200, decoded successfully, and retained independent completion metadata and response hashes. Both local recognizers omitted `copper`, `meadow`, and `nine`/`9` from both the complete response and final-25-second crop in all three runs.

The strict first-stage gate therefore failed 3/3, so the conditional minimal-style stage was not run. This revises the earlier instruction-only inference: omission also occurs without instructions on the floating deployed alias. The earlier single success without instructions used the pinned `gpt-4o-mini-tts-2025-12-15` snapshot, leaving alias-versus-snapshot behavior and generation variability confounded. No QA prompt should be changed from these results. The next bounded discriminator, if separately authorized, is three repeats of the pinned snapshot with instructions omitted; no deployment, Realtime experiment, or mobile playback change is warranted first.

### Pinned no-instructions repeatability result (2026-09-18)

The separately authorized discriminator ran three valid calls with exact model `gpt-4o-mini-tts-2025-12-15`, frozen source, `cedar`, speed `1.0`, AAC, and the `instructions` property absent. Every response completed with HTTP 200, decoded successfully, and was checked by `base.en` and `small.en` on full audio and an independent final-25-second crop.

Only run 2 recovered `copper meadow nine` in all four checks. In runs 1 and 3, neither recognizer recovered any of the three tokens in either view. The pinned no-instructions configuration therefore fails the strict repeatability criterion: 1/3 passes and 2/3 ASR non-recoveries. The prior one-off recovery was not a reliable snapshot-specific fix, and removing instructions is insufficient to make the result dependable. Do not deploy a prompt-only change from this evidence. Outputs varied across identical requests, leaving stochastic generation or other provider-side variability possible; any next product experiment should address request/content structure or use an explicit completeness/retry strategy rather than further unbounded persona wording variants.

## Next handoff: Gemini 3.1 verified streaming and sacrificial-tail gate (2026-09-18)

The next bounded direction is a provider-only feasibility experiment with `gemini-3.1-flash-tts-preview`, followed only conditionally by a chunked-streaming UX prototype. The worktree-local ignored `.env` now contains `GEMINI_API_KEY`; the key value, authorization material, and request URL/query credentials must never be printed, committed, or retained in artifacts. Credential availability does not itself authorize a provider call, backend/mobile implementation, deployment, merge, push, release, billing change, or physical-device work.

### Evidence boundary and hypothesis

Google's current Gemini Developer API supports streaming TTS through the Interactions API with `stream: true`. Audio arrives as raw PCM deltas, normally 24 kHz, 16-bit, mono. A successful Interactions stream ends with `interaction.completed` and `status: completed`; failed, cancelled, or incomplete statuses are distinct terminal outcomes. If the legacy `streamGenerateContent` route is used for diagnostic parity, require `finishReason: STOP`. HTTP 200, nonempty PCM, a closed connection, or an SSE `[DONE]` marker alone is not completion evidence.

Public Gemini 3.1 reports show partial playable PCM with HTTP 200 and `finishReason: OTHER`, often around 60–70 seconds but sometimes earlier. Google acknowledged reproducing the streaming issue. A sacrificial suffix can protect the real ending only when generation reaches the suffix before an abort; it cannot repair a stream that stops inside the real content. The hypothesis is therefore narrower: bounded segments plus a distinctive expendable suffix, terminal validation, lexical verification, trimming, and retry/fallback can make incomplete or leaked endings operationally rare while retaining reply-level progressive playback.

### Phase 1: provider-only frozen-input experiment

Build a local ignored harness; do not route through the app or QA backend. Use the existing frozen Quiet Room source SHA-256 `13a3ddd146503d36f9b0ae121eee477a6db2cf095246cbb06f891c107731d4b7` only after re-hashing the local file and failing closed on any mismatch. Preserve the known expected ending separately from the prompt. Use one fixed single-speaker voice, one exact persona/director prompt, one API revision, and one endpoint for the measured matrix. Explicitly label the transcript so style directions are not read aloud. Record those choices and their hashes before the first request.

Start with three repeats for each condition:

1. **Control:** frozen transcript without a suffix.
2. **Tail A:** frozen transcript followed by the exact distinctive sentence `Violet window thirteen.`
3. **Tail B:** frozen transcript followed by that exact sentence three times.

The transcript is intentionally long enough to exercise the reported streaming-risk range. Do not expand the initial nine-call matrix after a decisive failure; preserve and analyze it first. A shorter synthetic fixture may be added only to separate basic request/decoder correctness from long-stream behavior, not to replace the frozen-source result.

### Required retained evidence

Create an ignored timestamped provider-control directory. For every attempt retain:

- a redacted request manifest with input/prompt/payload hashes, character/byte counts, endpoint family, API revision, exact model, voice, and start/end timing;
- every ordered SSE/SDK event with credential-bearing fields removed, plus interaction/response ID, resolved model/version when exposed, usage, terminal event/status, and any error metadata;
- HTTP status and a safe allowlist of response headers, never cookies, authorization, API keys, or credential-bearing URLs;
- per-delta timing, MIME, PCM byte count, total chunks/bytes, final duration, and SHA-256;
- concatenated raw PCM and a single WAV wrapper created after concatenation; do not treat arbitrary transport chunks as independent audio files;
- complete and tail analyses from both established local recognizers, including tool/model versions, commands, input hashes, and phrase-presence classifications;
- candidate marker onset, trim sample/time, low-energy/fade decision, trimmed-output hash/duration, and post-trim verification.

### Provider and trimming gates

A provider attempt passes only when all of the following are true:

- Interactions emits `interaction.completed` with `status: completed` and no error, cancellation, or incomplete outcome; a legacy control instead requires `finishReason: STOP`;
- the PCM format is expected and the concatenated body is nonempty, structurally valid, and long enough for the transcript;
- both `base.en` and `small.en` recover the intended real ending from the full audio and an independently derived tail view;
- for tail conditions, both recognizers recover the distinctive suffix after the real ending and provide a usable boundary estimate.

For a tail run, trim the decoded PCM before marker onset at a defensible low-energy sample boundary with a short fade. Re-wrap or re-encode only for playback simulation, decode it again, and require both recognizers to retain the real ending while neither recovers any suffix word. A missing/ambiguous marker is `trim_uncertain`, not success. `OTHER`, missing terminal metadata, partial audio, either recognizer missing the real ending, real speech removed by trimming, or any marker leakage is a failed attempt. Stop and analyze the first decisive failure rather than hiding it with unbounded retries.

Three clean repeats establish only initial feasibility. Even ten clean repetitions cannot justify saying truncation is impossible; production confidence requires fail-closed runtime validation, bounded retries or an alternate-provider/error path, and a broader content/reliability corpus.

### Phase 2: conditional chunked-streaming UX prototype

Begin this phase only if the provider gate demonstrates that the real ending survives and the suffix can be located and removed consistently. Prototype locally before any QA backend change:

1. Split a reply at sentence or short-paragraph boundaries, targeting request durations comfortably below the reported long-stream cliff.
2. Append the verified suffix to each segment and collect its raw PCM without immediately exposing unverified bytes to playback.
3. Validate the terminal outcome, real ending, and marker; trim the marker; then queue only the sanitized segment.
4. Generate and verify the next segment concurrently while the prior verified segment plays, maintaining at least one verified segment ahead when possible.
5. Preserve the same voice and persona across segments, join at natural low-energy boundaries, and assess whether a small crossfade is necessary without duplicating or losing speech.
6. Compare against the current baseline for time to first audible speech, inter-segment gaps, total latency, retries, voice/prosody consistency, complete ending recovery, and zero marker leakage.

This preserves streaming at the reply/pipeline level, but intentionally does not claim byte-immediate playback of unverified provider output. Evaluate a rolling PCM holdback only after the segment-buffered prototype; online recognition necessarily lags playback, and Gemini provides no authoritative transcript boundary for the suffix.

### Stop conditions and deliverable

Stop before UX prototyping if the provider matrix produces a non-completed terminal state, an unrecovered real ending, inconsistent marker detection, unsafe trimming, or unacceptable provider instability. Stop the UX prototype if first-audio latency, joins, retries, or voice discontinuity materially degrade the experience, or if any sacrificial word reaches the rendered output. Preserve the failure and choose the next discriminator rather than broadening the matrix.

The immediate deliverable is a privacy-safe provider summary with exact configuration hashes, terminal outcomes, PCM/timing evidence, both-recognizer results, trim/leak classifications, and a clear pass/fail recommendation for Phase 2. If Phase 2 is reached, add measured emulator evidence distinguishing first-audio latency, continuous playback, retry behavior, and spoken completeness. Update the progress/results documents with actual evidence and limitations. This entry authorizes planning and local credential placement only; provider calls and product implementation remain separate execution steps.

## Gemini 3.1 provider-gate execution result (2026-09-18)

The user separately authorized the bounded paid provider matrix. A local harness now verifies the frozen-source hash, defaults to no-network dry-run, requires two explicit execution flags, uses the API key only in the `x-goog-api-key` header, parses SSE incrementally, retains ordered sanitized events plus concatenated PCM/WAV, and stops on the first decisive terminal or format failure. Offline analysis uses the existing local `faster-whisper==1.1.1` `base.en` and `small.en` models without an expected-phrase prompt, derives an independent final-25-second view, and has fail-closed marker alignment, low-energy trim, fade, and leakage gates. Twenty focused tests pass.

The first control call used source SHA-256 `13a3ddd146503d36f9b0ae121eee477a6db2cf095246cbb06f891c107731d4b7`, prompt SHA-256 `3cb37c26fc573e7a86c80063f7f37ebe5b5b1305e54ae1cd70ac6c82f4973e69`, payload SHA-256 `149ce043e09672afabced433654eace2cbdc9a1521d1c3378b7e18db475e27d6`, model `gemini-3.1-flash-tts-preview`, voice `Kore`, and API revision `2026-05-20`. It returned HTTP 200 and 2,283 `audio/l16` deltas totaling 4,383,360 bytes of valid 24 kHz, 16-bit, mono PCM (91.32 seconds), but the stream closed without `interaction.completed` or any other terminal event. Both recognizers omitted `copper`, `meadow`, and `nine`/`9` from both the complete partial audio and its independent tail view.

This is a decisive `provider_failed` / `ending_missing` result under the predeclared gate. The harness therefore stopped after one of the planned nine calls; Tail A, Tail B, trimming, and the conditional Phase 2 UX prototype were not run. HTTP 200 and playable PCM are not treated as completion. The result directly exercises the reported partial-stream risk and shows that a sacrificial suffix cannot help when generation stops before the real ending. No QA/backend/mobile change, deployment, merge, push, release, or physical-device work was performed.

## User-authorized Phase 2 exception and result (2026-09-18)

The user explicitly authorized one bounded Phase 2 segmented attempt despite the failed whole-source gate, to test whether shorter generations avoid the long-stream failure. This exception remained provider-only and did not authorize backend or mobile integration. The frozen 1,865-character source was split at natural boundaries into six segments of 362, 361, 181, 384, 262, and 306 characters. Each request retained the same model, voice, API revision, raw-PCM format, and exact expendable suffix; the runner was configured to stop on the first non-2xx response, conflicting or missing terminal outcome, malformed PCM, ending failure, or marker failure.

The first 362-character request returned HTTP 200 and 1,272,960 bytes of valid 24 kHz mono PCM (26.52 seconds) in 663 audio deltas. First audio arrived at 857.143 ms, but the stream ended after 9.126 seconds of wall time without `interaction.completed` or any other terminal event. Its 666 events comprised one `interaction.created`, one `interaction.status_update`, one `step.start`, and 663 `step.delta` events. The runner therefore stopped after one paid call; the remaining five segments were not requested.

As a diagnostic only, both local recognizers examined the unverified full PCM and an independently derived final-12-second view. Neither `base.en` nor `small.en` recovered the segment's expected ending or the suffix in either view. The strict result is `provider_failed` / `segment_sequence_incomplete`, and the PCM remains ineligible for playback. Chunking reduced first-audio latency and request size, but did not avoid the same missing-terminal/semantic-omission failure even for a 362-character segment. No concatenation, playback simulation, QA/backend/mobile change, deployment, merge, push, release, or physical-device work was performed.


## Next handoff: validate Gemini completion and compare delivery modes (2026-09-18)

Continue in the existing implementation worktree, preserving its uncommitted scripts, tests, and findings. This entry follows review of both retained Gemini failures and 49 passing focused tests. The immediate objective is to distinguish a streaming-delivery failure from a generation/input problem before integrating Gemini into the app. Keep physical-device testing as a last resort; it is not needed for this discriminator. Use Luna for bounded test/evidence reviews while the primary agent owns execution and interpretation.

### Evidence to preserve

- Whole-source control: 91.32 seconds of PCM, HTTP 200, no terminal event, and neither local recognizer recovered the intended ending. Evidence: `artifacts/qr-mob-021/gemini-provider-control/20260918T201807084Z-matrix/01-control/`.
- First short segment: 362 characters, 26.52 seconds of PCM, HTTP 200, no terminal event, and neither recognizer recovered the real ending or expendable suffix. Evidence: `artifacts/qr-mob-021/gemini-segment-pipeline/20260918T204833520Z-segments/segment-001/`. The remaining five segments were never requested.
- Review independently matched both PCM hashes and the stored event counts. No terminal exists in either parsed event log. This establishes failed end-to-end attempts, not a definitive provider-model diagnosis: the retained logs are parsed events, not an independent raw-wire capture.
- Read-only retrieval of both retained interaction IDs returned HTTP 404 / `not_found`. Preserve this as unavailable server-side evidence, not proof of either completed or failed generation. Review summaries are under `artifacts/qr-mob-021/gemini-review-20260918/`.
- The short request's 857 ms is time to the first received audio delta. It is not time to verified audible playback. No successful marker trim, complete segment sequence, or Gemini emulator playback has been demonstrated.

### 1. Repair acceptance and measurement before more provider spend

Make local changes and run offline tests first. These defects do not explain the already-recorded missing terminal events, but would undermine future success claims or stopping rules.

1. Share one strict provider acceptance implementation across the whole-source and segment runners/analyzers. Require HTTP 2xx, exact `interaction.completed` with status `completed`, valid expected PCM, and no conflicting failure/error/cancellation/incomplete event anywhere in the stream. For non-streaming responses, validate the returned interaction object's completed status instead of requiring an SSE event. Reject `step.completed`, unknown completion-like names, or a later success overwriting an earlier failure. Add regression cases for HTTP 500 plus plausible audio/completion, failed-then-completed, missing terminal, and conflicting format deltas.
2. Verify the real ending as an ordered contiguous lexical phrase in the appropriate final region, with explicit numeric/punctuation normalization. Earlier scattered occurrences of `copper`, `meadow`, and `nine` must not certify a missing ending. Test earlier-occurrence and reordered-word negatives. Keep full and independently cropped tail views from both recognizers; do not prompt recognition with the expected text.
3. Require a contiguous suffix after the real ending, agreement between recognizers on order/boundary, and a defensible trim point. Test separated marker words, repeated markers, absent markers, trimming into real speech, and leaked suffix fragments. Marker vocabulary must not collide with the source: detect collisions before a paid request, and record any deliberately selected replacement. Do not weaken leakage checks merely to make a run pass.
4. Connect per-segment completion, lexical, and trim verification to the execution loop. A semantic failure must stop subsequent ordinary segment requests, not be discovered only after the entire paid sequence has been generated. The two-arm diagnostic comparison below is an explicit exception to that ordinary stop rule.
5. Record generation start, first delta, response completion, full/tail ASR durations, trimming/re-encoding, post-trim verification, queue readiness, and actual audible start separately. Remove the implicit zero-verification-time assumption from UX acceptance. Simulations may remain as clearly labeled estimates, but must include measured per-segment verification time and the proposed worker/concurrency limits.
6. Preserve partial evidence on read errors, timeout, or cancellation. Add explicit bounded request timeouts and record the local abort reason separately from provider status. Capture parser fixtures with split network chunks, CRLF, and a final event without a trailing blank line. Keep requests and retained events credential-safe; no URL query keys or authorization values in artifacts.

Run all `tests/geminiTts*.test.mjs`, dry-run both harnesses without credentials/network, and run `git diff --check`. Review the new negative tests before running the paid comparison. Passing unit tests establish harness behavior, not provider reliability.

### 2. Run a bounded official-SDK delivery-mode comparison

Use Google's supported SDK as an independent client control. Pin and record its installed version and the supported API revision. Confirm request fields against the current official [TTS documentation](https://ai.google.dev/gemini-api/docs/speech-generation) and [Interactions streaming contract](https://ai.google.dev/gemini-api/docs/streaming). Keep this dependency/tooling isolated from the mobile runtime.

Recover the exact first 362-character segment and suffix from the ignored prior run. Verify its segment hash against the original manifest and the parent frozen-source SHA-256 `13a3ddd146503d36f9b0ae121eee477a6db2cf095246cbb06f891c107731d4b7`. Use the same prompt, model `gemini-3.1-flash-tts-preview`, voice `Kore`, suffix, and exposed generation settings for both arms. Record the effective serialized request and hashes with credentials excluded. If the SDK cannot reproduce the API revision or settings, document that incompatibility before spending; do not silently change model, prompt, or voice.

The initial diagnostic budget is exactly two new generation requests, with automatic SDK generation retries disabled or explicitly accounted for within that budget:

- **A — streaming:** collect every ordered event and audio delta through the official SDK, plus final status/error and timing.
- **B — non-streaming:** request the same content with streaming disabled and retain the complete returned interaction/audio and status. Change only delivery mode where the API permits.

Finish the two-arm comparison even if A has a missing terminal or ending; that failure is the reason for B. Stop instead on invalid credentials, billing/permission errors, incompatible request/schema, rate limiting, or an inability to preserve evidence. Do not substitute extra retries or an unrelated short prompt. These are separate stochastic generations: compare completeness and settings, not waveform equality across A and B.

For each arm retain locally the input/prompt/payload hashes, model/version when exposed, voice, SDK/revision, safe response metadata, interaction ID, completion/error, usage when available, PCM format/hash/duration, full and tail ASR, and suffix trim/post-trim checks. Parse non-streaming output according to the documented schema and preserve ordered audio content without dropping blocks or duplicating a convenience output field. An HTTP success or playable file alone does not pass.

Where available, retrieve an existing interaction immediately after a missing-terminal result to inspect its status; record unavailable/404 responses without treating them as generation failures. Do not assume stream resumption works for this TTS mode merely because another Interactions feature documents it.

### 3. Decide from the pair, then confirm only the viable mode

| Result | Interpretation and next action |
| --- | --- |
| A fails; B passes completion, endings, and safe trimming | Supports a streaming-path-specific problem for this pair. Confirm B before considering a segment-buffered pipeline; do not claim the model is universally reliable. |
| Both pass | The older failure remains intermittent or client/path-dependent. Select a mode using verified-ready latency and implementation complexity, not first-byte latency alone. |
| A passes; B fails | Preserve the asymmetry and inspect response handling/settings. Only A is a candidate for bounded confirmation. |
| Neither passes | Stop Gemini integration work. Identify whether failure is terminal/transport, lexical, or trimming; prepare evidence for provider investigation or a separately scoped alternative. Do not keep shrinking segments or changing prompts in an unbounded search. |

If one mode passes all gates, allow at most two additional identical requests to that mode, stopping at the first failure. Together with its initial arm, three clean observations establish limited feasibility only. The entire initial pair plus confirmation budget is at most four new generations. A different model, prompt, suffix, or API revision is a new experiment, not a hidden retry. Record current cost assumptions and the request cap before execution; use existing explicit authorization only if it covers this new matrix. This documentation edit itself does not initiate or authorize paid generation.

### 4. Conditional emulator prototype: verified complete segments

Only proceed after the selected mode's completion, ending, and trimming gates pass. First specify the additional six-segment generation budget and local implementation scope; do not count those calls as part of the four-call discriminator. No QA deployment is needed to evaluate the local prototype.

For a viable non-streaming mode, each short segment may be generated as a complete response, verified and trimmed, then queued while the next segment is generated. This preserves progressive playback across the reply; it does not provide immediate playback of the first unverified provider bytes. A viable streaming mode must likewise hold each segment until verification passes. Never expose the expendable suffix while awaiting recognition.

Build the smallest local/QA-only emulator path compatible with the existing normal voice-button ownership, cancellation, and cleanup behavior. Keep production routing unchanged. Show the frozen full reply playing in order with no missing/duplicated segments or audible marker, and exercise a failed middle segment and cancellation so later segments cannot leak through. Failed verification must produce the declared bounded retry/error behavior; do not silently skip text.

Measure first verified audible speech, per-segment ready/play times, gaps, total generation/verification time, queue depth, cancellation, and joins against an explicitly recorded current baseline. Set the first-audio acceptance budget before the run; the existing 30-second simulation ceiling is not evidence of acceptable UX. Preserve the existing clean-join target of at most 250 ms between segments, reporting larger gaps separately rather than masking them. Require playback of an earlier verified segment before generation of the final segment completes. Assess joins/prosody with retained emulator audio in addition to ASR; lexical correctness alone cannot establish natural speech continuity.

Stop if verification cost defeats the first-audio budget, the queue repeatedly empties, a real ending is lost, a marker leaks, or cancellation fails. No physical-device escalation follows automatically.

### Deliverable and scope

Update progress/results with actual commands, source/configuration hashes, exact request count, terminal outcomes, both-recognizer findings, trim/leak checks, measured verification overhead, and a clear proceed/stop recommendation. Separate offline harness tests, provider generation, simulated timing, and actual emulator playback. Keep partial/failed attempts visible and raw text/audio/transcripts ignored.

Complete the authorized local harness work before seeking any missing provider-call approval, so the request is a concrete bounded experiment. This handoff does not authorize deployment, QA/production routing changes, merge, push, release, or physical-device work. Do not declare the original voice-ending bug fixed from a provider feasibility sample.

### Official-SDK delivery comparison result (2026-09-19)

The handoff is implemented and the separately authorized initial comparison is complete. Before provider spend, the shared strict acceptance/PCM implementation, incremental SSE parser, lexical and marker gates, segment-loop semantic stop, measured verification timing, bounded timeouts, partial-evidence handling, marker-collision checks, and official-SDK runner were covered by 72 passing focused tests. Type checking, both no-network dry runs, and `git diff --check` passed. The official client was isolated at `@google/genai@2.23.0` with API `v1beta`, revision `2026-05-20`, retries disabled, and a 120-second timeout. Luna's final bounded review found no launch blocker and noted that HTTP success is SDK-mediated: the SDK throws HTTP failures, so the harness does not independently retain a raw HTTP status.

Exactly two new generation requests used the frozen 362-character segment and unchanged prompt/model/voice/settings. Streaming returned an exact `interaction.completed` / `completed` terminal, 801 ordered PCM blocks, 1,537,920 bytes (32.04 seconds), first delta at 987.726 ms, and total generation time 13,378.720 ms. Non-streaming returned a completed interaction with one ordered audio block, 1,367,040 bytes (28.48 seconds), ready at 14,460.358 ms. Both local recognizers recovered the real segment ending as one contiguous occurrence in the final region from both the full audio and independent tail view in both arms.

Neither recognizer recovered any of the three suffix tokens in either view for either arm. Both arms therefore failed closed as `trim_uncertain` / `marker_missing_or_unusable`; no trim, post-trim release, confirmation request, or emulator prototype was attempted. Verification took 9,360.346 ms for streaming and 7,289.906 ms for non-streaming. Reported usage totaled 290 input text tokens and 2,514 output audio tokens, approximately $0.05057 at the recorded pricing assumption, above the pre-run estimate because the two outputs were longer or more highly tokenized than that estimate assumed.

This pair shows that official-SDK streaming and non-streaming can both expose completed interactions and preserve the real short-segment ending, but neither satisfied the declared safe-suffix gate. It does not isolate the older missing-terminal failures as a deterministic delivery-mode defect, and it does not establish a viable segment-buffered product path. Per the decision table, stop Gemini integration work rather than spend the optional confirmation budget or proceed to emulator integration. Evidence is retained under `artifacts/qr-mob-021/gemini-sdk-delivery-comparison/20260919T131746681Z-official-sdk/`. No QA/backend/mobile routing change, deployment, merge, push, release, or physical-device work occurred.


## Next handoff: remove the spoken-suffix prompt conflict (2026-09-19)

Continue in the existing implementation worktree and preserve all earlier uncommitted changes and evidence. This is a narrow prompt-control experiment, not authorization to integrate Gemini or relax verification. Use Luna for bounded prompt/test and evidence reviews; the primary agent should freeze the experiment, reconcile returned findings, and own the final decision. Physical-device testing is not needed.

### Why this changes the next step

The latest official-SDK pair completed successfully in both streaming and non-streaming modes. Independent review of all four full-audio transcripts (`base.en` and `small.en` for each arm) found exactly the real segment's 59 normalized tokens, in order, with no additional or missing tokens. Both full and tail views recovered the real ending, but neither recovered the suffix. This is semantic evidence of complete source-only speech, not evidence that a generated suffix was clipped.

The retained prompt explains a plausible confound: `scripts/run-gemini-tts-segment-pipeline.mjs` says to read **only** text between `BEGIN SEGMENT` and `END SEGMENT`, then puts `EXPENDABLE SUFFIX: Violet window thirteen.` outside those delimiters while separately asking for it to be spoken. The official-SDK runner deliberately reused that exact prompt. Compliance with the first instruction could explain the missing suffix. This is a hypothesis to test, not proof of model behavior.

Keep the earlier `trim_uncertain` classifications intact: rejecting those outputs was correct under the declared gate. The inference to revise is that this pair establishes the suffix strategy as unworkable. Neither mode has demonstrated safe trimming, and neither is ready for integration.

### 1. Implement one unambiguous spoken script, offline first

Retain the same 362-character source segment and exact suffix. Put both inside one spoken-text region, with all directions outside it. Use this initial prompt shape:

```text
Read every word between BEGIN SPOKEN TEXT and END SPOKEN TEXT aloud, in order, in one consistent, calm, single-speaker voice. Do not read the delimiter labels.
BEGIN SPOKEN TEXT
{exact frozen segment text}
Violet window thirteen.
END SPOKEN TEXT
```

Do not label the suffix as expendable in the model's spoken script or give a separate instruction that excludes it from what should be read. Keep segment index, total count, source boundaries, expected real ending, and trim-marker metadata in the local manifest rather than inside spoken text. Preserve the frozen source bytes; explicitly record the separator inserted before the suffix and the resulting spoken-script hash.

Update the shared segment prompt builder and the official-SDK experiment entry point together. The SDK runner currently reads and pins the old artifact's prompt hash: changing only the builder would leave the paid comparison using the contradictory prompt. Keep historical artifacts immutable. Give the corrected experiment an explicit prompt version and new expected prompt/payload hashes; retain separate parent-source, real-segment, and complete-spoken-script hashes. Do not replace a hash check with acceptance of any caller-supplied prompt.

Required offline checks:

- The exact real source and suffix each occur once inside the single spoken region, in that order; no suffix or spoken-only content sits outside it.
- The prompt cannot contain conflicting old delimiters or instructions. Reject delimiter collisions in source/marker text and retain the existing marker-vocabulary collision check.
- Both delivery arms use the corrected pinned prompt and differ only in streaming mode. The dry-run exposes version/hashes/settings/request budget without loading credentials or touching the network.
- Existing completion, HTTP/error, PCM, lexical ordering, marker boundary, post-trim leakage, partial-evidence, timeout, and paid-request-cap tests still pass. Add a regression specifically covering the old outside-delimiter layout and SDK reuse of a stale prompt artifact.

Run `node --test tests/geminiTts*.test.mjs`, type checking, the relevant no-network dry runs, and `git diff --check`. Have a bounded reviewer inspect the actual corrected prompt and dry-run manifest before execution. Do not infer provider success from offline tests.

### 2. Run the corrected two-arm experiment only within covered authorization

This is a new prompt condition, not one of the previous unchanged-prompt confirmation runs. Prepare the runnable command, exact request cap, configuration hashes, timeout, and updated cost estimate before obtaining any missing authorization. Prior requests must not be silently treated as approval for additional spend. This plan edit makes no provider calls.

Once this new matrix is explicitly covered, make exactly two generation requests through the existing isolated `@google/genai@2.23.0` client: streaming first, then non-streaming. Keep `gemini-3.1-flash-tts-preview`, `Kore`, API `v1beta`, revision `2026-05-20`, the real segment, suffix, and exposed generation settings unchanged. Keep retries disabled and the 120-second timeout. The prompt change is the intentional experimental difference from the retained September 19 pair; record it as such. If compatibility requires another change, stop and document it rather than introducing another variable silently.

Complete arm B after an ordinary completion/lexical/marker failure in A, because the pair is the discriminator. Stop on invalid credentials, permission/billing/rate-limit errors, incompatible schema, or failure to preserve evidence. Retain every attempted request, including partial output. Do not perform automatic prompt edits, regenerate until a favorable sample appears, or launch the six-segment sequence.

Retain the same privacy-safe manifests, ordered audio/events, completion and error metadata, interaction ID, SDK-mediated HTTP-success caveat, usage, PCM hashes, and timing as the preceding comparison. Do not expect waveform equality between separate stochastic generations. Historical and corrected prompt samples must remain independently identifiable.

### 3. Verify source, suffix, trimming, and release separately

For each arm, require all of these stages before marking audio eligible:

1. **Provider completion:** exact completed status with no conflicting error and valid expected PCM. Keep the streaming and non-streaming completion contracts distinct.
2. **Real-source fidelity:** both local recognizers recover the contiguous real ending in full and independently cropped tail views. Also compare the full recognized token sequence with the entire real segment, not just its last words. Freeze normalization rules before inspecting the new result; preserve mismatch details privately and mark ambiguous recognition inconclusive rather than silently tolerating missing content. Do not provide expected words as ASR hints.
3. **Suffix evidence:** both recognizers locate one contiguous `Violet window thirteen` (with the predeclared numeric normalization) after the real ending, with compatible boundary estimates. Missing or ambiguous suffix remains `trim_uncertain`; completion and a correct real ending do not waive this stage.
4. **Safe trim:** remove the suffix at the established low-energy sample boundary, retain the trim/fade decision and output hash, then decode and transcribe the trimmed output again. Both recognizers must preserve the real source/ending, and no suffix fragment may remain. A trim that removes real speech or lacks a defensible boundary fails.

If a marker is absent again, first verify the exact corrected request was sent and preserve the result. Do not claim that suffix audio was generated and lost merely because its text was in the request. Conversely, a suffix present in the raw source but missing only after playback is a different failure and requires same-response capture evidence.

### 4. Use explicit stop and confirmation rules

| Corrected pair result | Next step |
| --- | --- |
| At least one mode passes every stage | Select one mode using measured verification-ready time and implementation complexity; at most two identical confirmation generations may follow if that budget is covered. Stop at the first failure. |
| Real source is complete but suffix remains missing/ambiguous in both | Stop this marker-based design. Do not integrate it or reinterpret absence as a successful trim. A marker-free or different-marker approach would require a separately designed experiment and new acceptance criteria. |
| Real source is incomplete, provider completion fails, or safe trim fails in both | Preserve the specific failure boundary and stop; do not expand into unbounded prompt tuning. |

The maximum budget for this prompt condition is four generations: the initial pair and two confirmations of one qualifying mode. Three clean observations of that mode establish limited feasibility only, not production reliability. A repeated success must include post-trim fidelity and zero leakage, not merely successful synthesis. Preserve earlier failures in the report.

### 5. Treat latency as an independent feasibility gate

The preceding local pair spent approximately 22.739 seconds (streaming) and 21.750 seconds (non-streaming) in generation plus verification before rejection. These are measured local diagnostic-path costs, not intrinsic provider latency or actual audible-start measurements. No trim/post-trim release occurred, so a successful verification path can incur additional work.

For corrected runs, retain timings for generation, first received delta, full/tail ASR, alignment, trim/re-encoding, post-trim ASR, and verified-ready time. Do not headline sub-second first-byte latency as the buffered design's startup latency. Separate the comprehensive offline validation suite from any proposed runtime verifier, and measure any proposed faster verifier independently.

Use retained audio for local profiling before paying for more generations. Parallelizing independent recognition work or reusing decoded PCM may be evaluated without weakening gates; report actual wall time and resource contention. Do not remove a recognizer, skip post-trim validation, or assume zero verification cost just to meet a latency target. Any changed runtime verifier needs deliberate missing-ending, marker-leak, and bad-trim negative controls.

Even after prompt/trim confirmation succeeds, do not launch emulator integration automatically. First state an explicit first-audio budget against the existing baseline and demonstrate a credible verification-ready path to it. The previously specified emulator sequence, cancellation/middle-segment failure checks, maximum 250 ms clean-join target, and requirement to start playback before final-segment generation completes remain the later gates. Additional generation for that prototype has a separate budget. Physical hardware remains unnecessary at this stage.

### Deliverable and scope

Append actual results to the progress/results documents: corrected prompt version and hashes, exact request count, per-arm provider/source/marker/trim outcomes, full-source token comparison, measured timing breakdown, repeatability count, and proceed/stop decision. Preserve raw transcripts, source text, and audio in ignored local artifacts. Distinguish the prompt-conflict hypothesis from what the corrected experiment demonstrates.

Only local preparation and the separately authorized bounded provider experiment belong to this handoff. No QA/backend/mobile routing change, deployment, merge, push, release, or physical-device run is authorized by this documentation request. Keep the original issue open until a relevant complete-reply before/after comparison passes.

### Corrected-prompt offline preparation result (2026-09-19)

The local preparation portion is implemented without making a provider request. Prompt version `single-spoken-region-v2` deterministically places the unchanged 362-character segment, one LF separator, and `Violet window thirteen.` inside a single `BEGIN SPOKEN TEXT` / `END SPOKEN TEXT` region. Directions remain outside that region. The builder rejects current and historical delimiter labels in source/marker text and rejects marker-vocabulary collisions. The historical ignored prompt artifact remains unchanged and is no longer read by the SDK comparison.

The frozen identities are parent source `13a3ddd146503d36f9b0ae121eee477a6db2cf095246cbb06f891c107731d4b7`, segment `f2a5b6a925dc1b8ac2d9a953c61a12f6c49e3ee0af0bfbdb14bd0782e55d42b7`, complete spoken script `b50552cef23605da7757bc890b06f76881360f0f387eef3f8dc3bd49b39de6f4`, and prompt `1093c966ca7f3847bd660d309bf0cdf5bfde597316bf4b9c31eae8ae4145979d`. The shared serialized payload hashes are `f9321d65559bd7ac4a74f21fa334f5e752cc5da7fa78b207c1656df752982c31` for streaming and `f63f1fe725b9aa69447563d36e5a5983b048f69dfa94ddb7d0dfc858a6bd8cd4` for non-streaming; only the `stream` boolean differs.

The official-SDK path now validates those identities even when a caller supplies a segment object, before credential loading or SDK construction. The segment and SDK runners share the corrected prompt/payload builders. Privacy-safe per-segment metadata records index/total, normalized lexical source boundaries, expected-ending hash/count, marker hash/count, separator, prompt version, and hashes without placing private source text in manifests. Offline analysis now compares both full recognizer outputs against the entire normalized source sequence, requires the marker immediately after that source, and requires exact source fidelity again after trimming in addition to the existing ending/leakage gates.

All 78 focused Gemini tests pass, including old-layout, stale injected prompt, delimiter/marker collision, full-source mismatch, segment-level marker timing, provider terminal, trimming, leakage, timeout, partial-evidence, and two-arm request-cap regressions. Type checking, SDK and segment no-network dry runs, and `git diff --check` pass. Both dry runs report zero network calls. The prepared paid command remains:

```bash
node scripts/run-gemini-tts-sdk-delivery-comparison.mjs \
  --execute --confirm-paid-provider-call
```

Its cap is exactly two new generations, streaming then non-streaming, with retries disabled and a 120-second timeout. Using the preceding pair's reported usage gives a current estimate of approximately $0.05057. No paid request was made during this preparation because the new prompt condition requires separate explicit coverage under this handoff.

### Corrected-prompt two-arm execution result (2026-09-19)

The user explicitly authorized the frozen initial pair. Exactly two new generations ran through `@google/genai@2.23.0`, streaming first and non-streaming second, with retries disabled and no additional generation. Both returned completed provider status and valid 24 kHz mono PCM.

Streaming produced 1,574,400 PCM bytes (SHA-256 `a426afb04b8e97335c2408810b31a36699b24062add1bc7535b54f52907d20c1`, 32.8 seconds), first audio at 814.865 ms, and completed in 11,976.588 ms. Both recognizers recovered all 59 normalized source tokens exactly from full audio and recovered the real ending from full and tail views. Neither recovered any suffix token in either view. Its corrected outcome is therefore `trim_uncertain` / `marker_missing_or_unusable`; no trim was attempted.

Non-streaming produced 1,895,040 PCM bytes (SHA-256 `31df4c210dbf46a66a9acf469760abbf7659888bbf40f55011420b4f339c4585`, 39.48 seconds) and completed in 19,697.982 ms. Both full recognizers recovered exactly the 59 source tokens followed by the three suffix tokens. Both tail views recovered the real ending followed by the suffix. Segment-level marker onsets were 35.8, 36.54, 36.48, and 36.52 seconds; their 0.74-second spread was within the frozen 0.75-second tolerance. The low-energy cut was at sample 837,239 / 34.884958 seconds. The sanitized WAV SHA-256 is `3f2242fc017bcf4cbfa494f725be9901ffd9f562570457206788fb0c1dfe62fd`. Both post-trim recognizers recovered exactly all 59 source tokens and no suffix fragment.

The initial analysis incorrectly folded an absent marker into the source-fidelity classification and treated a whole-transcript timestamp as a marker onset. Those outputs remain preserved. A tested offline correction now keeps source and marker failures separate and uses only a sentence/segment consisting exactly of the marker as a segment-level onset. Re-analysis of the same retained bytes added zero provider calls. Non-streaming passes provider, entire-source, ending, marker, trim, post-trim source, and leakage stages, but measured generation plus verification reached 33,073.676 ms before simulated readiness (19,697.982 ms generation plus 13,375.694 ms verification). It therefore fails the existing diagnostic 30-second timing ceiling; no actual audible start was measured and that ceiling is not adopted as a product budget.

The prompt-conflict hypothesis is supported for the non-streaming sample because the corrected request produced the suffix where the contradictory prompt did not. Streaming still omitted it, so the strategy is not delivery-mode independent or confirmed repeatable. No confirmation generation was authorized or attempted. No emulator, six-segment sequence, product integration, routing change, deployment, merge, push, release, or physical-device work occurred. The retained evidence root is `artifacts/qr-mob-021/gemini-sdk-delivery-comparison/20260919T135613542Z-official-sdk-prompt-v2/`.
