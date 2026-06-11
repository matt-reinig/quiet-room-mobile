# QR-MOB-021 Voice Playback Diagnostics Plan V2

## Physical-device production-flow diagnostics

### Goal

Test the voice clipping issue on a real phone using the normal chat voice button flow, not only the emulator diagnostics screen.

The current emulator and simulator work has not confirmed the original clipping bug. Android saved-message playback has been clean across the seeded long and medium-message attempts. iOS showed one failure-shaped stall where playback stopped producing a terminal event, but it did not prove an early clipped finish.

This phase should determine whether the issue appears only with real hardware, real networking, and real conversation content.

### Setup

- Add an in-app diagnostics switcher that is only visible when voice playback diagnostics are enabled.
- Launch the normal native app UI with `EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1`, not the diagnostics-only render mode, so the operator can move between normal chat and the diagnostics screen in the same installed app.
- Build or run a QA/dev-client app on a physical phone.
- Enable production voice diagnostics with `EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1`.
- Use the normal chat UI and the normal message voice button.
- Start with Android if available, because that best matches the original mobile report.
- Keep backend logs available for the same test window.

### In-app switcher behavior

- The normal chat screen remains the default launch surface.
- A diagnostics entry point is available from the app UI when `EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1`.
- The diagnostics screen can be opened without reinstalling or relaunching the app.
- The diagnostics screen has a clear return path back to the normal chat flow.
- The switcher is not visible in ordinary QA/prod builds unless the diagnostics flag is explicitly enabled.

### Test workflow

1. First rehearse the full operator flow on the Android emulator with the normal native UI and `EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS=1`.
2. Confirm the in-app diagnostics switcher can open the diagnostics screen and return to chat without reinstalling or relaunching.
3. Use the app normally in chat.
4. Generate several assistant replies and play them through the normal voice button.
5. Prefer medium or longer replies when practical.
6. If clipping happens, capture the exact conversation ID and message index.
7. Preserve device logs and backend logs for the matching request.
8. Use the in-app switcher to replay the same saved message through the diagnostics screen.
9. Compare the same conversation/message pair with `expo-av` and `expo-audio`.
10. After the emulator rehearsal is proven, repeat the same flow on a physical Android phone if available.

### Evidence to capture

- Device model and OS version.
- App build/version and backend environment.
- Whether the run used emulator, simulator, or physical hardware.
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
