# QR-MOB-021 TrackPlayer streaming results

Date: 2026-09-09

This is bounded emulator evidence for the frozen fixture plus one exact-byte live QA TTS capture and replay. It is not a product-fix or root-cause report.

## Environment and method

- Worktree: `quiet-room-mobile-qr-mob-021-trackplayer-streaming-implementation`, branch `codex/qr-mob-021-trackplayer-streaming-implementation`, starting from plan commit `15bbea006458eaef1543203b083e707777fa7d4e`.
- QA/local Android build using TrackPlayer `4.1.2`, Detox `android.emu.release`, AVD `Pixel34AVD_2`, Android API 34, arm64-v8a, serial `emulator-11350`.
- Frozen fixture: 254,581 bytes, SHA-256 `888d4c1dae1ef1fadb3c850b5bf886bb6bb0833cdbb91e15713d5ebb899295fa`.
- Server requests, chunk timing, terminal status, and Detox/device output were joined with run/attempt IDs by `scripts/collect-voice-stream-run.mjs`.
- `scripts/check-voice-playback-capture.mjs` decodes the emulator recording and compares RMS envelopes using timestamp-preserving silence calibration, local closing alignment, and gain-normalized closing energy. The complete-file and deliberate-truncation controls validated the classifications.

## Representative matrix

All listed fixture E2E runs passed 1/1; the complete-file and deliberate-truncation rows are capture controls with their server logs. `align` is full normalized envelope alignment; `closing` is the local final-speech score.

| Shape | Run manifest or server log | Capture | Checker result (`align` / `closing`) |
| --- | --- | --- | --- |
| Complete-file control | `artifacts/qr-mob-021/20260909T212021Z-complete-file-control/fixture-server.log` | `artifacts/qr-mob-021/complete-file-control-capture/emulator.webm` | `complete` (0.8397 / 0.9750) |
| Deliberate truncation control | `artifacts/qr-mob-021/20260909T212117Z-truncated/fixture-server.log` | `artifacts/qr-mob-021/truncated-capture/emulator.webm` | `audible-tail-missing` (0.7796 / 0.00333) |
| Steady, first | `artifacts/qr-mob-021/20260909T211744Z-steady/fixture-server.log` | `artifacts/qr-mob-021/final-paced-capture/emulator.webm` | `complete` (0.8858 / 0.8374) |
| Steady, repeat | `artifacts/qr-mob-021/20260909T213019Z-steady/run-manifest.json` | `artifacts/qr-mob-021/steady-repeat-capture/emulator.webm` | `complete` (0.9748 / 0.9709) |
| Delayed tail 250 ms | `artifacts/qr-mob-021/20260909T213602Z-delayed-tail-250/run-manifest.json` | `artifacts/qr-mob-021/delayed-tail-250-capture/emulator.webm` | `complete` (0.9766 / 0.9903) |
| Delayed tail 750 ms, first | `artifacts/qr-mob-021/20260909T213659Z-delayed-tail-750/run-manifest.json` | `artifacts/qr-mob-021/delayed-tail-750-capture/emulator.webm` | `inconclusive` (0.6425 / 0.9865) |
| Delayed tail 750 ms, repeat | `artifacts/qr-mob-021/20260909T214234Z-delayed-tail-750/run-manifest.json` | `artifacts/qr-mob-021/delayed-tail-750-repeat-capture/emulator.webm` | `complete` (0.8440 / 0.7794) |
| Delayed tail 1500 ms | `artifacts/qr-mob-021/20260909T212747Z-delayed-tail-1500/run-manifest.json` | `artifacts/qr-mob-021/delayed-tail-1500-capture/emulator.webm` | `complete` (0.9707 / 0.9652) |
| Chunk schedule A | `artifacts/qr-mob-021/20260909T213758Z-chunk-schedule-a/run-manifest.json` | `artifacts/qr-mob-021/chunk-schedule-a-capture/emulator.webm` | `complete` (0.9546 / 0.9827) |
| Chunk schedule B, first | `artifacts/qr-mob-021/20260909T213856Z-chunk-schedule-b/run-manifest.json` | `artifacts/qr-mob-021/chunk-schedule-b-capture/emulator.webm` | `inconclusive` (0.6503 / 0.9922) |
| Chunk schedule B, repeat | `artifacts/qr-mob-021/20260909T214331Z-chunk-schedule-b/run-manifest.json` | `artifacts/qr-mob-021/chunk-schedule-b-repeat-capture/emulator.webm` | `complete` (0.9769 / 0.9960) |
| Normal EOF, immediate | `artifacts/qr-mob-021/20260909T213952Z-normal-eof-immediate/run-manifest.json` | `artifacts/qr-mob-021/normal-eof-immediate-capture/emulator.webm` | `complete` (0.9868 / 0.9030) |
| Normal EOF, delayed | `artifacts/qr-mob-021/20260909T214046Z-normal-eof-delayed/run-manifest.json` | `artifacts/qr-mob-021/normal-eof-delayed-capture/emulator.webm` | `complete` (0.8282 / 0.9876) |

