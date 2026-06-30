# QR-MOB-021 Phase 5 HLS / Delivery Mechanism Plan

## Context

QR-MOB-021 started as a streaming-first investigation into mobile voice playback clipping.

The original phase plan was:

1. Build a reproducible playback diagnostics harness.
2. Establish a baseline with the current implementation: `expo-av` + live GET MP3 stream.
3. Test `expo-audio` with the same endpoint, same stream, and same audio.
4. If `expo-audio` still clips, investigate whether the issue is format/container related: MP3 vs AAC/M4A.
5. If clipping survives both player and format changes, investigate HLS as a delivery-mechanism change.

The app has now tried the player change and the media/format change on QA, and voice playback is still reported as clipping. That means QR-MOB-021 should move to the next phase: test whether the delivery mechanism itself is the issue.

## Current Working Theory

The backend can generate and stream TTS audio, and web playback has historically handled the stream better than native mobile playback.

The remaining failure is likely not just:

- the Expo audio library, or
- the MP3 format/container.

The failure may be caused by the shape of the delivery path:

```text
OpenAI TTS stream
  -> Gabriel Flask live streaming response
  -> mobile native player live GET source
```

Native mobile players may be sensitive to chunked transfer, missing or unstable content length, duration metadata, stream finalization, auth headers, app lifecycle events, or how the stream closes.

## Goal

Design and spike the next streaming-friendly delivery mechanism.

The goal is not to fall back immediately to completed-file playback. The product goal is still:

```text
assistant response completes
  -> voice can start quickly
  -> playback continues reliably to the end
```

This phase should determine whether HLS, or a similarly segmented delivery model, gives mobile a more stable streaming source than the current single live GET audio response.

## Phase 5 Main Question

Does a playlist/segment delivery model eliminate clipping while preserving acceptable startup latency?

In other words:

```text
current:
  GET /api/voice_stream?... -> one live audio response

candidate:
  GET playlist -> player consumes multiple short media segments
```

## Proposed HLS Experiment

Create a minimal, QA-only HLS spike for saved assistant-message voice playback.

Possible backend shape:

```text
GET /api/voice_hls?conversation_id=<id>&message_index=<index>
```

or:

```text
POST/GET creates a temporary voice playback session
  -> returns a playlist URL
  -> mobile player loads the playlist URL
```

The playlist should point to short audio segments generated from the assistant message TTS output.

A conceptual flow:

```text
saved assistant message
  -> TTS generation
  -> segment audio into HLS-compatible chunks
  -> serve .m3u8 playlist
  -> serve segment URLs
  -> mobile player consumes playlist
```

## Important Streaming Constraint

Do not treat HLS as successful if it only works by waiting for the entire TTS file to finish before playback can begin, unless that tradeoff is explicitly documented.

The desired experiment should measure whether playback can begin after the first playable segment is available.

Acceptable outcomes:

1. True or near-true streaming: playlist starts before all segments exist.
2. Short prebuffer: playback starts after one or a few initial segments are ready.
3. Completed playlist only: reliable but not meaningfully streaming-friendly. This may be useful, but it is a fallback result, not the main success case.

## Implementation Questions To Answer First

Before building deeply, Codex should answer and document:

1. Does the current TTS output format support segmenting cleanly into HLS-compatible audio?
2. Is FFmpeg or another segmenter available in the Gabriel backend/deploy environment?
3. If not available, is an AWS Lambda layer, containerized Lambda, or alternative packaging needed?
4. Can HLS be generated incrementally while TTS is still streaming, or only after a complete audio file exists?
5. What segment format should be used for widest iOS/Android compatibility?
6. Can `expo-audio` consume HLS playlist URLs on both iOS and Android in the current Expo SDK?
7. Does auth work for playlist and segment requests?
8. Do segment requests need signed URLs instead of Authorization headers?
9. Where should temporary playlist/segment files live: memory, `/tmp`, S3, or another cache?
10. How should temporary audio artifacts be cleaned up?

## Backend Spike Options

Consider these options, in order of increasing complexity.

### Option A: Completed HLS Playlist From Generated Audio

Flow:

```text
TTS complete audio
  -> segment completed audio
  -> serve static playlist + segments
  -> mobile plays playlist
```

Pros:

- easiest HLS proof of player compatibility
- useful to confirm whether mobile handles HLS better than one live response
- simpler diagnostics

Cons:

