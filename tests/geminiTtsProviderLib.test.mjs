import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GEMINI_PCM_FORMAT,
  allowlistHeaders,
  classifyInteractionsTerminalOutcome,
  concatenateAudioDeltas,
  extractAudioDeltaRecords,
  extractAudioDelta,
  extractAudioDeltas,
  findLowEnergyBoundary,
  isValidPcmFormat,
  redactCredentialsAndRequestUrls,
  sha256Hex,
  trimPcmAtLowEnergyBoundary,
  validateGeminiNonStreamingResponse,
  validateGeminiStreamingResponse,
  validatePcmFormat,
  wrapPcmInWav,
} from "../scripts/gemini-tts-provider-lib.mjs";

function pcmFromSamples(samples) {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => pcm.writeInt16LE(sample, index * 2));
  return pcm;
}

test("hashes strings and bytes deterministically", () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Hex(Buffer.from("abc")), sha256Hex("abc"));
  assert.throws(() => sha256Hex(42), /string or byte array/);
});

test("validates Gemini PCM and wraps it in a canonical WAV", () => {
  const pcm = pcmFromSamples([0, 1, -2, 32767]);
  assert.deepEqual(validatePcmFormat(pcm), {
    ...GEMINI_PCM_FORMAT,
    byteLength: 8,
    sampleCount: 4,
    durationSeconds: 4 / 24_000,
  });
  assert.equal(isValidPcmFormat(pcm), true);
  assert.equal(isValidPcmFormat(Buffer.from([0])), false);
  assert.throws(() => validatePcmFormat(pcm, { sampleRate: 48_000 }), /24 kHz/);

  const wav = wrapPcmInWav(pcm);
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24_000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), pcm.byteLength);
  assert.deepEqual(wav.subarray(44), pcm);
});

test("selects a low-energy boundary before a marker and fades a copy", () => {
  const samples = [
    ...Array(8).fill(12_000),
    ...Array(8).fill(0),
    ...Array(8).fill(-10_000),
  ];
  const pcm = pcmFromSamples(samples);
  const original = Buffer.from(pcm);
  const boundary = findLowEnergyBoundary(pcm, 16, {
    windowSamples: 4,
    searchBackSamples: 16,
    stepSamples: 1,
    maxRms: 0.01,
    maxPeak: 0.01,
  });
  assert.equal(boundary.boundarySample, 16);
  const result = trimPcmAtLowEnergyBoundary(pcm, 16, {
    windowSamples: 4,
    searchBackSamples: 16,
    stepSamples: 1,
    maxRms: 0.01,
    maxPeak: 0.01,
    fadeSamples: 4,
  });
  assert.equal(result.boundarySample, 16);
  assert.equal(result.pcm.byteLength, 32);
  assert.equal(result.pcm.readInt16LE(30), 0);
  assert.deepEqual(pcm, original);
  const noGap = pcmFromSamples(Array(24).fill(12_000));
  assert.equal(findLowEnergyBoundary(noGap, 16, {
    windowSamples: 4,
    searchBackSamples: 16,
    maxRms: 0,
    maxPeak: 0,
  }), null);
  assert.throws(() => trimPcmAtLowEnergyBoundary(noGap, 16, {
    windowSamples: 4,
    searchBackSamples: 16,
    maxRms: 0,
    maxPeak: 0,
  }), /no safe low-energy/);
});

test("requires the exact completed Interactions terminal event", () => {
  assert.deepEqual(classifyInteractionsTerminalOutcome([
    { type: "interaction.start", interaction: { id: "safe-id" } },
    { type: "audio.delta", delta: "AA==" },
    { type: "interaction.completed", status: "completed" },
  ]), {
    outcome: "completed",
    completed: true,
    eventType: "interaction.completed",
    status: "completed",
    eventIndex: 2,
  });
  assert.equal(classifyInteractionsTerminalOutcome([{ type: "interaction.completed", status: "incomplete" }]).outcome, "incomplete");
  assert.equal(classifyInteractionsTerminalOutcome([{ type: "interaction.completed", status: "completed" }, { type: "error" }]).outcome, "failed");
  assert.equal(classifyInteractionsTerminalOutcome([{ type: "interaction.completed" }]).outcome, "missing_terminal");
  assert.equal(classifyInteractionsTerminalOutcome([{ type: "interaction.cancelled", status: "cancelled" }]).outcome, "cancelled");
  assert.equal(classifyInteractionsTerminalOutcome([{ event_type: "interaction.status_update", status: "failed" }]).outcome, "failed");
  assert.equal(classifyInteractionsTerminalOutcome([{ type: "step.completed", status: "completed" }]).outcome, "invalid_terminal");
  assert.equal(classifyInteractionsTerminalOutcome([
    { type: "interaction.failed", status: "failed" },
    { type: "interaction.completed", status: "completed" },
  ]).outcome, "failed");
});