Every delivery shape has at least one capture classified `complete`. The two first-pass capture-quality inconclusives (delayed-tail-750 and chunk-schedule-b) were resolved by repeat; they were not treated as product failures.

## Conclusion and limits

No clipping was reproduced in the two steady captures or the delayed-tail-1500 capture, and the other tested progressive/EOF shapes also have at least one complete capture. This raises confidence that the instrumented TrackPlayer path consumed the frozen fixture across these representative delivery schedules.

For this frozen-fixture matrix alone, root-cause confidence remained low. The matrix is one pass per delivery shape with two repeats, not the full repetition counts in the investigation plan. The result is therefore evidence for the next investigation step, not a product fix, production-readiness claim, or explanation of the reported field behavior.

## Updated detector and live QA comparison

Checker schema v2 adds a separate final-speech window. It detects final-word removal and 250/500/750 ms speech loss while the capture continues through two seconds of silence; the intact and gain/alignment controls remain complete. Rechecking the table above preserves every result except delayed-tail-750 repeat, now `inconclusive` rather than `complete` because ending shape correlation is low while ending energy is intact.

One authenticated QA TTS response was captured from the same streamed GET through a local tee: AAC mono 24 kHz, 136,189 bytes, SHA-256 `004e929896aba2bcf0c523fbaf3ceb82a33502e1c0fcaba8b9f53402d03a7548`. The tee observed HTTP 200 `audio/aac`, nine chunks, and upstream HTTP exhaustion without client cancellation. The emulator capture classified `complete` (alignment `0.9932`, closing `0.9898`, ending `0.9949`). The path was changed by the local proxy, and backend provider-internal exhaustion was not instrumented.

Byte-identical complete-file and recorded-schedule replays both passed and classified `complete`. A progressive stress held 50,000 tail bytes for seven seconds; playback began almost eight seconds before final delivery, the final release occurred within the bounded last one-to-two seconds of the pre-release buffer, native queue end completed, and the repeat capture classified `complete` with ending score `0.99995`. An eight-second silent network gap instead triggered native cancellation/retry just before the final release, identifying an idle-timeout boundary but not reproducing the reported clipping.

No realistic emulator failure was captured, so no playback fix was implemented. Physical-device/output-route uncertainty remains. Exact run IDs, commands, hashes, timing, and artifact paths are in `docs/qr-mob-021-trackplayer-streaming-progress.md`.

## 2026-09-10 emulator-only source and lifecycle follow-up

The historical saved assistant text was recovered read-only and did contain the requested ending: 220 Unicode characters, SHA-256 `c5f3f5d6012cbb2f26f90d80144040ed6bdf8d9c669c6d9e4091a63b91d5ad4d`. The retained 136,189-byte AAC ending still matches its emulator rendering, but the generated audio's words were not independently transcribed because no local speech model was available. Its lexical completeness remains `inconclusive`.

Four fresh long direct-QA observations reached native queue end. Three have full playback recordings: 116.296 seconds (`target`), 115.220 seconds (`target`), and 124.913 seconds (`long`, 4.913 seconds outside the target). Read-only QA lookup matched every app-emitted source hash/count and confirmed the requested ending. The first 127.442-second observation is timing-only because its recording started before login and hit the emulator's 180-second cap before playback ended. Direct mode retained no response bytes, so these are normal-path completion observations rather than byte-identical audio proof.

