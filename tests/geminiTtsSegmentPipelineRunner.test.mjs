import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  DEFAULT_SOURCE,
  EXPECTED_SOURCE_SHA256,
  MARKER,
  buildSegmentPrompt,
  buildSegmentRequest,
  parseArgs,
  runSegmentAttempt,
  runSegmentPipeline,
  splitSourceIntoSegments,
} from "../scripts/run-gemini-tts-segment-pipeline.mjs";
import {
  GEMINI_SPOKEN_BEGIN,
  GEMINI_SPOKEN_END,
  GEMINI_SPOKEN_PROMPT_VERSION,
  buildGeminiSpokenPrompt,
} from "../scripts/gemini-tts-segment-pipeline-lib.mjs";

function sseResponse({ status = "completed", pcm = Buffer.from([1, 0, 2, 0]), eventType = "interaction.completed", mimeType = "audio/pcm" } = {}) {
  const audio = `event: step.delta\ndata: ${JSON.stringify({ type: "step.delta", delta: { type: "audio", mime_type: mimeType, data: pcm.toString("base64") } })}\n\n`;
  const terminal = `event: ${eventType}\ndata: ${JSON.stringify({ type: eventType, status })}\n\n`;
  return new Response(audio + terminal, { status: 200, headers: { "content-type": "text/event-stream" } });
}

test("dry-run segments the frozen source and never calls fetch", async () => {
  let calls = 0;
  const result = await runSegmentPipeline({
    sourcePath: DEFAULT_SOURCE,
    targetCharacters: 300,
    fetchImpl: async () => { calls += 1; throw new Error("network must not be called"); },
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.networkCalls, 0);
  assert.equal(calls, 0);
  assert.equal(result.source.sha256, EXPECTED_SOURCE_SHA256);
  assert.ok(result.plannedSegments.length > 1);
  assert.equal(result.analysisRequired, true);
  assert.equal(result.verifiedForPlayback, false);
  assert.ok(result.plannedSegments.every((segment) => segment.promptSha256 && segment.payloadSha256 && !("text" in segment)));
  assert.ok(result.plannedSegments.every((segment) => segment.promptVersion === GEMINI_SPOKEN_PROMPT_VERSION && segment.spokenScriptSha256 && segment.spokenSeparator === "LF"));
  assert.ok(result.plannedSegments.every((segment) => segment.totalSegments === result.plannedSegments.length && segment.sourceBoundary?.unit === "normalized_lexical_token"));
  assert.ok(result.plannedSegments.every((segment) => segment.expectedEndingTokenCount > 0 && segment.expectedEndingSha256 && segment.markerSha256 && segment.markerTokenCount === 3));
});

test("segment planner uses one unambiguous spoken region and retains only hashes", async () => {
  const segments = await splitSourceIntoSegments("One short sentence. Two short sentences.", { targetCharacters: 100 });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, "One short sentence. Two short sentences.");
  const prompt = buildSegmentPrompt(segments[0].text, { marker: MARKER, index: 0, total: 1 });
  assert.equal((prompt.match(/Violet window thirteen\./g) || []).length, 1);
  assert.equal((prompt.match(new RegExp(GEMINI_SPOKEN_BEGIN, "g")) || []).length, 2);
  assert.equal((prompt.match(new RegExp(GEMINI_SPOKEN_END, "g")) || []).length, 2);
  assert.doesNotMatch(prompt, /BEGIN SEGMENT|END SEGMENT|EXPENDABLE SUFFIX/);
  const spokenRegion = prompt.slice(prompt.indexOf(`\n${GEMINI_SPOKEN_BEGIN}\n`) + GEMINI_SPOKEN_BEGIN.length + 2, prompt.lastIndexOf(`\n${GEMINI_SPOKEN_END}`));
  assert.equal(spokenRegion, `${segments[0].text}\n${MARKER}`);
  const request = buildSegmentRequest({ segment: segments[0], index: 0, total: 1 });
  assert.equal(request.payload.model, "gemini-3.1-flash-tts-preview");
  assert.equal(request.payload.generation_config.speech_config[0].voice, "Kore");
  assert.equal(request.payload.stream, true);
  assert.equal(request.promptVersion, GEMINI_SPOKEN_PROMPT_VERSION);
  assert.equal(request.spokenSeparator, "LF");
  assert.ok(request.spokenScriptSha256);
});

