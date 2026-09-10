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