The enhanced proxy measured receipt, disk, downstream, logging, backpressure, and header-name policy independently. One short proxy response exhausted normally: 220,147 AAC bytes, SHA-256 `601d2cc46767b97c8ef12b8bdeaef60741f88aa0bf6b84437a9ea135f64cd370`, 14 chunks, no backpressure, and native queue end. Exact-source versus emulator capture remained `inconclusive` overall (alignment 0.7147) while its closing and ending correlations were strong (0.9782/0.9979). A separate long proxy attempt timed out before upstream headers after four approximately eight-second zero-byte attempts; that distinguishes a proxy slow-first-byte limitation from the clean direct path but does not reproduce final-word clipping.

The bounded lifecycle harness executes two attempts each for uninterrupted/replay, deliberate pause/restart, ambient enable/disable, and message switching, plus three completed automatic Voice Mode replies. The optional API 35 follow-up was attempted, but both installed AVD definitions exited before device readiness, so no second-image playback result is claimed.

No normal direct emulator run lost its ending or terminated early. Accordingly, no product playback fix was selected and no physical-device run, deployment, merge, push, or release was performed. Remaining uncertainty is generated-AAC lexical content without independent transcription, direct-path response bytes, physical output routes, and the unavailable second emulator image. Full evidence and limitations are in `docs/qr-mob-021-trackplayer-streaming-progress.md`.

## 2026-09-10 spoken-ending and live-autoplay follow-up

A local-only `faster-whisper` 1.1.1 workflow was validated with `base.en` and `small.en`: the intact synthetic control retained its closing phrase, while whole-ending and final-750-ms speech removals were detected even though trailing silence remained. The historical retained AAC was independently classified `complete`. The short proxy AAC remained `inconclusive`.

Both recognizers omitted the expected ending in full-recording and independent final-20-second passes for all three prior direct captures. The same result occurred in three new genuine QA Voice Mode attempts. Each new attempt used the normal authenticated saved-message GET in `live-trace`, enabled Voice Mode before reply completion, began recording before the prompt, used zero voice-button taps, rejected fixture routing, reached native queue end with cleanup and ownership release, and retained at least two seconds after termination. Their measured playback times were 118.785, 121.926, and 121.100 seconds. Read-only QA readback matched each native source identity exactly and confirmed the requested ending; rendered accessibility hashes are not byte-comparable when inline Markdown is present.

This is relevant missing-spoken-ending evidence, but it is not yet attributable to TrackPlayer. Exact direct response bytes were not retained, so TTS generation, transport, and emulator rendering remain inseparable. The smallest next discriminating step is a QA-only KotlinAudio 2.1.0 AAR fork that wraps the ExoPlayer 2.19.0 `DefaultHttpDataSource` and retains each native request/retry without changing the normal request. Because that is a material dependency/build-maintenance expansion, it was documented but not implemented under this plan entry. No product fix, physical-device run, deployment, merge, push, or release was performed.

The optional API 35 readiness retry also succeeded on an explicit port. One representative frozen-fixture run was attached specifically to the API 35 emulator, delivered the full source with normal EOF, reached native queue end, and produced a `complete` waveform result with both recognizers recovering the ending semantically. This confirms the existing second image can run the representative audio path; it does not resolve the live direct-byte gap.

## 2026-09-17 native direct-byte result

The approved QA-only KotlinAudio capture fork is now implemented behind matching JavaScript and Gradle opt-ins. Normal builds continue to resolve the published KotlinAudio 2.1.0 artifact. Internal capture headers are stripped before the network request; retained metadata is correlation/timing/hash/header-name data only and excludes URLs, tokens, header values, prompts, assistant text, and transcripts.

The known steady fixture validated the seam first: one request retained the exact 254,581 expected bytes with SHA-256 `888d4c1dae1ef1fadb3c850b5bf886bb6bb0833cdbb91e15713d5ebb899295fa`, zero gaps/conflicts/errors, and only 16.95 ms total capture-write time during the 6.304-second paced stream.

One subsequent genuine QA autoplay attempt used the normal authenticated direct request. It retained one complete 1,142,871-byte AAC response with real native EOF and SHA-256 `e3c3ab89c7b0e12a46bad296667c8462d9eb16580d86505f4d74a9481ac22920`. Playback began about 62.1 seconds before the final response byte, then reached queue end at 121.908 seconds, so progressive startup was preserved. Exact-source versus same-run emulator audio classified `complete` with alignment 0.8983, closing correlation 0.9963, ending correlation 0.9900, and full ending coverage. Both independent local recognizers recovered the requested final phrase from the native source and emulator recording, including final-20-second crops.

