import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  API_REVISION,
  API_VERSION,
  EXPECTED_PROMPT_SHA256,
  EXPECTED_SPOKEN_SCRIPT_SHA256,
  EXPECTED_STREAMING_PAYLOAD_SHA256,
  EXPECTED_NON_STREAMING_PAYLOAD_SHA256,
  EXPECTED_SEGMENT_SHA256,
  EXPECTED_SOURCE_SHA256,
  MODEL,
  REQUEST_TIMEOUT_MS,
  COST_ASSUMPTION,
  SDK_PACKAGE,
  SDK_VERSION,
  VOICE,
  buildClientOptions,
  buildSdkRequest,
  loadPriorSegment,
  parseArgs,
  runComparison,
} from "../scripts/run-gemini-tts-sdk-delivery-comparison.mjs";

const SEGMENT = Object.freeze(await loadPriorSegment());
const semanticAnalyzer = async ({ arm }) => ({
  ok: arm.acceptance.ok,
  classification: arm.acceptance.ok ? "complete" : "provider_failed",
  failure: arm.acceptance.reason || null,
});

function audioBlock(bytes = Buffer.alloc(4_800, 0)) {
  return {
    type: "audio",
    data: bytes.toString("base64"),
    mime_type: "audio/l16",
    sample_rate: 24_000,
    channels: 1,
  };
}

function makeSdk({ streamingEvents, interaction, calls = [], retrievedInteraction, retrievalError }) {
  return {
    GoogleGenAI: class FakeGoogleGenAI {
      constructor(options) {
        this.options = options;
        this.interactions = {
          create: async (payload, requestOptions) => {
            calls.push({ payload, requestOptions, clientOptions: options });
            if (payload.stream) return (async function* stream() { yield* streamingEvents; })();
            return interaction;
          },
          get: async (id, params, requestOptions) => {
            calls.push({ retrieval: true, id, params, requestOptions, clientOptions: options });
            if (retrievalError) throw retrievalError;
            return retrievedInteraction || { id, status: "completed" };
          },
        };
      }
    },
  };
}

async function outputRoot() {
  return mkdtemp(join(tmpdir(), "qr-mob-021-sdk-") );
}

function completeEvent(bytes = Buffer.alloc(4_800, 0)) {
  return [
    { event_type: "interaction.created", interaction: { id: "int_stream", status: "in_progress", model: MODEL } },
    { event_type: "step.start", index: 0, step: { type: "model_output" } },
    { event_type: "step.delta", index: 0, delta: audioBlock(bytes) },
    { event_type: "step.stop", index: 0 },
    { event_type: "interaction.completed", interaction: { id: "int_stream", status: "completed" } },
  ];
}

test("builds the official SDK client options with revision and stable path", () => {
  assert.deepEqual(buildClientOptions("test-key"), {
    apiKey: "test-key",
    apiVersion: API_VERSION,
    httpOptions: { headers: { "Api-Revision": API_REVISION } },
  });
});

test("request arms differ only in stream delivery mode", () => {
  const requests = buildSdkRequest({ prompt: SEGMENT.prompt });
  assert.equal(requests.streaming.stream, true);
  assert.equal(requests.nonStreaming.stream, false);
  assert.deepEqual({ ...requests.streaming, stream: undefined }, { ...requests.nonStreaming, stream: undefined });
  assert.equal(requests.streaming.model, MODEL);
  assert.deepEqual(requests.streaming.generation_config, { speech_config: [{ voice: VOICE }] });
});

test("rebuilds the corrected pinned prompt and never reuses the stale prompt artifact", async () => {
  const prior = await loadPriorSegment({
    readFileImpl: async (path, ...args) => {
      assert.doesNotMatch(String(path), /prompt\.txt$/);
      return readFile(path, ...args);
    },
  });
  assert.equal(prior.promptVersion, "single-spoken-region-v2");
  assert.equal(prior.promptSha256, EXPECTED_PROMPT_SHA256);
  assert.equal(prior.spokenScriptSha256, EXPECTED_SPOKEN_SCRIPT_SHA256);
  assert.equal(prior.spokenSeparator, "LF");
  assert.match(prior.prompt, /BEGIN SPOKEN TEXT/);
  assert.doesNotMatch(prior.prompt, /BEGIN SEGMENT|EXPENDABLE SUFFIX/);
  const requests = buildSdkRequest({ prompt: prior.prompt });
  const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.equal(hash(requests.streaming), EXPECTED_STREAMING_PAYLOAD_SHA256);
  assert.equal(hash(requests.nonStreaming), EXPECTED_NON_STREAMING_PAYLOAD_SHA256);
});

