import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  parseDiagnosticEvents,
  selectDiagnosticLog,
  summarizeAutoplayEvidence,
} from "../scripts/collect-voice-autoplay-evidence.mjs";

test("autoplay evidence correlates live source, native lifecycle, and UI completion", () => {
  const event = (name, fields = {}, elapsedMs = 1) =>
    `QR_MOB_021_VOICE_DIAG ${JSON.stringify({
      prefix: "QR_MOB_021_VOICE_DIAG",
      event: name,
      runId: "run-1",
      attemptId: "attempt-1",
      elapsedMs,
      wallTime: "2026-09-10T12:00:00.000Z",
      fields,
    })}`;
  const events = parseDiagnosticEvents([
    event("attempt.started", { diagnosticMode: "live-trace", endpointMode: "live" }),
    event("source.asserted", { diagnosticMode: "live-trace", endpointMode: "live" }),
    event("source.identity", { sourceSha256: "abc", sourceCharCount: 12, conversationSha256: "def", sourceSlot: 1 }),
    event("playback.play.completed"),
    event("playback.progress", { position: 1 }),
    event("playback.terminal", { reason: "queue-ended" }),
    event("cleanup.terminal.reset-completed"),
    event("ownership.released"),
    event("attempt.finished", { result: "native-ended" }),
  ].join("\n"));
  const summary = summarizeAutoplayEvidence(events, [{
    actualPlaybackDurationMs: 70000,
    autoPlaybackObserved: true,
    durationBand: "target",
    postTerminalDurationMs: 2000,
    recordingStartedBeforePrompt: true,
    replyCompletedAt: "2026-09-10T12:00:00.000Z",
    voiceButtonTapCount: 0,
    voiceModeEnabledBeforeReply: true,
  }]);

  assert.equal(summary.assertions.allLiveEndpoint, true);
  assert.equal(summary.assertions.attemptCountMatchesUiEvidence, true);
  assert.equal(summary.assertions.noFixtureRouting, true);
  assert.equal(summary.assertions.sourceAssertionObserved, true);
  assert.equal(summary.assertions.sourceIdentityObserved, true);
  assert.equal(summary.assertions.replyCompletionRecorded, true);
  assert.equal(summary.assertions.nativeLifecycleObserved, true);
  assert.equal(summary.assertions.durationsRecorded, true);
  assert.equal(summary.assertions.autoplayRecorded, true);
  assert.equal(summary.attempts[0].sourceIdentity.sourceSha256, "abc");
  assert.equal(summary.attempts[0].native.terminal.event, "playback.terminal");
});

test("autoplay evidence rejects fixture routing", () => {
  const events = parseDiagnosticEvents(
    `QR_MOB_021_VOICE_DIAG ${JSON.stringify({
      prefix: "QR_MOB_021_VOICE_DIAG",
      event: "attempt.started",
      runId: "run-1",
      attemptId: "attempt-1",
      fields: { diagnosticMode: "fixture", endpointMode: "fixture", fixtureCase: "steady" },
    })}`,
  );
  const summary = summarizeAutoplayEvidence(events, []);
  assert.equal(summary.assertions.noFixtureRouting, false);
});

test("collector discovers Detox device.log files", async () => {
  const root = await mkdtemp(join(tmpdir(), "qr-mob-021-autoplay-"));
  try {
    const artifactDir = join(root, "artifacts", "android.emu.release", "test");
    await mkdir(artifactDir, { recursive: true });
    const deviceLog = join(artifactDir, "device.log");
    await writeFile(deviceLog, `QR_MOB_021_VOICE_DIAG ${JSON.stringify({
      prefix: "QR_MOB_021_VOICE_DIAG",
      event: "attempt.started",
      runId: "run-device-log",
      attemptId: "attempt-device-log",
      wallTime: "2026-09-11T02:00:00.000Z",
    })}\n`);

    const selected = await selectDiagnosticLog(root, null, "2026-09-11T01:59:59.000Z");
    assert.equal(selected.path, deviceLog);
    assert.equal(selected.events.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collector excludes logs created after the completed attempt window", async () => {
  const root = await mkdtemp(join(tmpdir(), "qr-mob-021-autoplay-window-"));
  const diagnosticLine = (runId, wallTime) => `QR_MOB_021_VOICE_DIAG ${JSON.stringify({
    prefix: "QR_MOB_021_VOICE_DIAG",
    event: "attempt.started",
    runId,
    attemptId: `attempt-${runId}`,
    wallTime,
  })}\n`;

  try {
    const expectedDir = join(root, "artifacts", "expected");
    const futureDir = join(root, "artifacts", "future");
    await mkdir(expectedDir, { recursive: true });
    await mkdir(futureDir, { recursive: true });
    const expectedLog = join(expectedDir, "device.log");
    await writeFile(expectedLog, diagnosticLine("expected", "2026-09-11T02:20:10.000Z"));
    await writeFile(
      join(futureDir, "device.log"),
      diagnosticLine("future", "2026-09-11T02:30:10.000Z").repeat(3),
    );

    const selected = await selectDiagnosticLog(
      root,
      null,
      "2026-09-11T02:20:00.000Z",
      "2026-09-11T02:21:00.000Z",
    );
    assert.equal(selected.path, expectedLog);
    assert.equal(selected.events[0].runId, "expected");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