This exact attempt is clean at all three boundaries: generated AAC contains the ending, the normal Android data source receives it through EOF, and emulator TrackPlayer renders it. Earlier direct/autoplay recordings without native bytes remain historically inconclusive, but the new capture path can now discriminate future failures. No intermittent failure was reproduced, no product playback fix was made, and no physical-device run, backend mutation, deployment, merge, push, or release occurred.


## Same saved reply: evidence points upstream of rendering (2026-09-18)

The follow-up recovered the exact saved reply from the suspect September 11 sample and replayed it on the Android API 34 emulator using the published library and capture-enabled fork. All four completed playbacks match source SHA-256 `13a3ddd146503d36f9b0ae121eee477a6db2cf095246cbb06f891c107731d4b7`; fresh read-only QA verification confirms the expected final phrase in that text. These are manual existing-reply tests, not autoplay replicas.

- Both published-build recordings omit the sentinel in local ending transcriptions.
- Both capture-enabled attempts retain a complete position-zero native response through EOF. `base.en` and `small.en` omit the sentinel from those retained sources.
- Each native source matches its own emulator recording through the ending: checker `complete`, ending correlations 0.9912 and 0.9532, full coverage. The received audio was rendered completely in these bounded comparisons.

The next investigation belongs at the TTS/backend boundary: verify exact input hash and settings, upstream completion, emitted bytes, and provider-versus-native response content. These results do not yet distinguish incomplete provider input, generated speech omission, or upstream delivery. Replacing TrackPlayer, changing cleanup timing, or requiring a physical device is not supported by this evidence.

The corrected published/capture Detox tests passed, as did both strict native collectors and eight focused unit checks. Earlier harness log-limit/timestamp-filter failures were recovered and are not called test passes; one interrupted setup produced no recording and is excluded. The later capture ran after a continuation gap, so backend parity is unverified. Raw evidence and the comparison summary remain under `artifacts/qr-mob-021/controlled-comparison-20260917/`.

A new detailed handoff is appended to the plan. Read-only AWS inspection remains blocked by an expired local session; no backend deployment, product playback change, release, or physical-device work was performed.

### Backend correlation result

Read-only QA correlation completed after AWS access was restored. The deployed `gabriel_streaming_lambda` image was `78ea789` and had the expected TTS observability. For both captured failures, the backend logged the exact saved-source SHA, 1,865 characters, 1,872 UTF-8 bytes, and 9 lines with `gpt-4o-mini-tts` / `cedar` / AAC / speed `1.0`. Neither request logged an error.

The first backend response stopped after 1,085,039 emitted bytes and the first native capture retained 1,085,039 bytes through EOF. The retry stopped after 1,124,878 emitted bytes and its native capture retained 1,124,878 bytes through EOF. Equal counts are not byte-hash proof, but they eliminate the previously open incomplete-input hypothesis and provide no evidence of byte-count loss between the backend generator and native client.

The current evidence therefore does not support a TrackPlayer product change. The smallest next discriminator is one bounded direct TTS control using the frozen text and exact logged settings, retaining the provider response locally for source ASR/waveform inspection and byte comparison. That paid external request was not started as part of the read-only correlation.

### Direct provider control result

One explicitly authorized direct control used the exact frozen source and deployed settings: `gpt-4o-mini-tts`, `cedar`, the deployed fixed instruction string (SHA-256 `ef9d7dc1a5d2fe77ae1a60cbe1d08cb7c7555bf084c214891f28d9e069a19e38`), speed `1.0`, and AAC. The provider completed successfully with HTTP 200 and no error; its complete 1,133,777-byte response is retained locally with SHA-256 `f2329e6c7006f221c65840bb46f978f63978d891a25dc48dfbc4f4d3fec36ebb` plus completion metadata.

Both local recognizers (`base.en` and `small.en`) omit all three expected ending tokens from both the complete decoded provider response and its final-25-second crop. The direct control therefore reproduces the omission before the backend, native client, or TrackPlayer participates. This is strong semantic evidence of generation-side omission, while retaining the limitation that ASR is not byte-level lexical proof and a separate stochastic TTS response cannot be expected to match historical AAC bytes.