test("strict streaming acceptance requires HTTP 2xx, exact completion, and every delta format", () => {
  const pcm = Buffer.from([1, 0, 2, 0]);
  const events = [
    { type: "step.delta", delta: { type: "audio", mime_type: "audio/pcm;rate=24000;channels=1;bits=16", data: pcm.toString("base64") } },
    { type: "interaction.completed", status: "completed" },
  ];
  const accepted = validateGeminiStreamingResponse({ status: 200, events });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.deltaCount, 1);
  assert.deepEqual(accepted.pcm, pcm);
  assert.equal(validateGeminiStreamingResponse({ status: 500, events }).reason, "http_500");
  assert.equal(validateGeminiStreamingResponse({ status: 200, events: [{ type: "step.completed", status: "completed" }], audioDeltas: [pcm] }).reason, "invalid_terminal");

  const conflicting = validateGeminiStreamingResponse({
    status: 200,
    events: [
      { type: "step.delta", delta: { type: "audio", mime_type: "audio/pcm;rate=16000;channels=1;bits=16", data: pcm.toString("base64") } },
      { type: "interaction.completed", status: "completed" },
    ],
  });
  assert.equal(conflicting.reason, "unexpected_pcm_format");
  const odd = validateGeminiStreamingResponse({ status: 200, events, audioDeltas: [Buffer.from([1])] });
  assert.equal(odd.reason, "odd_pcm_byte_count");
});

test("streaming extraction retains MIME metadata and non-streaming uses status instead of SSE", () => {
  const pcm = Buffer.from([1, 0, 2, 0]);
  const event = { type: "step.delta", delta: { type: "audio", mime_type: "audio/l16;rate=24000;channels=1;bits=16", data: pcm.toString("base64") } };
  assert.deepEqual(extractAudioDeltaRecords([event])[0], { bytes: pcm, mimeType: "audio/l16;rate=24000;channels=1;bits=16" });
  assert.equal(validateGeminiNonStreamingResponse({ status: 200, interaction: { status: "completed" }, audio: pcm }).ok, true);
  assert.equal(validateGeminiNonStreamingResponse({ status: 200, interaction: { status: "incomplete" }, audio: pcm }).reason, "incomplete");
  assert.equal(validateGeminiNonStreamingResponse({ status: 200, interaction: { status: "completed" }, audio: Buffer.from([1]) }).reason, "odd_pcm_byte_count");
});

test("recursively redacts credentials and only preserves allowlisted request URL parts", () => {
  const input = {
    request: {
      url: "https://generativelanguage.googleapis.com/v1beta/interactions?key=secret-key&trace=abc",
      headers: { Authorization: "Bearer secret-token", "content-type": "application/json" },
      nested: [{ apiKey: "secret", safe: "ok", url: "http://127.0.0.1/private" }],
    },
    usage: { inputTokens: 12, outputTokens: 34 },
    plainUrl: "https://allowed.example/audio?run=run-1&key=secret",
  };
  const output = redactCredentialsAndRequestUrls(input, {
    allowedHosts: ["generativelanguage.googleapis.com", "allowed.example"],
    allowedQueryKeys: ["run"],
  });
  assert.equal(output.request.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(output.request.headers.Authorization, "[REDACTED]");
  assert.equal(output.request.headers["content-type"], "application/json");
  assert.equal(output.request.nested[0].apiKey, "[REDACTED]");
  assert.equal(output.request.nested[0].url, "[REDACTED_URL]");
  assert.deepEqual(output.usage, { inputTokens: 12, outputTokens: 34 });
  assert.equal(output.plainUrl, "https://allowed.example/audio?run=run-1");
  assert.equal(JSON.stringify(output).includes("secret"), false);
});

test("allowlists safe response header names", () => {
  assert.deepEqual(allowlistHeaders({
    "content-type": "audio/pcm",
    "x-goog-request-id": "req-1",
    authorization: "Bearer secret",
    cookie: "secret-cookie",
  }), {
    "content-type": "audio/pcm",
    "x-goog-request-id": "req-1",
  });
});

test("extracts ordered base64 audio deltas and ignores non-audio events", () => {
  const events = [
    { type: "interaction.start", data: "not audio" },
    { type: "audio.delta", delta: "AQI=" },
    { type: "content.audio.delta", delta: { data: "AwQ=" } },
    { type: "content.delta", delta: { audio: { data: "Bw==" } } },
    { type: "audio", audio: { data: "BQY=" } },
    { type: "error", message: "not a delta" },
  ];
  assert.deepEqual(extractAudioDelta(events[0]), null);
  assert.deepEqual(extractAudioDeltas(events), [Buffer.from([1, 2]), Buffer.from([3, 4]), Buffer.from([7]), Buffer.from([5, 6])]);
  assert.deepEqual(concatenateAudioDeltas(events), Buffer.from([1, 2, 3, 4, 7, 5, 6]));
  assert.deepEqual(extractAudioDelta({ type: "audio.delta", delta: "%%%" }), null);
});

test("extracts the documented Interactions step.delta audio shape", () => {
  const event = {
    event_type: "step.delta",
    delta: {
      type: "audio",
      mime_type: "audio/l16",
      data: Buffer.from([1, 2, 3, 4]).toString("base64"),
    },
  };
  assert.deepEqual(extractAudioDelta(event), Buffer.from([1, 2, 3, 4]));
});
