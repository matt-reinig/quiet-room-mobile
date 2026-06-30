# QR-MOB-021 Phase 5 - Native Player Investigation

## Context

QR-MOB-021 has completed the following phases:

1. ✅ Built a reproducible playback diagnostics harness.
2. ✅ Established a baseline using expo-av and the existing live GET stream.
3. ✅ Migrated to expo-audio.
4. ✅ Investigated media/container changes (MP3 vs alternate format) on QA.

Voice playback is still reported as clipping.

## Why this phase exists

Before changing the backend delivery mechanism, isolate one remaining mobile variable: the playback engine.

Changing the player is substantially smaller in scope than introducing HLS or another streaming architecture.

If a more capable native player can consume the existing live GET stream reliably, we preserve the current backend design and avoid significant infrastructure work.

## Goal

Evaluate a streaming-capable native audio player (for example react-native-track-player if appropriate) while leaving the backend unchanged.

Keep constant:

- existing voice endpoint
- authentication
- live GET streaming
- QA backend
- diagnostics harness
- telemetry

The only intentional variable should be the player.

## Questions to answer

- Can another native player consume the current live stream without clipping?
- Does startup latency change?
- Does buffering change?
- Does background behaviour improve?
- Are iOS and Android different?
- Is the new player compatible with Expo and the existing application architecture?

## Success Criteria

Document:

- player investigated
- implementation effort
- platform support
- playback reliability compared to expo-audio
- startup latency
- clipping rate
- buffering observations
- recommendation to adopt or reject the player

## If this succeeds

Adopt the better player and keep the existing streaming backend.

## If this fails

Move to the next phase:

**Phase 6 - Delivery Mechanism Investigation (HLS or another segmented streaming approach).**

Only after demonstrating that:

- multiple players clip
- multiple media formats clip

should the investigation conclude that the delivery mechanism is the likely remaining variable.

## Codex Task

Investigate a streaming-capable native player as a diagnostic-only experiment.

Do not change the backend.

Compare the new player against expo-audio using the existing diagnostics harness and identical live GET requests.

Produce a written recommendation on whether the player solves the clipping issue. If not, recommend proceeding to Phase 6 (HLS/delivery mechanism investigation).