### Pinned snapshot and instruction isolation

Two authorized controls then pinned `gpt-4o-mini-tts-2025-12-15` while holding source hash, voice `cedar`, speed `1.0`, and AAC constant. With the deployed instructions, both complete-audio recognizers again omitted the ending, and both final-25/final-35 crops omitted all three tokens. With `instructions` omitted, both complete-audio recognizers recovered the full ending; `small.en` also recovered it in both tail crops, while `base.en` produced inconsistent tail-only results.

This supports an instruction-dependent provider omission more strongly than a model-alias or streaming explanation. It is still one stochastic comparison pair, and the no-instructions tail disagreement prevents claiming a fully unanimous ASR pass. The next bounded direction is refining or removing the style instructions within the existing Speech API, not adopting Realtime or changing TrackPlayer.

### Appending an explicit fidelity requirement did not fix it

Three additional authorized controls kept the deployed alias, source, voice, speed, AAC format, and complete persona intact, then appended an explicit requirement to read every word through the final sentence without omission or paraphrase. All three responses completed and decoded without error. Both recognizers omitted all three ending tokens from both full audio and final-25-second crops in all three runs.

This rejects the proposed append-only mitigation at the bounded 3/3 threshold. It preserves the broader instruction-dependent hypothesis—the no-instructions control recovered the ending—but shows that a trailing fidelity sentence does not override the behavior induced by the current full persona prompt. No QA backend change should be made from this variant.

### Condensing and moving fidelity first also failed

Three authorized controls then reduced the instructions to a 173-byte fidelity-first persona while retaining `gpt-4o-mini-tts`, `cedar`, speed `1.0`, and AAC. All three responses completed and decoded without error. Both recognizers omitted all three ending tokens from both full audio and final-25-second crops in every run.

This second prompt mitigation also fails at 3/3. The evidence no longer supports prompt length or ordering as the primary explanation. The strongest current distinction is instructions present versus omitted: the one no-instructions control recovered the ending, while every tested persona-bearing variant omitted it. More no-instructions or minimal non-persona repeats are needed before choosing a QA backend change.

### Omitting instructions on the deployed alias also failed

Three authorized controls then omitted the `instructions` key while using the deployed `gpt-4o-mini-tts` alias and holding the frozen source, `cedar`, speed `1.0`, and AAC constant. All three responses completed and decoded normally. Both recognizers omitted every ending token from full audio and final-25-second crops in every run.

The no-instructions stage therefore failed its strict 3/3 gate, and the conditional minimal-style stage was not run. This is important negative evidence: instruction presence alone does not explain the omission. The earlier no-instructions recovery was a single response from the pinned `gpt-4o-mini-tts-2025-12-15` snapshot, while these three failures used the floating alias. Snapshot behavior and stochasticity remain confounded, and no prompt change is supported yet. The smallest next experiment is three pinned-snapshot, no-instructions repeats before reconsidering a minimal style prompt or QA deployment.

### The pinned no-instructions result is not repeatable

Three additional authorized calls repeated the exact pinned `gpt-4o-mini-tts-2025-12-15` no-instructions condition. All three provider responses completed and decoded without error. Run 2 recovered the complete ending in both recognizers and both full/tail views; in runs 1 and 3, neither recognizer recovered any ending token in either view.

The strict result is therefore 1/3, not a reliable fix. Together with the deployed alias's 0/3 no-instructions result, this shows that removing persona instructions does not guarantee lexical completeness and that the earlier pinned success was not sufficient evidence of snapshot-specific behavior. No tested condition, including pinned no-instructions, achieved dependable 3/3 preservation; alias-versus-pinned behavior remains unresolved because the floating alias's resolved snapshot was not exposed. No QA backend or mobile change is justified from these controls.

### Initial OpenAI sacrificial-tail assessment (superseded scope)

This section originally assumed the proposed strategy targeted OpenAI. The user clarified that it may instead concern Gemini 3.1; the Gemini-specific conclusion follows below.

Appending expendable spoken text is a plausible provider mitigation and has community precedent in other neural TTS systems, but there is no evidence yet that it reliably fixes OpenAI's omission. It also cannot safely be combined with the current immediate AAC forwarding by trimming a fixed duration or number of bytes: the Speech response has no documented word-boundary cue, generated timing varies, and the normal saved-message TrackPlayer path starts from the remote response.

