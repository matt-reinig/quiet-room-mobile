#!/usr/bin/env node

/*
 * QR-MOB-021 Gemini control harness.
 *
 * This file is deliberately self contained.  The provider request is behind
 * runExperiment's fetchImpl argument so the safety/serialization behavior can
 * be tested without a network request (or a credential).  The default command
 * is a dry run; paid calls require both --execute and
 * --confirm-paid-provider-call.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readInteractionsSse } from "./gemini-tts-sse-lib.mjs";
import { validateGeminiStreamingResponse } from "./gemini-tts-provider-lib.mjs";
import { selectNonCollidingMarker } from "./gemini-tts-segment-pipeline-lib.mjs";

export const EXPECTED_SOURCE_SHA256 = "13a3ddd146503d36f9b0ae121eee477a6db2cf095246cbb06f891c107731d4b7";
export const MODEL = "gemini-3.1-flash-tts-preview";
export const API_REVISION = "2026-05-20";
// A fixed, documented Gemini single-speaker voice.  No voice selection is
// inferred from account defaults.
export const VOICE = "Kore";
export const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const EXPECTED_PCM = Object.freeze({ mimeType: "audio/pcm", sampleRate: 24000, channels: 1, bitsPerSample: 16 });
export const MARKER = "Violet window thirteen.";
export const MODES = Object.freeze(["control", "tail-a", "tail-b", "matrix"]);
export const DEFAULT_SOURCE = resolve(process.cwd(), "artifacts/qr-mob-021/controlled-comparison-20260917/frozen-source.txt");
export const DEFAULT_OUTPUT_ROOT = resolve(process.cwd(), "artifacts/qr-mob-021/gemini-provider-control");

const SAFE_RESPONSE_HEADERS = Object.freeze([
  "cache-control", "content-length", "content-type", "date", "etag", "last-modified",
  "retry-after", "server", "transfer-encoding", "vary", "x-goog-api-client", "x-goog-quota-project",
  "x-request-id",
]);
const DEFAULT_REPEAT_COUNT = 3;
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
export const MARKER_CANDIDATES = Object.freeze([MARKER, "Quartz harbor seventeen.", "Silver orchard twenty-three."]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function elapsedMs(start) {
  return Number((Number(process.hrtime.bigint() - start) / 1e6).toFixed(3));
}

function safeHeaderMap(headers) {
  const result = {};
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = headers?.get?.(name) ?? headers?.[name];
    if (value !== undefined && value !== null) result[name] = String(value);
  }
  return result;
}

function redactedString(value) {
  if (typeof value !== "string") return value;
  if (/^(?:https?:\/\/|wss?:\/\/)/i.test(value)) return "[redacted-url]";
  if (/\b(?:bearer|api[_ -]?key|token|secret|password|cookie)\b\s*[:=]/i.test(value)) return "[redacted]";
  return value.length > 20000 ? `${value.slice(0, 20000)}[truncated]` : value;
}

export function sanitizeEvent(value, key = "") {
  if (/authorization|api[_-]?key|access[_-]?tokens?|refresh[_-]?tokens?|tokens?|cookie|password|secret|credential/i.test(key)) return "[redacted]";
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactedString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeEvent(item, key));
  if (typeof value === "object") {
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) result[childKey] = sanitizeEvent(childValue, childKey);
    return result;
  }
  return "[redacted]";
}

function parseDotEnv(text) {
  const values = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

export async function loadGeminiApiKey({ env = process.env, envPath = resolve(process.cwd(), ".env"), readFileImpl = readFile } = {}) {
  if (typeof env.GEMINI_API_KEY === "string" && env.GEMINI_API_KEY.trim()) return env.GEMINI_API_KEY.trim();
  try {
    const parsed = parseDotEnv(await readFileImpl(envPath, "utf8"));
    return parsed.GEMINI_API_KEY?.trim() || null;
  } catch (error) {
    if (error?.code !== "ENOENT") throw new Error("unable to read the local environment file");
    return null;
  }
}

export async function verifyFrozenSource(sourcePath = DEFAULT_SOURCE, readFileImpl = readFile) {
  const contents = await readFileImpl(sourcePath);
  const digest = sha256(contents);
  if (digest !== EXPECTED_SOURCE_SHA256) {
    throw new Error(`frozen source SHA-256 mismatch (expected ${EXPECTED_SOURCE_SHA256}, got ${digest})`);
  }
  return { sourcePath: resolve(sourcePath), contents, bytes: contents.byteLength, sha256: digest };
}

function transcriptForMode(source, mode, marker = MARKER) {
  if (mode === "control") return source;
  if (mode === "tail-a") return `${source.trimEnd()}\n\n${marker}`;
  if (mode === "tail-b") return `${source.trimEnd()}\n\n${[marker, marker, marker].join("\n")}`;
  throw new Error(`unsupported mode: ${mode}`);
}

export function buildPrompt(transcript) {
  return [
    "Read only the text between BEGIN TRANSCRIPT and END TRANSCRIPT aloud.",
    "Do not read the labels or these directions. Use one consistent, calm, single-speaker voice.",
    "BEGIN TRANSCRIPT",
    transcript,
    "END TRANSCRIPT",
  ].join("\n");
}

export function buildRequest({ mode, sourceText, marker = MARKER }) {
  const transcript = transcriptForMode(sourceText, mode, marker);
  const prompt = buildPrompt(transcript);
  const payload = {
    model: MODEL,
    input: prompt,
    stream: true,
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: VOICE }] },
  };
  return {
    mode,
    model: MODEL,
    voice: VOICE,
    apiRevision: API_REVISION,
    marker,
    transcript,
    prompt,
    payload,
    transcriptSha256: sha256(transcript),
    promptSha256: sha256(prompt),
    payloadSha256: sha256(JSON.stringify(payload)),
    transcriptBytes: Buffer.byteLength(transcript),
    transcriptCharacters: [...transcript].length,
  };
}

function toAsyncIterable(body) {
  if (!body) throw new Error("provider response has no body");
  if (body[Symbol.asyncIterator]) return body;
  if (body.getReader) {
    const reader = body.getReader();
    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const item = await reader.read();
          if (item.done) return;
          yield item.value;
        }
      },
    };
  }
  throw new Error("provider response body is not an async iterable");
}

function decodeChunk(value) {
  if (typeof value === "string") return Buffer.from(value);
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return Buffer.from(value);
  return Buffer.from(String(value));
}

function eventAudio(value) {
  if (!value || typeof value !== "object") return null;
  const eventType = String(value.type || value.event || value.event_type || "").toLowerCase();
  const likelyAudio = /audio|pcm|delta|content/.test(eventType) || value.delta?.type === "audio";
  const seen = new Set();
  const walk = (node, key = "") => {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    if (typeof node === "string") return null;
    if (typeof node.data === "string" && (likelyAudio || /audio|pcm|inline|data/i.test(key))) {
      try {
        const decoded = Buffer.from(node.data, "base64");
        if (decoded.length > 0) return { bytes: decoded, mimeType: node.mimeType || node.mime_type || node.contentType || EXPECTED_PCM.mimeType };
      } catch { /* not a base64 audio field */ }
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (typeof child === "string" && /^(?:audio|pcm|audioData|audio_data)$/i.test(childKey)) {
        try {
          const decoded = Buffer.from(child, "base64");
          if (decoded.length > 0) return { bytes: decoded, mimeType: EXPECTED_PCM.mimeType };
        } catch { /* continue */ }
      }
      const found = walk(child, childKey);
      if (found) return found;
    }
    return null;
  };
  return walk(value);
}

