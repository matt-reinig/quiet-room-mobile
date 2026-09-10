import assert from "node:assert/strict";
import test from "node:test";

import {
  TRACK_PLAYER_PACKAGE_NAME,
  TRACK_PLAYER_PACKAGE_VERSION,
  VOICE_PLAYBACK_DIAGNOSTIC_PREFIX,
  classifyAllowedFixtureSource,
  classifyAllowedProxySource,
  createVoicePlaybackDiagnosticEmitter,
  formatVoicePlaybackDiagnosticEvent,
  parseVoicePlaybackDiagnosticDeepLink,
  resolveVoicePlaybackSourceIdentity,
  sanitizeVoicePlaybackDiagnosticFields,
} from "../src/lib/voicePlaybackDiagnostics.ts";

const QA_RUNTIME = {
  appVariant: "qa",
  releaseEnv: "local",
  voicePlaybackEngine: "track-player",
};

test("diagnostic deep links require QA/local enablement and a local fixture source", () => {
  assert.deepEqual(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%2C%22fixtureSource%22%3A%22local%22%2C%22fixtureCase%22%3A%22delayed-tail-750%22%7D",
      QA_RUNTIME,
    ),
    {
      enabled: true,
      mode: "fixture",
      fixtureSource: "allowed-local",
      fixtureCase: "delayed-tail-750",
    },
  );

  assert.deepEqual(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%2C%22mode%22%3A%22live-trace%22%7D",
      QA_RUNTIME,
    ),
    {
      enabled: true,
      mode: "live-trace",
    },
  );

  assert.deepEqual(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%2C%22mode%22%3A%22live-proxy%22%2C%22proxyBaseUrl%22%3A%22http%3A%2F%2F10.0.2.2%3A8787%22%7D",
      QA_RUNTIME,
    ),
    {
      enabled: true,
      mode: "live-proxy",
      proxyBaseUrl: "http://10.0.2.2:8787",
    },
  );

  assert.equal(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%2C%22mode%22%3A%22live-trace%22%2C%22fixtureSource%22%3A%22local%22%7D",
      QA_RUNTIME,
    ),
    null,
  );
  assert.equal(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%2C%22mode%22%3A%22live-proxy%22%2C%22proxyBaseUrl%22%3A%22https%3A%2F%2Fexample.com%22%7D",
      QA_RUNTIME,
    ),
    null,
  );
  assert.equal(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%2C%22mode%22%3A%22live-proxy%22%2C%22proxyBaseUrl%22%3A%22http%3A%2F%2F10.0.2.2%3A8787%22%2C%22fixtureSource%22%3A%22local%22%7D",
      QA_RUNTIME,
    ),
    null,
  );
  assert.equal(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%2C%22mode%22%3A%22live-trace%22%2C%22proxyBaseUrl%22%3A%22http%3A%2F%2F10.0.2.2%3A8787%22%7D",
      QA_RUNTIME,
    ),
    null,
  );
  assert.equal(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%2C%22mode%22%3A%22fixture%22%7D",
      QA_RUNTIME,
    ),
    null,
  );
  assert.equal(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%2C%22mode%22%3A%22unknown%22%2C%22fixtureSource%22%3A%22local%22%7D",
      QA_RUNTIME,
    ),
    null,
  );

  assert.equal(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%7D",
      { ...QA_RUNTIME, appVariant: "prod" },
    ),
    null,
  );
  assert.equal(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Atrue%7D",
      { ...QA_RUNTIME, releaseEnv: "prod" },
    ),
    null,
  );
  assert.equal(
    parseVoicePlaybackDiagnosticDeepLink(
      "quietroommobileqa://quiet-room?voiceDiag=%7B%22enabled%22%3Afalse%7D",
      QA_RUNTIME,
    ),
    null,
  );
});

test("fixture source classification rejects remote and credential-bearing sources", () => {
  assert.deepEqual(classifyAllowedFixtureSource("local-fixture"), {
    classification: "allowed-local",
  });
  assert.deepEqual(classifyAllowedFixtureSource("http://10.0.2.2:43121/fixture"), {
    classification: "allowed-url",
    baseUrl: "http://10.0.2.2:43121/fixture",
  });
  assert.deepEqual(classifyAllowedFixtureSource("https://example.com/fixture"), {
    classification: "disallowed",
  });
  assert.deepEqual(classifyAllowedFixtureSource("http://localhost/fixture?token=secret"), {
    classification: "disallowed",
  });
  assert.deepEqual(classifyAllowedFixtureSource("http://user:pass@localhost/fixture"), {
    classification: "disallowed",
  });
  assert.deepEqual(classifyAllowedFixtureSource(undefined), { classification: "missing" });
});

test("proxy source classification accepts only allowlisted local URLs", () => {
  assert.deepEqual(classifyAllowedProxySource("http://localhost:8787"), {
    classification: "allowed-url",
    baseUrl: "http://localhost:8787",
  });
  assert.deepEqual(classifyAllowedProxySource("http://10.0.2.2:8787/api/voice_stream"), {
    classification: "allowed-url",
    baseUrl: "http://10.0.2.2:8787/api/voice_stream",
  });
  assert.deepEqual(classifyAllowedProxySource("local"), { classification: "disallowed" });
  assert.deepEqual(classifyAllowedProxySource("https://example.com/proxy"), {
    classification: "disallowed",
  });
  assert.deepEqual(classifyAllowedProxySource("http://localhost:8787?token=secret"), {
    classification: "disallowed",
  });
  assert.deepEqual(classifyAllowedProxySource("http://localhost:8787?mode=proxy"), {
    classification: "disallowed",
  });
  assert.deepEqual(classifyAllowedProxySource(undefined), { classification: "missing" });
});

