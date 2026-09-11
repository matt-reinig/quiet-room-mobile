#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIAGNOSTIC_MARKER = "QR_MOB_021_VOICE_DIAG ";
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseDiagnosticLine(line) {
  const markerIndex = line.indexOf(DIAGNOSTIC_MARKER);
  if (markerIndex < 0) {
    return null;
  }

  try {
    const event = JSON.parse(line.slice(markerIndex + DIAGNOSTIC_MARKER.length));
    return event?.prefix === "QR_MOB_021_VOICE_DIAG" && event.runId ? event : null;
  } catch {
    return null;
  }
}

export function parseDiagnosticEvents(text) {
  return text
    .split(/\r?\n/)
    .map(parseDiagnosticLine)
    .filter(Boolean);
}

async function findFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

export async function selectDiagnosticLog(root, explicitPath, runStartedAt, runFinishedAt) {
  if (explicitPath) {
    return { path: explicitPath, events: parseDiagnosticEvents(await readFile(explicitPath, "utf8")) };
  }

  const files = await findFiles(path.join(root, "artifacts"));
  const startedMs = runStartedAt ? Date.parse(runStartedAt) - 10000 : 0;
  const finishedMs = runFinishedAt ? Date.parse(runFinishedAt) + 10000 : Number.POSITIVE_INFINITY;
  const candidates = [];
  for (const file of files.filter((candidate) => path.basename(candidate) === "device.log" || candidate.endsWith(".device.log"))) {
    const events = parseDiagnosticEvents(await readFile(file, "utf8").catch(() => ""));
    const recentEvents = events.filter((event) => {
      const eventMs = Date.parse(event.wallTime || "");
      return Number.isFinite(eventMs) && eventMs >= startedMs && eventMs <= finishedMs;
    });
    if (recentEvents.length > 0) {
      candidates.push({
        events: recentEvents,
        mtimeMs: (await stat(file).catch(() => ({ mtimeMs: 0 }))).mtimeMs,
        path: file,
      });
    }
  }

  candidates.sort((left, right) => {
    if (left.events.length !== right.events.length) {
      return right.events.length - left.events.length;
    }
    return right.mtimeMs - left.mtimeMs;
  });
  return candidates[0] || { events: [], path: null };
}

function fields(event) {
  return event?.fields && typeof event.fields === "object" ? event.fields : {};
}

function firstEvent(events, names) {
  return events.find((event) => names.includes(event.event)) || null;
}

function summarizeAttempt(events, uiEvidence) {
  const started = firstEvent(events, ["attempt.started"]);
  const asserted = firstEvent(events, ["source.asserted"]);
  const identity = firstEvent(events, ["source.identity"]);
  const terminal = firstEvent(events, ["playback.terminal", "playback.queue-ended", "playback.terminal.stale"]);
  const finished = firstEvent(events, ["attempt.finished"]);
  const lifecycleEvents = events.map((event) => ({
    elapsedMs: event.elapsedMs,
    event: event.event,
    fields: fields(event),
    wallTime: event.wallTime,
  }));
  const endpointModes = [...new Set(
    events
      .flatMap((event) => [fields(event).endpointMode, fields(event).diagnosticMode])
      .filter((value) => typeof value === "string"),
  )];
  const fixtureRoutingDetected = events.some((event) => {
    const eventFields = fields(event);
    return eventFields.endpointMode === "fixture" || eventFields.diagnosticMode === "fixture" || eventFields.fixtureCase;
  });
  const nativeLifecycle = lifecycleEvents.filter(({ event }) =>
    event.startsWith("setup.") ||
    event.startsWith("queue.") ||
    event.startsWith("playback.") ||
    event.startsWith("cleanup.") ||
    event.startsWith("ownership.") ||
    event.startsWith("ambient."),
  );

  return {
    runId: started?.runId || events[0]?.runId || null,
    attemptId: started?.attemptId || events[0]?.attemptId || null,
    endpointModes,
    fixtureRoutingDetected,
    sourceAssertion: asserted ? fields(asserted) : null,
    sourceIdentity: identity ? fields(identity) : null,
    replyCompletion: uiEvidence?.replyCompletedAt || null,
    native: {
      start: firstEvent(events, ["playback.play.completed", "ownership.activity-started"])
        ? { event: firstEvent(events, ["playback.play.completed", "ownership.activity-started"]).event }
        : null,
      progressObserved: events.some((event) => event.event === "playback.progress" || event.event === "playback.poll"),
      bufferingObserved: events.some((event) => event.event === "playback.buffering"),
      terminal: terminal ? { event: terminal.event, fields: fields(terminal), elapsedMs: terminal.elapsedMs } : null,
      cleanupObserved: events.some((event) => event.event === "cleanup.terminal.reset-completed" || event.event === "cleanup.track-player.reset"),
      ownershipReleased: events.some((event) => event.event === "ownership.released"),
      finalState: finished ? fields(finished) : null,
      lifecycleEvents: nativeLifecycle,
    },
    duration: {
      actualPlaybackDurationMs: uiEvidence?.actualPlaybackDurationMs ?? null,
      durationBand: uiEvidence?.durationBand || "unknown",
      postTerminalDurationMs: uiEvidence?.postTerminalDurationMs ?? null,
    },
    uiAssertions: uiEvidence
      ? {
          autoPlaybackObserved: uiEvidence.autoPlaybackObserved === true,
          recordingStartedBeforePrompt: uiEvidence.recordingStartedBeforePrompt === true,
          voiceButtonTapCount: uiEvidence.voiceButtonTapCount ?? null,
          voiceModeEnabledBeforeReply: uiEvidence.voiceModeEnabledBeforeReply === true,
        }
      : null,
    lifecycleEvents,
  };
}

