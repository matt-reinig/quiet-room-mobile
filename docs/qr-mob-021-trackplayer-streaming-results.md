# QR-MOB-021 TrackPlayer streaming results

Date: 2026-09-09

This is bounded emulator evidence for the frozen QR-MOB-021 fixture. It is not a product-fix or root-cause report.

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

Root-cause confidence remains low: these are synthetic-fixture emulator runs, not live QA TTS or physical-device validation. The matrix is one pass per delivery shape with two repeats, not the full repetition counts in the investigation plan. The result is therefore evidence for the next investigation step, not a product fix, production-readiness claim, or explanation of the reported field behavior.