- not truly streaming-first
- may have similar startup delay to completed-file playback

Use this only as a first compatibility spike if incremental HLS is too hard to start with.

### Option B: Incremental HLS Playlist

Flow:

```text
TTS stream starts
  -> write first segment(s)
  -> playlist becomes available
  -> continue appending segments
  -> player follows playlist until end
```

Pros:

- closest to the product goal
- gives native players a standard streaming-media structure
- may preserve acceptable startup behavior

Cons:

- more complex backend orchestration
- harder in Lambda if generation and segment serving need shared state
- requires careful end-of-playlist handling

### Option C: Hybrid Prewarm With Stable Segmented Resource

Flow:

```text
assistant message finalizes
  -> backend begins TTS/HLS prewarm
  -> user taps voice
  -> if initial segments are ready, play HLS
  -> otherwise fall back to current live GET or show loading state
```

Pros:

- practical product compromise
- can hide some startup latency
- gives useful diagnostics: `hls_ready`, `hls_pending`, `live_get_fallback`

Cons:

- more moving parts
- needs lifecycle/caching policy
- fallback UX must be deliberate

## Mobile Spike Requirements

Add HLS as a diagnostic-only playback mode first.

Do not replace normal production voice playback immediately.

The diagnostics screen should support a new engine/mode such as:

```text
expo-audio-hls
```

or similar.

It should allow comparison against:

- current `expo-audio` live GET MP3/AAC path
- HLS playlist path

Use the same saved assistant message and the same user/auth context.

## Diagnostics To Capture

For each HLS run, capture:

- platform: iOS or Android
- player engine
- delivery mode: live GET, completed HLS, incremental HLS, or hybrid/prewarm HLS
- conversation ID
- message index
- text length
- backend API base
- playlist URL or playback session ID, without leaking sensitive tokens
- playlist MIME type
- segment MIME type
- segment duration target
- number of generated segments
- time to first playlist available
- time to first segment available
- playback start timestamp
- first playing timestamp, if observable
- buffering events
- `positionMillis`
- `durationMillis`
- `isBuffering`
- `didJustFinish`
- errors
- terminal classification: pass, clipped, stalled, timeout, error

Backend diagnostics should capture:

- TTS request ID
- source text hash and length
- TTS format
- segment count
- generated byte count
- playlist created timestamp
- first segment created timestamp
- final segment created timestamp
- cleanup result

## Minimum Test Matrix

Start with the platform where clipping is easiest to reproduce.

Minimum target after the spike is working:

| Platform | Delivery | Player | Attempts |
| --- | --- | --- | --- |
| Android | current live GET | expo-audio | 10 |
| Android | HLS playlist | expo-audio or compatible player | 10 |
| iOS | current live GET | expo-audio | 10 |
| iOS | HLS playlist | expo-audio or compatible player | 10 |

If HLS support requires a different mobile player, document that clearly and keep the comparison focused on delivery reliability.

## Success Criteria

This phase is successful if the repo has a written result answering:

1. Can Gabriel produce an HLS-compatible voice playback resource for a saved assistant message?
2. Can mobile play that HLS resource on Android?
3. Can mobile play that HLS resource on iOS?
4. Does playback start before the full audio is generated, or only after completion?
5. Does HLS eliminate clipping in the same scenario where live GET clips?
6. What is the startup latency compared with live GET?
7. What buffering behavior is observed?
8. What backend storage/cache/cleanup is required?
9. Is HLS worth productizing, or should the next fallback be completed-file/prewarm playback?

## Explicit Non-goals

Do not remove the existing voice stream endpoint.

Do not replace normal QA/prod voice playback until the HLS path has diagnostic evidence.

Do not hide a completed-file strategy behind the name HLS. If the experiment waits for full generation before playback, call that out plainly.

Do not implement a large permanent media platform before proving that HLS solves the clipping problem.

## Recommended Codex Task

Continue QR-MOB-021 from Phase 5.

Player swap and media-format changes have been tested on QA and voice playback still clips. Investigate whether the delivery mechanism is the remaining problem.

Create a diagnostic-only HLS or segmented-playback spike for saved assistant-message voice playback. Keep the current live GET path intact, add a controlled HLS playback mode, and compare the same saved assistant message against both paths with the existing telemetry model.

Prioritize answering whether HLS can remain streaming-friendly. If the only viable implementation requires generating the full audio file before playback starts, document that as a reliability fallback rather than a streaming success.