test("rejects caller-supplied stale or unpinned prompts before loading credentials", async () => {
  let credentialsLoaded = false;
  await assert.rejects(
    () => runComparison({
      execute: true,
      confirmPaidProviderCall: true,
      segment: { ...SEGMENT, prompt: `${SEGMENT.prompt}\nstale`, promptSha256: EXPECTED_PROMPT_SHA256 },
      credentialLoader: async () => { credentialsLoaded = true; return "must-not-load"; },
    }),
    /prompt SHA-256 mismatch/,
  );
  assert.equal(credentialsLoaded, false);
});

test("runs exactly streaming then non-streaming with no retry and 120-second timeout", async () => {
  const calls = [];
  const bytes = Buffer.from([1, 2, 3, 4]).subarray(0, 4_800);
  const block = audioBlock(Buffer.alloc(4_800, 7));
  const interaction = {
    id: "int_unary",
    status: "completed",
    steps: [{ type: "model_output", content: [block] }],
    output_audio: block,
  };
  const sdk = makeSdk({ streamingEvents: completeEvent(bytes), interaction, calls });
  const result = await runComparison({
    execute: true,
    confirmPaidProviderCall: true,
    apiKey: "test-key",
    sdk,
    segment: SEGMENT,
    semanticAnalyzer,
    outputRoot: await outputRoot(),
  });
  assert.equal(result.networkCalls, 2);
  assert.deepEqual(result.arms.map((arm) => arm.arm), ["streaming", "non-streaming"]);
  assert.deepEqual(result.arms.map((arm) => arm.ok), [true, true]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.stream, true);
  assert.equal(calls[1].payload.stream, false);
  for (const call of calls) {
    assert.deepEqual(call.requestOptions.retries, { strategy: "none" });
    assert.equal(call.requestOptions.timeout_ms, REQUEST_TIMEOUT_MS);
    assert.equal(call.clientOptions.apiVersion, API_VERSION);
    assert.equal(call.clientOptions.httpOptions.headers["Api-Revision"], API_REVISION);
  }
});

test("finishes non-streaming arm after streaming missing-terminal failure", async () => {
  const calls = [];
  const block = audioBlock(Buffer.alloc(4_800, 9));
  const interaction = { id: "int_unary", status: "completed", steps: [{ type: "model_output", content: [block] }], output_audio: block };
  const sdk = makeSdk({
    streamingEvents: [
      { event_type: "interaction.created", interaction: { id: "int_stream", status: "in_progress" } },
      { event_type: "step.delta", index: 0, delta: block },
    ],
    interaction,
    calls,
  });
  const result = await runComparison({
    execute: true,
    confirmPaidProviderCall: true,
    apiKey: "test-key",
    sdk,
    segment: SEGMENT,
    semanticAnalyzer,
    outputRoot: await outputRoot(),
  });
  assert.equal(result.networkCalls, 2);
  assert.equal(result.arms[0].ok, false);
  assert.equal(result.arms[0].reason, "missing_terminal");
  assert.equal(result.arms[0].retrieval.status, "available");
  assert.equal(result.arms[0].retrieval.interactionStatus, "completed");
  assert.equal(result.arms[1].ok, true);
  assert.equal(calls.filter((call) => !call.retrieval).length, 2);
  assert.equal(calls.filter((call) => call.retrieval).length, 1);
  const armManifest = JSON.parse(await readFile(join(result.outputDir, "01-streaming", "manifest.json"), "utf8"));
  assert.equal(armManifest.retrieval.status, "available");
  assert.equal(armManifest.semanticVerification.ok, false);
  assert.match(armManifest.files.semanticVerification, /semantic-verification\.json$/);
});

test("a 404 diagnostic retrieval does not prevent the non-streaming generation arm", async () => {
  const calls = [];
  const block = audioBlock(Buffer.alloc(4_800, 9));
  const interaction = { id: "int_unary", status: "completed", steps: [{ type: "model_output", content: [block] }] };
  const retrievalError = Object.assign(new Error("not found"), { status: 404 });
  const sdk = makeSdk({
    streamingEvents: [
      { event_type: "interaction.created", interaction: { id: "int_stream", status: "in_progress" } },
      { event_type: "step.delta", index: 0, delta: block },
    ],
    interaction,
    calls,
    retrievalError,
  });
  const result = await runComparison({
    execute: true,
    confirmPaidProviderCall: true,
    apiKey: "test-key",
    sdk,
    segment: SEGMENT,
    semanticAnalyzer,
    outputRoot: await outputRoot(),
  });
  assert.equal(result.networkCalls, 2);
  assert.equal(result.arms[0].retrieval.status, "not_found");
  assert.equal(result.arms[1].ok, true);
});

