# QR-MOB-021 Voice Playback Diagnostics Plan V2

## Physical-device production-flow diagnostics

### Goal

Test the voice clipping issue on a real phone using the normal chat voice button flow, not only the emulator diagnostics screen.

The current emulator and simulator work has not confirmed the original clipping bug. Android saved-message playback has been clean across the seeded long and medium-message attempts. iOS showed one failure-shaped stall where playback stopped producing a terminal event, but it did not prove an early clipped finish.

This phase should determine whether the issue appears only with real hardware, real networking, and real conversation content.

### Setup

- Build or run a QA/dev-client app on a physical phone.
- Enable production voice diagnostics with `EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1`.
- Use the normal chat UI and the normal message voice button.
- Start with Android if available, because that best matches the original mobile report.
- Keep backend logs available for the same test window.

### Test workflow

1. Use the app normally on the phone.
2. Generate several assistant replies and play them through the normal voice button.
3. Prefer medium or longer replies when practical.
4. If clipping happens, capture the exact conversation ID and message index.
5. Preserve device logs and backend logs for the matching request.
6. Replay the same saved message through the diagnostics screen.
7. Compare the same conversation/message pair with `expo-av` and `expo-audio`.

### Evidence to capture

- Device model and OS version.
- App build/version and backend environment.
- Conversation ID and message index.
- Approximate assistant text length.
- Playback engine.
- `positionMillis`, `durationMillis`, `didJustFinish`, and `isBuffering`.
- Terminal phase: `finish`, `error`, `timeout`, `clipped`, or no terminal event.
- Screenshots or copied diagnostic log output.
- Backend logs for the matching voice request.

### How to interpret results

- If `expo-av` clips but `expo-audio` does not, prefer switching the production path to `expo-audio` or adding an engine fallback.
- If both engines clip only on live GET playback, investigate native streaming playback behavior.
- If cached POST playback succeeds while live GET clips, consider a production fallback that downloads the MP3 before playback.
- If playback stops without a finish or error event, classify it as a stall/no-terminal-event case.
- If no clipping occurs after repeated real-device attempts, record the clean baseline and keep diagnostics available for the next real user report.

### Success criteria

- Reproduce clipping or stall on a physical device with enough telemetry to identify the failure mode, or
- Establish a clean physical-device baseline using the actual production voice button flow.