export function summarizeAutoplayEvidence(events, uiEvidence = []) {
  const startedAttempts = events
    .filter((event) => event.event === "attempt.started" && event.attemptId)
    .reduce((groups, event) => {
      groups.set(event.attemptId, [...(groups.get(event.attemptId) || []), event]);
      return groups;
    }, new Map());

  for (const event of events) {
    if (event.attemptId && startedAttempts.has(event.attemptId) && event.event !== "attempt.started") {
      startedAttempts.set(event.attemptId, [...startedAttempts.get(event.attemptId), event]);
    }
  }

  const attempts = [...startedAttempts.values()].map((attemptEvents, index) =>
    summarizeAttempt(attemptEvents, uiEvidence[index] || null),
  );
  const allEvents = attempts.flatMap((attempt) => attempt.lifecycleEvents);
  const assertions = {
    attemptCount: attempts.length,
    attemptCountMatchesUiEvidence: attempts.length > 0 && attempts.length === uiEvidence.length,
    allLiveEndpoint: attempts.length > 0 && attempts.every((attempt) => attempt.endpointModes.includes("live") && !attempt.endpointModes.includes("fixture")),
    noFixtureRouting: attempts.length > 0 && attempts.every((attempt) => !attempt.fixtureRoutingDetected),
    sourceAssertionObserved: attempts.length > 0 && attempts.every((attempt) => Boolean(attempt.sourceAssertion)),
    sourceIdentityObserved: attempts.length > 0 && attempts.every((attempt) => Boolean(attempt.sourceIdentity)),
    replyCompletionRecorded: uiEvidence.length > 0 && uiEvidence.every((attempt) => Boolean(attempt.replyCompletedAt)),
    nativeLifecycleObserved: attempts.length > 0 && attempts.every((attempt) =>
      Boolean(attempt.native.start) &&
      attempt.native.progressObserved &&
      Boolean(attempt.native.terminal) &&
      attempt.native.ownershipReleased &&
      attempt.native.cleanupObserved &&
      Boolean(attempt.native.finalState),
    ),
    durationsRecorded: uiEvidence.length > 0 && uiEvidence.every((attempt) =>
      Number.isFinite(attempt.actualPlaybackDurationMs) &&
      Number.isFinite(attempt.postTerminalDurationMs),
    ),
    autoplayRecorded: uiEvidence.length > 0 && uiEvidence.every((attempt) =>
      attempt.autoPlaybackObserved === true &&
      attempt.voiceModeEnabledBeforeReply === true &&
      attempt.recordingStartedBeforePrompt === true &&
      attempt.voiceButtonTapCount === 0,
    ),
  };

  return { attempts, assertions, eventCount: allEvents.length };
}

async function runCli() {
  const args = new Map();
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (!argument?.startsWith("--")) continue;
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    args.set(key, inlineValue ?? process.argv[++index]);
  }

  const root = path.resolve(args.get("root") || DEFAULT_ROOT);
  const evidencePath = path.resolve(args.get("evidence") || path.join(root, "artifacts/qr-mob-021/long-reply-evidence.json"));
  const outputPath = path.resolve(args.get("output") || path.join(path.dirname(evidencePath), "live-autoplay-evidence.json"));
  const uiEvidence = JSON.parse(await readFile(evidencePath, "utf8").catch(() => "{}"));
  const runFinishedAt = (uiEvidence.attempts || [])
    .map((attempt) => attempt?.finishedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const selected = await selectDiagnosticLog(
    root,
    args.get("device-log") ? path.resolve(args.get("device-log")) : null,
    args.get("run-started-at") || null,
    runFinishedAt,
  );
  const summary = summarizeAutoplayEvidence(selected.events, uiEvidence.attempts || []);
  const result = {
    schemaVersion: "qr-mob-021.live-autoplay.v1",
    collectedAt: new Date().toISOString(),
    runStartedAt: args.get("run-started-at") || null,
    deviceLog: selected.path ? path.relative(root, selected.path) : null,
    uiEvidence: evidencePath ? path.relative(root, evidencePath) : null,
    ...summary,
  };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`QR-MOB-021 live autoplay evidence: ${outputPath}`);
  if (args.has("strict")) {
    const requiredAssertions = [
      "attemptCountMatchesUiEvidence",
      "allLiveEndpoint",
      "noFixtureRouting",
      "sourceAssertionObserved",
      "sourceIdentityObserved",
      "replyCompletionRecorded",
      "nativeLifecycleObserved",
      "durationsRecorded",
      "autoplayRecorded",
    ];
    if (requiredAssertions.some((assertion) => result.assertions[assertion] !== true)) {
      process.exitCode = 4;
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await runCli();
}