function terminalFromEvent(eventName, data) {
  const type = String(data?.type || data?.event_type || eventName || "").toLowerCase();
  const status = String(data?.status || data?.interaction?.status || data?.data?.status || "").toLowerCase();
  const terminalStatus = ["completed", "failed", "cancelled", "canceled", "incomplete", "error"].includes(status);
  if (terminalStatus || type.includes("completed") || type.includes("failed") || type.includes("cancel") || type.includes("incomplete") || type.includes("error")) {
    return { event: eventName || data?.type || null, type, status: status || null, data: sanitizeEvent(data) };
  }
  return null;
}

async function readSse(response, startedAt) {
  const decoder = new TextDecoder();
  let carry = "";
  let eventName = "message";
  let dataLines = [];
  const events = [];
  const deltas = [];
  const audioParts = [];
  let totalBytes = 0;
  let mimeType = null;
  let terminal = null;
  let eventIndex = 0;
  const dispatch = () => {
    if (dataLines.length === 0) { eventName = "message"; return; }
    const rawData = dataLines.join("\n");
    let parsed = rawData;
    try { parsed = JSON.parse(rawData); } catch { /* retain malformed event for the manifest */ }
    const elapsed = elapsedMs(startedAt);
    const audio = eventAudio(parsed);
    const event = { index: eventIndex++, name: eventName, elapsedMs: elapsed, data: sanitizeEvent(parsed) };
    if (audio) {
      if (audio.mimeType) mimeType = String(audio.mimeType);
      totalBytes += audio.bytes.length;
      audioParts.push(audio.bytes);
      deltas.push({ index: event.index, elapsedMs: elapsed, bytes: audio.bytes.length, totalBytes, mimeType: audio.mimeType || EXPECTED_PCM.mimeType });
      event.audioDelta = { bytes: audio.bytes.length, totalBytes, mimeType: audio.mimeType || EXPECTED_PCM.mimeType };
    }
    events.push(event);
    terminal = terminalFromEvent(eventName, parsed) || terminal;
    eventName = "message";
    dataLines = [];
  };
  for await (const chunk of toAsyncIterable(response.body)) {
    carry += decoder.decode(decodeChunk(chunk), { stream: true });
    const lines = carry.split(/\r?\n/);
    carry = lines.pop() || "";
    for (const line of lines) {
      if (line === "") { dispatch(); continue; }
      if (line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator < 0 ? line : line.slice(0, separator);
      const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
      if (field === "event") eventName = value;
      else if (field === "data") dataLines.push(value);
    }
  }
  carry += decoder.decode();
  if (carry.trim() || dataLines.length) {
    for (const line of carry.split(/\r?\n/)) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    dispatch();
  }
  return { events, deltas, audio: Buffer.concat(audioParts), totalBytes, mimeType, terminal };
}

async function readSharedSse(response, startedAt) {
  const parsed = await readInteractionsSse(response, {
    elapsedMs: () => elapsedMs(startedAt),
    sanitize: sanitizeEvent,
    defaultMimeType: EXPECTED_PCM.mimeType,
  });
  parsed.terminal = parsed.events.map((event) => terminalFromEvent(event.name, event.data)).filter(Boolean).at(-1) || null;
  return parsed;
}

export function pcmToWav(pcm, { sampleRate = EXPECTED_PCM.sampleRate, channels = EXPECTED_PCM.channels, bitsPerSample = EXPECTED_PCM.bitsPerSample } = {}) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(byteRate, 28); header.writeUInt16LE(blockAlign, 32); header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function terminalPass(parsed) {
  const terminal = parsed.terminal;
  return Boolean(terminal && terminal.type.includes("completed") && (terminal.status === "completed" || terminal.status === "success"));
}

function formatFailure(parsed) {
  if (!parsed.audio.length) return "empty_pcm";
  if (parsed.audio.length % 2 !== 0) return "odd_pcm_byte_count";
  if (parsed.mimeType && !/^audio\/(?:pcm|raw|l16)$/i.test(parsed.mimeType)) return "unexpected_pcm_mime";
  return null;
}

async function writeAttempt({ outputDir, request, source, response, parsed, startedAt, attemptIndex, localAbort = null }) {
  const attemptDir = join(outputDir, `${String(attemptIndex).padStart(2, "0")}-${request.mode}`);
  await mkdir(attemptDir, { recursive: true });
  const pcmPath = join(attemptDir, "audio.pcm");
  const wavPath = join(attemptDir, "audio.wav");
  await writeFile(pcmPath, parsed.audio);
  await writeFile(wavPath, pcmToWav(parsed.audio));
  const acceptance = validateGeminiStreamingResponse({
    status: response?.status,
    events: parsed.events.map((event) => event.data),
    audioDeltas: parsed.audioDeltas,
    audio: parsed.audio,
  });
  const formatReasons = new Set(["empty_pcm", "odd_pcm_byte_count", "unexpected_pcm_mime", "unexpected_pcm_format", "missing_audio_delta"]);
  const formatError = formatReasons.has(acceptance.reason) ? acceptance.reason : null;
  const terminalOk = Boolean(acceptance.terminal?.completed);
  const terminalFailure = terminalOk ? null : acceptance.terminal?.outcome || acceptance.reason;
  const manifest = {
    schemaVersion: 1,
    attemptIndex,
    mode: request.mode,
    startedAt: new Date(Date.now() - elapsedMs(startedAt)).toISOString(),
    endedAt: nowIso(),
    elapsedMs: elapsedMs(startedAt),
    source: { sha256: source.sha256, bytes: source.bytes, characters: [...source.contents.toString()].length },
    request: {
      endpointFamily: "generativelanguage.googleapis.com/v1beta/interactions",
      apiRevision: API_REVISION,
      model: MODEL,
      voice: VOICE,
      transcriptSha256: request.transcriptSha256,
      promptSha256: request.promptSha256,
      payloadSha256: request.payloadSha256,
      transcriptBytes: request.transcriptBytes,
      transcriptCharacters: request.transcriptCharacters,
      marker: request.mode === "control" ? null : request.marker,
    },
    response: { status: response?.status ?? null, headers: safeHeaderMap(response?.headers) },
    terminal: parsed.terminal,
    terminalOutcome: acceptance.terminal || null,
    acceptance: { ok: acceptance.ok, reason: acceptance.reason, httpStatus: acceptance.httpStatus, deltaCount: acceptance.deltaCount ?? parsed.deltas.length },
    terminalPass: terminalOk,
    formatFailure: formatError,
    pcm: { mimeType: parsed.mimeType || EXPECTED_PCM.mimeType, sampleRate: EXPECTED_PCM.sampleRate, channels: EXPECTED_PCM.channels, bitsPerSample: EXPECTED_PCM.bitsPerSample, bytes: parsed.audio.length, sha256: sha256(parsed.audio), durationSeconds: parsed.audio.length / (EXPECTED_PCM.sampleRate * EXPECTED_PCM.channels * EXPECTED_PCM.bitsPerSample / 8) },
    eventCount: parsed.events.length,
    deltas: parsed.deltas,
    readError: parsed.readError || null,
    localAbort,
    files: { pcm: pcmPath, wav: wavPath, events: join(attemptDir, "events.jsonl"), responseHeaders: join(attemptDir, "response-headers.json") },
    analyses: { asr: { status: "not_run", baseEn: null, smallEn: null }, marker: { status: "not_run", onsetSamples: null, trimSample: null, trimmedSha256: null, leakage: null } },
    decisiveFailure: Boolean(localAbort || parsed.readError || !acceptance.ok),
    failureReason: localAbort?.reason || parsed.readError || acceptance.reason || null,
  };
  await writeFile(join(attemptDir, "events.jsonl"), parsed.events.map((event) => JSON.stringify(event)).join("\n") + (parsed.events.length ? "\n" : ""));
  await writeFile(join(attemptDir, "response-headers.json"), `${JSON.stringify(safeHeaderMap(response?.headers), null, 2)}\n`);
  await writeFile(join(attemptDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...manifest, attemptDir };
}

export async function runAttempt({ request, source, apiKey, outputDir, fetchImpl = globalThis.fetch, attemptIndex = 1, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for execution");
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
  const startedAt = process.hrtime.bigint();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let response = null;
  let parsed = { events: [], deltas: [], audioDeltas: [], audio: Buffer.alloc(0), totalBytes: 0, mimeType: null, terminal: null, readError: null };
  let localAbort = null;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", "x-goog-api-key": apiKey, "Api-Revision": API_REVISION },
      body: JSON.stringify(request.payload),
      signal: controller.signal,
    });
    parsed = await readSharedSse(response, startedAt);
    if (parsed.readError === "aborted") localAbort = { reason: timedOut ? "timeout" : "cancelled", elapsedMs: elapsedMs(startedAt) };
  } catch (error) {
    localAbort = { reason: timedOut || error?.name === "AbortError" ? "timeout" : "request_error", elapsedMs: elapsedMs(startedAt) };
  } finally {
    clearTimeout(timeout);
  }
  return writeAttempt({ outputDir, request, source, response, parsed, startedAt, attemptIndex, localAbort });
}