The production-capable form would need verified buffering: identify the intended ending and a distinctive sacrificial marker in decoded audio, trim at a sample boundary, re-encode, and fail closed or retry whenever either boundary is uncertain. Full-response verification would sacrifice progressive startup. A bounded segment pipeline could preserve streaming at the reply level by playing each verified segment while generating the next, at the cost of a larger backend/mobile change and possible join/prosody artifacts. The immediate next step, if authorized, is a paid provider-only repeated experiment against the frozen source; no provider call or product change was made during this assessment.

### Corrected Gemini 3.1 assessment

The sacrificial-tail idea is more technically natural with `gemini-3.1-flash-tts-preview` because its streaming API returns raw 24 kHz PCM chunks, making a rolling holdback and sample trim easier than the current AAC path. It still provides no documented transcript boundary or timestamp identifying the suffix, and expressive audio tags are not reliable boundary markers.

More importantly, Gemini's reported failure is often a provider stream abort: HTTP 200, partial PCM, and `finishReason: OTHER`, commonly around 60–70 seconds but sometimes earlier. A tail protects the real ending only if generation reaches the tail before aborting. The defensible design is therefore bounded segments plus a sacrificial suffix, terminal-reason and lexical verification, PCM trimming, and retry/fallback. Playing every arriving chunk immediately cannot guarantee the suffix remains inaudible. No Gemini call or implementation was performed; a credentialed provider-only streaming experiment remains the next step.

### Gemini 3.1 provider gate failed on the first control

After explicit authorization, the provider-only harness executed the frozen-source matrix and stopped at the first predeclared failure. The control returned HTTP 200 and 91.32 seconds of structurally valid raw PCM: 2,283 deltas, 4,383,360 bytes, SHA-256 `085c7e2e6dc2451d475e76179c02fb23147e03bc75aaa1f4793dd8f25cd0c896`. The stream emitted only in-progress setup events plus audio deltas and closed without `interaction.completed` or any terminal event.

Both independent local recognizers omitted the complete expected ending from the full PCM and its independently derived final-25-second view. The strict result is therefore `provider_failed` with `ending_missing`, despite HTTP 200 and playable audio. The remaining eight matrix calls were intentionally not made, and Phase 2 was not started. A sacrificial suffix cannot protect an ending the provider never reaches; any future Gemini design needs short verified segments plus a fail-closed retry/fallback path before marker trimming is relevant.

The reusable local harness, offline analyzer, PCM/WAV and redaction utilities, and 20 passing focused tests are now implemented. Raw audio, ordered events, source text, credentials, and raw transcripts remain ignored. No QA/backend/mobile code was deployed or changed, and no merge, push, release, or physical-device work occurred.

### Phase 2 chunking did not clear the provider gate

At the user's direction, one bounded six-segment plan was attempted despite the failed whole-source gate. The source was split at natural boundaries, with the first request containing 362 characters. That request returned HTTP 200, first audio in 857.143 ms, and 26.52 seconds of structurally valid 24 kHz mono PCM. However, it again closed without `interaction.completed` or another terminal event. The runner stopped after this one paid call, so the remaining five segment requests were not spent.

Both local recognizers also failed to recover either the first segment's expected ending or the expendable suffix from both the full partial audio and an independent final-12-second view. The result is therefore `provider_failed` / `segment_sequence_incomplete`; the audio was not trimmed, concatenated, or played. Chunking remains a sound architectural way to bound latency only if individual generations are reliable, but this test shows that a 362-character segment can still fail in the same way. It does not support backend/mobile integration of the Gemini pipeline.

The Phase 2 library, runner, analyzer, privacy gates, and 29 focused tests remain useful for evaluating another provider/model or a future Gemini behavior change. The detailed commands, hashes, event counts, and ignored artifact path are recorded in `docs/qr-mob-021-trackplayer-streaming-progress.md`.

### Official SDK pair completed, but neither mode passed the safe-suffix gate

The handoff implementation is complete. Seventy-two focused Gemini tests, TypeScript checking, no-network rehearsals, and diff validation passed before the authorized spend. An isolated official `@google/genai@2.23.0` client then made exactly two generation requests with retries disabled: the same frozen first 362-character segment once with streaming enabled and once with streaming disabled.