test("corrected prompt rejects delimiter and marker collisions", () => {
  assert.throws(() => buildGeminiSpokenPrompt("Text containing BEGIN SPOKEN TEXT unexpectedly.", { marker: MARKER }), /delimiter/);
  assert.throws(() => buildGeminiSpokenPrompt("A violet reflection appears.", { marker: MARKER }), /collides/);
  assert.throws(() => buildGeminiSpokenPrompt("Ordinary source.", { marker: "END SEGMENT" }), /delimiter/);
});

test("source hash verification occurs before even a dry-run plan", async () => {
  await assert.rejects(
    () => runSegmentPipeline({ sourcePath: join(tmpdir(), "missing-frozen-source.txt") }),
    /ENOENT|no such file/i,
  );
});

test("CLI requires both execution confirmations", () => {
  assert.throws(() => parseArgs(["--execute"]), /confirm-paid-provider-call/i);
  assert.throws(() => parseArgs(["--confirm-paid-provider-call"]), /requires --execute/i);
  assert.equal(parseArgs(["--dry-run", "--target-characters", "500"]).targetCharacters, 500);
});

test("one provider call per segment stops on the first decisive failure", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "gemini-segments-stop-"));
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return sseResponse(requests.length === 1 ? {} : { status: "failed", eventType: "interaction.status_update" });
  };
  const result = await runSegmentPipeline({
    sourcePath: DEFAULT_SOURCE,
    outputRoot,
    execute: true,
    confirmPaidProviderCall: true,
    env: { GEMINI_API_KEY: "test-only" },
    targetCharacters: 300,
    fetchImpl,
    semanticVerifier: async () => ({ ok: true, classification: "complete" }),
  });
  assert.equal(result.stoppedEarly, true);
  assert.equal(result.networkCalls, 2);
  assert.equal(result.segments.length, 2);
  assert.equal("expectedEndingTokens" in result.segments[0], false);
  assert.match(result.segments[0].wav, /audio\.wav$/);
  assert.match(result.segments[0].sourceFile, /source\.txt$/);
  assert.equal(requests.length, 2);
  assert.equal(result.attempts[0].terminalPass, true);
  assert.equal(result.attempts[0].verifiedForPlayback, false);
  assert.equal(result.attempts[1].terminalPass, false);
  assert.equal(result.attempts[1].failureReason, "failed");
});

test("semantic verification failure stops before the next paid segment", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "gemini-segments-semantic-stop-"));
  let calls = 0;
  const result = await runSegmentPipeline({
    sourcePath: DEFAULT_SOURCE,
    outputRoot,
    execute: true,
    confirmPaidProviderCall: true,
    env: { GEMINI_API_KEY: "test-only" },
    targetCharacters: 300,
    fetchImpl: async () => { calls += 1; return sseResponse(); },
    semanticVerifier: async () => ({ ok: false, classification: "ending_missing", failure: "recognizer_missing_expected_ending" }),
  });
  assert.equal(calls, 1);
  assert.equal(result.networkCalls, 1);
  assert.equal(result.stoppedEarly, true);
  assert.equal(result.segments[0].failureReason, "ending_missing");
  assert.equal(result.segments[0].semanticVerification.ok, false);
});

test("non-2xx and conflicting terminal events fail closed", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "gemini-segment-http-terminal-"));
  const segment = { index: 0, text: "A bounded segment.", textSha256: "segment-hash", finalTokens: ["a", "bounded", "segment"] };
  const request = buildSegmentRequest({ segment, index: 0, total: 1 });
  const failed = await runSegmentAttempt({
    request,
    segment,
    source: { sha256: EXPECTED_SOURCE_SHA256, bytes: 100 },
    apiKey: "test-only",
    outputDir,
    fetchImpl: async () => new Response("provider unavailable", { status: 503 }),
  });
  assert.equal(failed.httpPass, false);
  assert.equal(failed.failureReason, "http_503");

  const conflicted = await runSegmentAttempt({
    request,
    segment,
    source: { sha256: EXPECTED_SOURCE_SHA256, bytes: 100 },
    apiKey: "test-only",
    outputDir,
    attemptIndex: 2,
    fetchImpl: async () => {
      const pcm = Buffer.from([1, 0, 2, 0]).toString("base64");
      const stream = [
        `event: step.delta\ndata: ${JSON.stringify({ type: "step.delta", delta: { type: "audio", mime_type: "audio/pcm", data: pcm } })}\n\n`,
        `event: interaction.failed\ndata: ${JSON.stringify({ type: "interaction.failed", status: "failed" })}\n\n`,
        `event: interaction.completed\ndata: ${JSON.stringify({ type: "interaction.completed", status: "completed" })}\n\n`,
      ].join("");
      return new Response(stream, { status: 200 });
    },
  });
  assert.equal(conflicted.terminalPass, false);
  assert.equal(conflicted.failureReason, "failed");
});