test("retains ordered non-streaming step audio without duplicating output_audio convenience field", async () => {
  const calls = [];
  const first = audioBlock(Buffer.alloc(4_800, 1));
  const second = audioBlock(Buffer.alloc(4_800, 2));
  const interaction = {
    id: "int_unary",
    status: "completed",
    steps: [{ type: "model_output", content: [first, second] }],
    output_audio: second,
    usage: { total_input_tokens: 10, total_output_tokens: 20 },
  };
  const sdk = makeSdk({ streamingEvents: completeEvent(), interaction, calls });
  const result = await runComparison({
    execute: true,
    confirmPaidProviderCall: true,
    apiKey: "test-key",
    sdk,
    segment: SEGMENT,
    semanticAnalyzer,
    outputRoot: await outputRoot(),
  });
  assert.equal(result.arms[1].audioBlockCount, 2);
  const manifest = JSON.parse(await readFile(join(result.outputDir, "02-non-streaming", "manifest.json"), "utf8"));
  assert.equal(manifest.response.audioBlockCount, 2);
  assert.equal(manifest.pcm.bytes, 9_600);
  assert.equal(Object.hasOwn(manifest.acceptance, "pcm"), false);
  assert.equal(manifest.terminal.steps[0].content[0].data, "[RETAINED_AUDIO_BLOCK]");
  assert.equal(manifest.terminal.output_audio.data, "[RETAINED_AUDIO_BLOCK]");
  assert.deepEqual(manifest.terminal.usage, { total_input_tokens: 10, total_output_tokens: 20 });
  const retainedInteraction = await readFile(join(result.outputDir, "02-non-streaming", "interaction.json"), "utf8");
  assert.match(retainedInteraction, /RETAINED_AUDIO_BLOCK/);
  assert.doesNotMatch(retainedInteraction, new RegExp(second.data));
});

test("stops after a fatal SDK permission error without issuing arm B", async () => {
  const calls = [];
  const sdk = {
    GoogleGenAI: class FakeGoogleGenAI {
      constructor() {
        this.interactions = { create: async () => { calls.push(true); const error = new Error("permission denied"); error.status = 403; throw error; } };
      }
    },
  };
  const result = await runComparison({
    execute: true,
    confirmPaidProviderCall: true,
    apiKey: "test-key",
    sdk,
    segment: SEGMENT,
    outputRoot: await outputRoot(),
  });
  assert.equal(result.networkCalls, 1);
  assert.equal(result.stoppedEarly, true);
  assert.equal(result.arms[0].fatal, true);
  assert.equal(calls.length, 1);
});

test("dry-run does not load SDK, require credentials, or make network calls", async () => {
  let loaded = false;
  let credentialLoaded = false;
  const result = await runComparison({
    segment: SEGMENT,
    loadSdkImpl: async () => { loaded = true; throw new Error("must not load SDK in dry-run"); },
    credentialLoader: async () => { credentialLoaded = true; throw new Error("must not load credentials in dry-run"); },
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.networkCalls, 0);
  assert.equal(loaded, false);
  assert.equal(credentialLoaded, false);
  assert.deepEqual(result.arms, ["streaming", "non-streaming"]);
  assert.equal(result.configuration.costAssumption.requestCap, 2);
  assert.equal(COST_ASSUMPTION.estimatedTwoArmUsdFromPriorReportedUsage, 0.05057);
});

test("CLI requires both execution flags and parses isolated SDK root", () => {
  assert.throws(() => parseArgs(["--execute"]), /confirm-paid-provider-call/);
  assert.throws(() => parseArgs(["--confirm-paid-provider-call"]), /requires --execute/);
  const args = parseArgs(["--sdk-root", "/tmp/sdk", "--output-dir", "/tmp/out"]);
  assert.equal(args.execute, false);
  assert.equal(args.sdkRoot, "/tmp/sdk");
  assert.equal(args.outputRoot, "/tmp/out");
  assert.equal(SDK_PACKAGE, "@google/genai");
  assert.equal(SDK_VERSION, "2.23.0");
});
