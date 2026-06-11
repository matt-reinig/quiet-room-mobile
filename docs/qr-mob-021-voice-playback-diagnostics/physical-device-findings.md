# QR-MOB-021 Physical Device Findings

## 2026-06-11 Android QA device diagnostics

### Objective

Validate whether the QR-MOB-021 diagnostics harness can reproduce the reported voice clipping issue on a physical Android device.

### Environment

- Physical Android QA build.
- Diagnostics screen using saved-message playback.
- Normal chat screen using the standard `MessageVoiceButton` flow.
- Message index entered in diagnostics: `21`.
- Diagnostics telemetry identified assistant index `22` for the saved conversation lookup.
- Backend environment: QA Lambda URL shown in telemetry.

### Summary

This test did not reproduce the original clipping issue.

Instead, it showed that the diagnostics live GET path fails on the physical Android device, while the normal application voice button continues to work correctly.

That means the physical-device result should not be treated as evidence that production voice playback is broken in the same way. It is better evidence that the diagnostics live GET harness is not currently exercising the same successful playback path as the production message voice button.

### Normal application behavior

The standard app voice button works correctly on the physical Android QA build.

Observed behavior:

- Opened the normal chat screen.
- Used the regular assistant-message voice/play button.
- Audio played successfully.
- No failure was observed through the normal production-style user flow during this test.

### Diagnostics behavior

The diagnostics screen was then used against the same saved-message area.

#### expo-av-live-get

Observed behavior:

- Auth succeeded.
- Conversation lookup succeeded with HTTP 200.
- Playback creation started.
- Playback did not begin.
- ExoPlayer failed before audio started.
- Repeated error:

```text
com.google.android.exoplayer2.upstream.HttpDataSource$HttpDataSourceException
java.net.SocketTimeoutException: timeout
```

Interpretation:

- This is not clipping.
- Position did not advance.
- There was no early finish event.
- The live GET playback request timed out before actual playback began.

#### expo-audio-live-get

Observed behavior:

- Auth succeeded.
- Playback object was created.
- Status repeatedly showed buffering or paused at position zero:

```text
mode=buffering/paused
pos=0
buffer=true
finish=false
```

- Later status transitioned to idle/paused, still at position zero:

```text
mode=idle/paused
pos=0
buffer=false
finish=false
```

Interpretation:

- This is also not clipping.
- Playback never advanced beyond `pos=0`.
- No audio playback occurred through the diagnostics live GET path.
- The engine did not produce a successful finish event.

### Key finding

Normal `MessageVoiceButton` playback works on the physical Android device, but diagnostics live GET playback does not.

This suggests the diagnostics screen is not currently representative of the working production voice path. The diagnostics harness appears to be testing direct live GET streaming behavior, while the production button may be using a different path such as cached file playback, POST-generated audio download, or a fallback behavior.

### Recommended next investigation

Compare the diagnostics live GET implementation against the production `MessageVoiceButton` implementation.

Specifically determine:

- Whether production playback uses direct live GET streaming or cached local-file playback.
- Whether production falls back to POST/download/cache behavior when direct streaming is unreliable.
- Why physical Android fails to start playback through diagnostics live GET while normal voice playback succeeds.
- Whether the diagnostics harness should add a production-path replay mode so physical-device testing can exercise the exact same path as the user-facing voice button.

### Conclusion

The physical Android diagnostics run did not reproduce the original voice clipping issue.

It uncovered a separate but important diagnostics issue: physical Android cannot successfully start playback through the diagnostics live GET path even though normal app voice playback works.

Future QR-MOB-021 work should avoid treating live GET diagnostics failures as production clipping until the diagnostics screen is aligned with the production voice button path or clearly labels the tested playback path.