Both generations now had completed provider status and structurally valid PCM. Streaming produced 32.04 seconds (1,537,920 bytes), first audio at 987.726 ms, and finished in 13.379 seconds. Non-streaming produced 28.48 seconds (1,367,040 bytes) and returned in 14.460 seconds. In both arms, both recognizers recovered the complete real segment ending from both full audio and an independent tail view.

However, neither recognizer recovered the expendable suffix in either arm or view. Without a unique suffix after the real ending, no defensible trim boundary exists. Both arms therefore fail closed as `trim_uncertain` / `marker_missing_or_unusable`; neither was trimmed or released for playback. Measured offline verification added 9.360 seconds for streaming and 7.290 seconds for non-streaming. The pair used 290 reported input tokens and 2,514 audio-output tokens, approximately $0.05057 under the recorded pricing assumptions.

This is useful but negative feasibility evidence. The official SDK shows that completed streaming and non-streaming interactions can preserve the short segment's real ending, so the older missing-terminal behavior is not deterministic and this pair does not establish a streaming-only defect. The safety-marker mechanism still failed in both modes, so neither qualifies for confirmation or a local emulator pipeline. Gemini integration work stops here under the handoff decision table. Evidence is retained under `artifacts/qr-mob-021/gemini-sdk-delivery-comparison/20260919T131746681Z-official-sdk/`; no product routing, deployment, merge, push, release, or physical-device work occurred.

### Corrected spoken-region experiment is frozen offline

The prompt-conflict handoff is prepared but has not spent provider budget. Version `single-spoken-region-v2` places the exact real segment and `Violet window thirteen.` together inside one spoken region. The SDK comparison no longer reads the contradictory historical prompt, and stale caller-supplied prompts cannot bypass the pinned hashes. Streaming and non-streaming payloads share one builder and differ only in delivery mode.

The verifier now checks the entire normalized source sequence in both full transcripts, in addition to the existing ending, full/tail suffix, boundary, trim, and post-trim leakage gates. It requires exact full-source fidelity after trimming. Seventy-eight focused tests, type checking, both zero-network dry runs, and diff validation pass. The corrected prompt hash is `1093c966ca7f3847bd660d309bf0cdf5bfde597316bf4b9c31eae8ae4145979d`; the complete spoken-script hash is `b50552cef23605da7757bc890b06f76881360f0f387eef3f8dc3bd49b39de6f4`.

The runnable matrix is capped at two generation requests, retries disabled, with an estimated cost of approximately $0.05057 based on the preceding pair. No new provider request, confirmation call, six-segment run, emulator work, product integration, deployment, merge, push, release, or physical-device work occurred during preparation.

### Corrected prompt produced one safely trimmable non-streaming sample, but latency remains unacceptable under the diagnostic gate

The explicitly authorized corrected pair used exactly two calls with no retries. Both provider interactions completed. Streaming preserved all 59 real-source tokens but omitted the suffix again, so it remains `trim_uncertain`. Non-streaming preserved all 59 source tokens and then spoke the three-token suffix. Both recognizers agreed on source and marker order in full and tail views; their marker-boundary spread was 0.74 seconds against the 0.75-second limit.

The non-streaming response was cut at a defensible low-energy boundary before the marker. Both post-trim recognizers recovered exactly the 59 source tokens and no marker fragment. This is the first sample in this investigation to pass provider completion, full-source fidelity, suffix evidence, safe trimming, post-trim fidelity, and zero leakage together. It supports the prompt-conflict hypothesis for this one non-streaming generation.

It is not yet a viable product path. Generation took 19.698 seconds and comprehensive offline verification took 13.376 seconds, reaching simulated verified readiness at 33.074 seconds. That exceeds the existing diagnostic 30-second ceiling, which is not itself an approved product budget, and no actual audible start was measured. Streaming still failed the marker gate, and one non-streaming success does not establish repeatability.

No confirmation budget was authorized, so the optional two confirmation generations were not made. No emulator or product integration followed. The result is: **content/trim feasibility demonstrated once for non-streaming; repeatability and runtime-latency feasibility remain unproven**. Evidence is retained under `artifacts/qr-mob-021/gemini-sdk-delivery-comparison/20260919T135613542Z-official-sdk-prompt-v2/`.
