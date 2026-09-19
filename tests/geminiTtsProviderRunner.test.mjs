import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  buildRequest,
  DEFAULT_SOURCE,
  EXPECTED_SOURCE_SHA256,
  parseArgs,
  runAttempt,
  runExperiment,
  sanitizeEvent,
  verifyFrozenSource,
} from "../scripts/run-gemini-tts-provider-control.mjs";

test("dry-run plans the nine-call matrix without requiring a credential or touching the network", async () => {
  let calls = 0;
  const result = await runExperiment({
    mode: "matrix",
    sourcePath: DEFAULT_SOURCE,
    execute: false,
    fetchImpl: async () => { calls += 1; throw new Error("network must not be called"); },
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.networkCalls, 0);
  assert.equal(result.source.sha256, EXPECTED_SOURCE_SHA256);
  assert.equal(result.plannedAttempts.length, 9);
  assert.deepEqual(result.plannedAttempts.map((attempt) => attempt.mode), [
    "control", "control", "control", "tail-a", "tail-a", "tail-a", "tail-b", "tail-b", "tail-b",
  ]);
  assert.equal(calls, 0);
});

test("the source hash gate fails closed before execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gemini-runner-hash-"));
  const sourcePath = join(directory, "source.txt");
  await writeFile(sourcePath, "not the frozen source\n");
  await assert.rejects(
    () => runExperiment({ mode: "control", sourcePath, execute: false }),
    /frozen source SHA-256 mismatch/,
  );
});

test("argument parser requires the second confirmation for paid execution", () => {
  assert.throws(() => parseArgs(["--execute"]), /execution requires|confirm-paid-provider-call/i);
  assert.throws(() => parseArgs(["--confirm-paid-provider-call"]), /requires --execute/);
  assert.throws(() => parseArgs(["--mode", "unknown"]), /invalid mode/);
  assert.equal(parseArgs(["tail-a", "--repeats", "1"]).repeats, 1);
});

test("credential absence is reported before fetch and never logs a key", async () => {
  let calls = 0;
  await assert.rejects(
    () => runExperiment({
      mode: "control",
      sourcePath: DEFAULT_SOURCE,
      execute: true,
      confirmPaidProviderCall: true,
      env: {},
      envPath: join("/tmp", "gemini-runner-no-such-env"),
      fetchImpl: async () => { calls += 1; throw new Error("network must not be called"); },
    }),
    /GEMINI_API_KEY is required/,
  );
  assert.equal(calls, 0);
});

test("sanitizer redacts sensitive strings and arrays by parent key", () => {
  const sanitized = sanitizeEvent({ apiKey: "secret", tokens: ["one", "two"], nested: { access_token: ["three"] }, safe: ["ok"] });
  assert.deepEqual(sanitized, { apiKey: "[redacted]", tokens: "[redacted]", nested: { access_token: "[redacted]" }, safe: ["ok"] });
});

test("status-update failures stop fail-closed and persist the PCM hash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gemini-runner-terminal-"));
  const source = await verifyFrozenSource(DEFAULT_SOURCE);
  const request = buildRequest({ mode: "control", sourceText: source.contents.toString("utf8") });
  const pcm = Buffer.from([1, 0, 2, 0]);
  const sse = [
    `event: step.delta\ndata: ${JSON.stringify({ event_type: "step.delta", delta: { type: "audio", mime_type: "audio/l16", data: pcm.toString("base64") } })}\n`,
    `event: interaction.status_update\ndata: ${JSON.stringify({ event_type: "interaction.status_update", status: "failed" })}\n`,
    "",
  ].join("\n");
  const result = await runAttempt({
    request,
    source,
    apiKey: "test-only",
    outputDir: directory,
    fetchImpl: async () => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }),
  });
  assert.equal(result.terminalPass, false);
  assert.equal(result.failureReason, "failed");
  assert.equal(result.eventCount, 2);
  assert.equal(result.pcm.sha256, "7b11c1133330cd161071bf23a0c9b6ce5320a8f3a0f83620035a72be46df4104");
});

test("HTTP 500 and failed-then-completed streams fail strict shared acceptance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gemini-runner-strict-"));
  const source = await verifyFrozenSource(DEFAULT_SOURCE);
  const request = buildRequest({ mode: "control", sourceText: source.contents.toString("utf8") });
  const pcm = Buffer.from([1, 0, 2, 0]);
  const audio = `event: step.delta\ndata: ${JSON.stringify({ event_type: "step.delta", delta: { type: "audio", mime_type: "audio/l16", data: pcm.toString("base64") } })}\n\n`;
  const completed = `event: interaction.completed\ndata: ${JSON.stringify({ event_type: "interaction.completed", interaction: { status: "completed" } })}\n\n`;
  const httpFailure = await runAttempt({ request, source, apiKey: "test-only", outputDir: directory, fetchImpl: async () => new Response(audio + completed, { status: 500 }) });
  assert.equal(httpFailure.acceptance.ok, false);
  assert.equal(httpFailure.failureReason, "http_500");

  const failed = `event: interaction.failed\ndata: ${JSON.stringify({ event_type: "interaction.failed", status: "failed" })}\n\n`;
  const conflict = await runAttempt({ request, source, apiKey: "test-only", outputDir: directory, attemptIndex: 2, fetchImpl: async () => new Response(audio + failed + completed, { status: 200 }) });
  assert.equal(conflict.acceptance.ok, false);
  assert.equal(conflict.failureReason, "failed");
});

test("request timeout is bounded and recorded without exposing error text", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gemini-runner-timeout-"));
  const source = await verifyFrozenSource(DEFAULT_SOURCE);
  const request = buildRequest({ mode: "control", sourceText: source.contents.toString("utf8") });
  const result = await runAttempt({
    request,
    source,
    apiKey: "test-only",
    outputDir: directory,
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("private detail"), { name: "AbortError" })))),
  });
  assert.equal(result.localAbort.reason, "timeout");
  assert.equal(result.failureReason, "timeout");
  assert.equal(result.pcm.bytes, 0);
  assert.equal(JSON.stringify(result).includes("private detail"), false);
});