function modesFor(mode) {
  if (mode === "matrix") return ["control", "tail-a", "tail-b"];
  return [mode];
}

export async function runExperiment({ mode = "matrix", sourcePath = DEFAULT_SOURCE, outputRoot = DEFAULT_OUTPUT_ROOT, execute = false, confirmPaidProviderCall = false, repeats = DEFAULT_REPEAT_COUNT, env = process.env, envPath = resolve(process.cwd(), ".env"), fetchImpl = globalThis.fetch, readFileImpl = readFile, clock = Date } = {}) {
  if (!MODES.includes(mode)) throw new Error(`invalid mode: ${mode}; choose ${MODES.join(", ")}`);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error("--repeats must be an integer from 1 through 10");
  if (confirmPaidProviderCall && !execute) throw new Error("--confirm-paid-provider-call requires --execute");
  const source = await verifyFrozenSource(sourcePath, readFileImpl);
  const modes = modesFor(mode);
  const sourceText = source.contents.toString("utf8");
  const markerSelection = selectNonCollidingMarker(sourceText, MARKER_CANDIDATES);
  if (!markerSelection.ok) throw new Error("no non-colliding sacrificial marker is available");
  const requests = modes.flatMap((item) => Array.from({ length: repeats }, () => buildRequest({ mode: item, sourceText, marker: markerSelection.selectedMarkerTokens })));
  const dryRun = !execute;
  if (dryRun) return { dryRun: true, mode, source: { path: source.sourcePath, sha256: source.sha256, bytes: source.bytes }, configuration: { model: MODEL, apiRevision: API_REVISION, voice: VOICE, endpointFamily: "generativelanguage.googleapis.com/v1beta/interactions", markerSelection: markerSelection.metadata }, plannedAttempts: requests.map((request, index) => ({ index: index + 1, mode: request.mode, transcriptSha256: request.transcriptSha256, payloadSha256: request.payloadSha256 })), networkCalls: 0 };
  if (!confirmPaidProviderCall) throw new Error("execution requires --confirm-paid-provider-call");
  const apiKey = await loadGeminiApiKey({ env, envPath, readFileImpl });
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for execution (process environment or .env)");
  const stamp = new Date(clock.now()).toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z");
  const outputDir = join(outputRoot, `${stamp}-${mode}`);
  await mkdir(outputDir, { recursive: true });
  const results = [];
  for (const [index, request] of requests.entries()) {
    const result = await runAttempt({ request, source, apiKey, outputDir, fetchImpl, attemptIndex: index + 1 });
    results.push(result);
    if (result.decisiveFailure) break;
  }
  const summary = { schemaVersion: 1, dryRun: false, configuration: { model: MODEL, apiRevision: API_REVISION, voice: VOICE, endpointFamily: "generativelanguage.googleapis.com/v1beta/interactions", markerSelection: markerSelection.metadata }, source: { sha256: source.sha256, bytes: source.bytes }, requestedMode: mode, requestedRepeats: repeats, attempts: results.map((item) => ({ attemptIndex: item.attemptIndex, mode: item.mode, terminalPass: item.terminalPass, formatFailure: item.formatFailure, failureReason: item.failureReason, decisiveFailure: item.decisiveFailure, pcmBytes: item.pcm.bytes })), stoppedEarly: results.length < requests.length, outputDir };
  await writeFile(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

export function parseArgs(argv) {
  const args = { mode: "matrix", execute: false, confirmPaidProviderCall: false, sourcePath: DEFAULT_SOURCE, outputRoot: DEFAULT_OUTPUT_ROOT, repeats: DEFAULT_REPEAT_COUNT, help: false };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") { args.help = true; continue; }
    if (arg === "--execute") { args.execute = true; continue; }
    if (arg === "--dry-run") { args.execute = false; continue; }
    if (arg === "--confirm-paid-provider-call") { args.confirmPaidProviderCall = true; continue; }
    const take = (name) => { const value = argv[++i]; if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`); return value; };
    if (arg === "--mode") { args.mode = take("--mode"); continue; }
    if (arg === "--source") { args.sourcePath = resolve(take("--source")); continue; }
    if (arg === "--output-dir") { args.outputRoot = resolve(take("--output-dir")); continue; }
    if (arg === "--repeats") { args.repeats = Number(take("--repeats")); continue; }
    if (arg.startsWith("--")) throw new Error(`unknown argument: ${arg}`);
    positionals.push(arg);
  }
  if (positionals.length > 1) throw new Error("only one positional mode is allowed");
  if (positionals[0]) args.mode = positionals[0];
  if (!MODES.includes(args.mode)) throw new Error(`invalid mode: ${args.mode}; choose ${MODES.join(", ")}`);
  if (args.execute && !args.confirmPaidProviderCall) throw new Error("execution requires --confirm-paid-provider-call");
  if (args.confirmPaidProviderCall && !args.execute) throw new Error("--confirm-paid-provider-call requires --execute");
  return args;
}

export const HELP = `Usage: node scripts/run-gemini-tts-provider-control.mjs [mode] [options]\n\nModes: control, tail-a, tail-b, matrix (default matrix; three repeats per mode)\nOptions:\n  --execute                         enable paid provider requests\n  --dry-run                         explicitly select the default no-network mode\n  --confirm-paid-provider-call      second required safety confirmation\n  --source PATH                     frozen source text (SHA must match)\n  --output-dir PATH                 ignored artifact root\n  --repeats N                       repeats per mode (1-10)\n  --help                            show this help\n`;

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const args = parseArgs(argv);
    if (args.help) { io.stdout.write(HELP); return 0; }
    const result = await runExperiment(args);
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`gemini provider control failed: ${error?.message || "unknown error"}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