test("exact completed terminal and valid PCM are required, and manifests exclude source/prompt", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "gemini-segment-attempt-"));
  const segment = { index: 0, text: "A bounded segment.", textSha256: "segment-hash" };
  const request = buildSegmentRequest({ segment, index: 0, total: 1 });
  const source = { sha256: EXPECTED_SOURCE_SHA256, bytes: 100, contents: Buffer.from("not retained") };
  const result = await runSegmentAttempt({
    request,
    segment,
    source,
    apiKey: "test-only",
    outputDir,
    fetchImpl: async () => sseResponse(),
  });
  assert.equal(result.terminalPass, true);
  assert.equal(result.formatFailure, null);
  assert.equal(result.verifiedForPlayback, false);
  assert.equal(result.analysis.status, "not_run");
  const manifest = JSON.parse(await readFile(join(result.segmentDir, "manifest.json"), "utf8"));
  assert.equal(manifest.segment.sha256, "segment-hash");
  assert.equal(manifest.request.promptSha256, request.promptSha256);
  assert.equal("prompt" in manifest.request, false);
  assert.equal("text" in manifest.segment, false);
  assert.equal("expectedEndingTokens" in manifest, false);
  assert.equal(JSON.stringify(manifest).includes("A bounded segment."), false);
  assert.equal(JSON.stringify(manifest).includes(MARKER), true);
});

test("missing completed event fails closed even when PCM is present", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "gemini-segment-missing-terminal-"));
  const segment = { index: 0, text: "A bounded segment.", textSha256: "segment-hash" };
  const request = buildSegmentRequest({ segment, index: 0, total: 1 });
  const result = await runSegmentAttempt({
    request,
    segment,
    source: { sha256: EXPECTED_SOURCE_SHA256, bytes: 100, contents: Buffer.from("not retained") },
    apiKey: "test-only",
    outputDir,
    fetchImpl: async () => sseResponse({ status: "", eventType: "step.delta" }),
  });
  assert.equal(result.terminalPass, false);
  assert.equal(result.failureReason, "missing_terminal");
  assert.equal(result.verifiedForPlayback, false);
});

test("explicit incompatible PCM parameters fail closed", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "gemini-segment-format-"));
  const segment = { index: 0, text: "A bounded segment.", textSha256: "segment-hash" };
  const request = buildSegmentRequest({ segment, index: 0, total: 1 });
  const result = await runSegmentAttempt({
    request,
    segment,
    source: { sha256: EXPECTED_SOURCE_SHA256, bytes: 100 },
    apiKey: "test-only",
    outputDir,
    fetchImpl: async () => sseResponse({ mimeType: "audio/l16;rate=16000;channels=2" }),
  });
  assert.equal(result.terminalPass, true);
  assert.equal(result.formatFailure, "unexpected_pcm_format");
  assert.equal(result.decisiveFailure, true);
});

test("an incompatible earlier PCM delta cannot be hidden by a valid final delta", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "gemini-segment-mixed-format-"));
  const segment = { index: 0, text: "A bounded segment.", textSha256: "segment-hash" };
  const request = buildSegmentRequest({ segment, index: 0, total: 1 });
  const result = await runSegmentAttempt({
    request,
    segment,
    source: { sha256: EXPECTED_SOURCE_SHA256, bytes: 100 },
    apiKey: "test-only",
    outputDir,
    fetchImpl: async () => {
      const pcm = Buffer.from([1, 0, 2, 0]).toString("base64");
      const delta = (mimeType) => `event: step.delta\ndata: ${JSON.stringify({ type: "step.delta", delta: { type: "audio", mime_type: mimeType, data: pcm } })}\n\n`;
      const terminal = `event: interaction.completed\ndata: ${JSON.stringify({ type: "interaction.completed", status: "completed" })}\n\n`;
      return new Response(delta("audio/l16;rate=16000;channels=2") + delta("audio/l16") + terminal, { status: 200 });
    },
  });
  assert.equal(result.terminalPass, true);
  assert.equal(result.formatFailure, "unexpected_pcm_format");
  assert.equal(result.decisiveFailure, true);
});