test("diagnostic fields are privacy-safe and bounded", () => {
  assert.deepEqual(
    sanitizeVoicePlaybackDiagnosticFields({
      position: 1.25,
      buffered: 3.5,
      state: "buffering",
      Authorization: "Bearer secret",
      token: "secret",
      message: "private assistant content",
      nested: { duration: 4, text: "private content", reason: "tail" },
      tooLong: "x".repeat(140),
    }),
    {
      position: 1.25,
      buffered: 3.5,
      state: "buffering",
      nested: { duration: 4, reason: "tail" },
      tooLong: "x".repeat(120),
    },
  );
});

test("source identity uses only bounded hash/count/slot fields accepted by the sanitizer", async () => {
  const identity = await resolveVoicePlaybackSourceIdentity(
    "finalized assistant words",
    "conversation-private-id",
    7,
    async (value) => `digest:${value}`,
  );

  assert.deepEqual(identity, {
    sourceSha256: "digest:finalized assistant words",
    sourceCharCount: 25,
    conversationSha256: "digest:conversation-private-id",
    sourceSlot: 7,
  });
  assert.deepEqual(sanitizeVoicePlaybackDiagnosticFields(identity), identity);
});

test("emitter includes stable metadata, IDs, monotonic elapsed time, and prefixed JSON", () => {
  let now = 100;
  const lines = [];
  const observed = [];
  const ids = { run: 0, attempt: 0 };
  const emitter = createVoicePlaybackDiagnosticEmitter({
    enabled: true,
    runtime: QA_RUNTIME,
    now: () => now,
    wallNow: () => new Date("2026-09-09T20:00:00.000Z"),
    idFactory: (kind) => `${kind}-${++ids[kind]}`,
    sink: (line) => lines.push(line),
  });
  const unsubscribe = emitter.subscribe((event) => observed.push(event));

  const attemptId = emitter.startAttempt({ sourceClass: "allowed-local" });
  now = 101.4;
  emitter.emit("playback.progress", { position: 1.2, duration: null }, attemptId);
  now = 99;
  emitter.finishAttempt(attemptId, { reason: "queue-ended" });
  unsubscribe();

  assert.equal(emitter.runId, "run-1");
  assert.equal(attemptId, "attempt-1");
  assert.equal(observed.length, 3);
  assert.deepEqual(observed.map((event) => event.elapsedMs), [0, 1, 1]);
  assert.equal(observed[0].runId, "run-1");
  assert.equal(observed[0].attemptId, "attempt-1");
  assert.equal(observed[0].trackPlayerPackage, TRACK_PLAYER_PACKAGE_NAME);
  assert.equal(observed[0].trackPlayerVersion, TRACK_PLAYER_PACKAGE_VERSION);
  assert.equal(observed[0].wallTime, "2026-09-09T20:00:00.000Z");
  assert.match(lines[1], new RegExp(`^${VOICE_PLAYBACK_DIAGNOSTIC_PREFIX} `));
  assert.deepEqual(JSON.parse(lines[1].slice(VOICE_PLAYBACK_DIAGNOSTIC_PREFIX.length + 1)), observed[1]);
  assert.equal(formatVoicePlaybackDiagnosticEvent(observed[1]), lines[1]);
});

test("attempt completion is idempotent", () => {
  const observed = [];
  const emitter = createVoicePlaybackDiagnosticEmitter({
    enabled: true,
    runtime: QA_RUNTIME,
    idFactory: (kind) => `${kind}-id`,
    sink: (_line, event) => observed.push(event),
  });

  const attemptId = emitter.startAttempt();
  emitter.finishAttempt(attemptId, { result: "native-ended" });
  emitter.finishAttempt(attemptId, { result: "cancelled" });

  const finished = observed.filter((event) => event.event === "attempt.finished");
  assert.equal(finished.length, 1);
  assert.equal(finished[0].fields.result, "native-ended");
});

test("disabled emitter emits nothing and does not expose payload fields", () => {
  const lines = [];
  const emitter = createVoicePlaybackDiagnosticEmitter({
    enabled: false,
    runtime: QA_RUNTIME,
    idFactory: (kind) => kind,
    sink: (line) => lines.push(line),
  });

  assert.equal(emitter.startAttempt({ token: "secret" }), "attempt");
  assert.equal(emitter.emit("playback.started", { content: "private" }), null);
  assert.equal(lines.length, 0);
});

test("emitter cannot be enabled outside the QA/local boundary", () => {
  const emitter = createVoicePlaybackDiagnosticEmitter({
    enabled: true,
    runtime: { ...QA_RUNTIME, appVariant: "prod" },
    idFactory: (kind) => kind,
  });

  assert.equal(emitter.enabled, false);
  assert.equal(emitter.emit("run.started"), null);
});
