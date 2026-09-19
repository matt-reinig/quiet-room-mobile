#!/usr/bin/env node

/*
 * QR-MOB-021 bounded Gemini segment pipeline.
 *
 * This is a provider-only feasibility harness.  It deliberately does not
 * concatenate, play, or otherwise accept provider PCM as verified audio.  A
 * segment is only eligible for a later analysis step after the provider has
 * emitted the exact Interactions completion event and structurally valid PCM.
 * The analysis hook/command plan is kept explicit in every result.
 *
 * Paid requests require both --execute and --confirm-paid-provider-call.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  API_REVISION,
  DEFAULT_SOURCE,
  EXPECTED_SOURCE_SHA256,
  EXPECTED_PCM,
  ENDPOINT,
  MARKER,
  MODEL,
  VOICE,
  loadGeminiApiKey,
  pcmToWav,
  verifyFrozenSource,
} from "./run-gemini-tts-provider-control.mjs";
import { validateGeminiStreamingResponse } from "./gemini-tts-provider-lib.mjs";
import {
  GEMINI_SPOKEN_PROMPT_VERSION,
  buildGeminiSpokenPrompt,
  buildGeminiTtsPayload,
  deriveConservativeFinalLexicalTokens,
  lexicalTokens,
  selectNonCollidingMarker,
} from "./gemini-tts-segment-pipeline-lib.mjs";
import { readInteractionsSse } from "./gemini-tts-sse-lib.mjs";

export { DEFAULT_SOURCE, EXPECTED_SOURCE_SHA256, API_REVISION, ENDPOINT, MARKER, MODEL, VOICE };

export const DEFAULT_OUTPUT_ROOT = resolve(process.cwd(), "artifacts/qr-mob-021/gemini-segment-pipeline");
export const DEFAULT_SEGMENT_TARGET_CHARACTERS = 700;
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
export const MARKER_CANDIDATES = Object.freeze([MARKER, "Quartz harbor seventeen.", "Silver orchard twenty-three."]);
export const SEGMENT_LIB_CANDIDATES = Object.freeze([
  "./gemini-tts-segment-pipeline-lib.mjs",
  "./segment-pipeline-lib.mjs",
]);

const SAFE_RESPONSE_HEADERS = Object.freeze([
  "cache-control", "content-length", "content-type", "date", "etag", "last-modified",
  "retry-after", "server", "transfer-encoding", "vary", "x-goog-api-client", "x-goog-quota-project", "x-request-id",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function elapsedMs(startedAt) {
  return Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(3));
}

function safeHeaderMap(headers) {
  const output = {};
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = headers?.get?.(name) ?? headers?.[name];
    if (value !== undefined && value !== null) output[name] = String(value);
  }
  return output;
}

function sanitize(value, key = "") {
  if (/authorization|api[_-]?key|access[_-]?tokens?|refresh[_-]?tokens?|tokens?|cookie|password|secret|credential/i.test(key)) return "[redacted]";
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return /^(?:https?|wss?):\/\//i.test(value) ? "[redacted-url]" : value.length > 1000 ? `${value.slice(0, 1000)}[truncated]` : value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)]));
  return "[redacted]";
}

function eventType(value) {
  return String(value?.type || value?.event_type || value?.event || "").toLowerCase();
}

function eventStatus(value) {
  return String(value?.status || value?.interaction?.status || value?.data?.status || value?.data?.interaction?.status || "").toLowerCase();
}

function terminalEvent(name, value) {
  const type = eventType(value) || String(name || "").toLowerCase();
  const status = eventStatus(value);
  if (type.includes("completed") || type.includes("failed") || type.includes("cancel") || type.includes("incomplete") || type.includes("error") || ["completed", "failed", "cancelled", "canceled", "incomplete", "error"].includes(status)) {
    return { type, status: status || null, name: name || null };
  }
  return null;
}

function audioFromEvent(value) {
  if (!value || typeof value !== "object") return null;
  const type = eventType(value);
  const likelyAudio = /audio|pcm|delta|content/.test(type) || value.delta?.type === "audio";
  const seen = new Set();
  const walk = (node, key = "") => {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    if (typeof node.data === "string" && (likelyAudio || /audio|pcm|inline|data/i.test(key))) {
      try {
        const bytes = Buffer.from(node.data, "base64");
        if (bytes.length) return { bytes, mimeType: node.mimeType || node.mime_type || node.contentType || EXPECTED_PCM.mimeType };
      } catch { /* malformed data is handled as no audio */ }
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (typeof child === "string" && /^(?:audio|pcm|audioData|audio_data)$/i.test(childKey)) {
        try {
          const bytes = Buffer.from(child, "base64");
          if (bytes.length) return { bytes, mimeType: EXPECTED_PCM.mimeType };
        } catch { /* continue */ }
      }
      const result = walk(child, childKey);
      if (result) return result;
    }
    return null;
  };
  return walk(value);
}

function asAsyncIterable(body) {
  if (!body) throw new Error("provider response has no body");
  if (body[Symbol.asyncIterator]) return body;
  if (body.getReader) {
    const reader = body.getReader();
    return { async *[Symbol.asyncIterator]() { while (true) { const item = await reader.read(); if (item.done) return; yield item.value; } } };
  }
  throw new Error("provider response body is not an async iterable");
}

async function readSse(response, startedAt) {
  const decoder = new TextDecoder();
  let carry = "";
  let eventName = "message";
  let dataLines = [];
  let index = 0;
  let mimeType = null;
  let terminal = null;
  let totalBytes = 0;
  const events = [];
  const parts = [];
  const dispatch = () => {
    if (!dataLines.length) { eventName = "message"; return; }
    const raw = dataLines.join("\n");
    let data = raw;
    try { data = JSON.parse(raw); } catch { /* retain sanitized raw data */ }
    const audio = audioFromEvent(data);
    const event = { index: index++, name: eventName, elapsedMs: elapsedMs(startedAt), data: sanitize(data) };
    if (audio) {
      mimeType = String(audio.mimeType || mimeType || EXPECTED_PCM.mimeType);
      totalBytes += audio.bytes.length;
      parts.push(audio.bytes);
      event.audioDelta = { bytes: audio.bytes.length, totalBytes, mimeType, elapsedMs: event.elapsedMs };
    }
    events.push(event);
    terminal = terminalEvent(eventName, data) || terminal;
    eventName = "message";
    dataLines = [];
  };
  for await (const chunk of asAsyncIterable(response.body)) {
    carry += decoder.decode(typeof chunk === "string" ? Buffer.from(chunk) : chunk, { stream: true });
    const lines = carry.split(/\r?\n/);
    carry = lines.pop() || "";
    for (const line of lines) {
      if (!line) { dispatch(); continue; }
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
  return { events, audio: Buffer.concat(parts), totalBytes, mimeType, terminal };
}

function fallbackSplitSource(sourceText, targetCharacters = DEFAULT_SEGMENT_TARGET_CHARACTERS) {
  const text = String(sourceText);
  const units = text.split(/(?<=[.!?。！？])\s+|\n{2,}/u).map((unit) => unit.trim()).filter(Boolean);
  const segments = [];
  let current = "";
  for (const unit of (units.length ? units : [text.trim()])) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (current && candidate.length > targetCharacters) { segments.push(current); current = unit; } else current = candidate;
  }
  if (current) segments.push(current);
  return segments.map((textValue, index) => ({ index, text: textValue, textSha256: sha256(textValue), characters: [...textValue].length }));
}

let segmentLibPromise;
async function loadSegmentLib() {
  if (!segmentLibPromise) {
    segmentLibPromise = (async () => {
      for (const candidate of SEGMENT_LIB_CANDIDATES) {
        try { return await import(candidate); } catch (error) { if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error; }
      }
      return null;
    })();
  }
  return segmentLibPromise;
}

export async function splitSourceIntoSegments(sourceText, options = {}) {
  const lib = await loadSegmentLib();
  const fn = lib?.splitSourceIntoSegments || lib?.segmentSource || lib?.createSegmentPlan || lib?.buildSegmentPlan;
  const result = typeof fn === "function" ? await fn(sourceText, options) : fallbackSplitSource(sourceText, options.targetCharacters ?? DEFAULT_SEGMENT_TARGET_CHARACTERS);
  const segments = Array.isArray(result) ? result : result?.segments;
  if (!Array.isArray(segments) || !segments.length) throw new Error("segment planner produced no segments");
  return segments.map((segment, index) => {
    const text = String(segment.text ?? segment.sourceText ?? segment.content ?? "");
    if (!text.trim()) throw new Error(`segment ${index + 1} is empty`);
    return {
      index,
      text,
      textSha256: sha256(text),
      characters: [...text].length,
      finalTokens: Array.isArray(segment.finalTokens) && segment.finalTokens.length
        ? segment.finalTokens
        : deriveConservativeFinalLexicalTokens(text),
    };
  });
}

export function buildSegmentPrompt(segmentText, { marker = MARKER, index = 0, total = 1 } = {}) {
  void index;
  void total;
  return buildGeminiSpokenPrompt(segmentText, { marker }).prompt;
}

export function buildSegmentRequest({ segment, index = segment?.index ?? 0, total = 1, marker = MARKER }) {
  const promptDescriptor = buildGeminiSpokenPrompt(segment.text, { marker });
  const prompt = promptDescriptor.prompt;
  const payload = buildGeminiTtsPayload({ model: MODEL, prompt, voice: VOICE, stream: true });
  return {
    segmentIndex: index,
    totalSegments: total,
    marker,
    model: MODEL,
    voice: VOICE,
    apiRevision: API_REVISION,
    promptVersion: GEMINI_SPOKEN_PROMPT_VERSION,
    prompt,
    payload,
    segmentSha256: segment.textSha256 || sha256(segment.text),
    sourceBoundary: segment.sourceBoundary || null,
    expectedEndingTokenCount: segment.finalTokens?.length || 0,
    expectedEndingSha256: sha256(JSON.stringify(segment.finalTokens || [])),
    markerSha256: sha256(marker),
    markerTokenCount: lexicalTokens(marker).length,
    promptSha256: sha256(prompt),
    spokenScriptSha256: sha256(promptDescriptor.spokenScript),
    spokenSeparator: "LF",
    payloadSha256: sha256(JSON.stringify(payload)),
    segmentCharacters: [...segment.text].length,
  };
}

async function readSharedSse(response, startedAt) {
  return readInteractionsSse(response, {
    elapsedMs: () => elapsedMs(startedAt),
    sanitize,
    defaultMimeType: EXPECTED_PCM.mimeType,
  });
}

async function defaultSemanticVerifier({ result, outputDir }) {
  const descriptorPath = join(result.segmentDir, "verification-manifest.json");
  const descriptor = {
    schemaVersion: 1,
    requestedSegments: 1,
    stoppedEarly: false,
    segments: [{
      segmentIndex: result.segmentIndex,
      terminal: result.terminal,
      terminalOutcome: result.terminalOutcome,
      httpPass: result.httpPass,
      terminalPass: result.terminalPass,
      sourceFile: result.files.source,
      wav: result.files.wav,
      elapsedMs: result.elapsedMs,
      firstAudioLatencyMs: result.deltas[0]?.elapsedMs ?? null,
      markerTokens: result.markerTokens,
    }],
  };
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  const { analyzeGeminiTtsSegmentPipeline } = await import("./analyze-gemini-tts-segment-pipeline.mjs");
  const analysis = await analyzeGeminiTtsSegmentPipeline(outputDir, {
    manifestPath: descriptorPath,
    analysisDir: join(result.segmentDir, ".verification"),
  });
  return { ok: analysis.classification === "complete", classification: analysis.classification, failure: analysis.failure || null, summaryPath: join(result.segmentDir, ".verification", "summary.json") };
}

function analysisPlan({ outputDir }) {
  return {
    status: "not_run",
    verifiedForPlayback: false,
    hook: "analyzeGeminiTtsSegment",
    command: `node scripts/analyze-gemini-tts-segment-pipeline.mjs ${outputDir}`,
    note: "Provider PCM remains unverified until both-recognizer ending and marker-trim analysis passes.",
    localOutputDir: outputDir,
  };
}

export async function runSegmentAttempt({ request, segment, source, apiKey, outputDir, fetchImpl = globalThis.fetch, attemptIndex = 1, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for execution");
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
  const startedAt = process.hrtime.bigint();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let response = null;
  let parsed = { events: [], deltas: [], audioDeltas: [], audio: Buffer.alloc(0), totalBytes: 0, mimeType: null, readError: null };
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
  const acceptance = validateGeminiStreamingResponse({ status: response?.status, events: parsed.events.map((event) => event.data), audioDeltas: parsed.audioDeltas, audio: parsed.audio });
  const terminalOutcome = acceptance.terminal || { outcome: "missing_terminal", completed: false };
  const httpPass = Boolean(response && response.status >= 200 && response.status < 300);
  const terminalPass = terminalOutcome.completed;
  const formatReasons = new Set(["empty_pcm", "odd_pcm_byte_count", "unexpected_pcm_mime", "unexpected_pcm_format", "missing_audio_delta"]);
  const formatFailure = formatReasons.has(acceptance.reason) ? acceptance.reason : null;
  const failureReason = localAbort?.reason || parsed.readError || acceptance.reason;
  const segmentDir = join(outputDir, `segment-${String(attemptIndex).padStart(3, "0")}`);
  await mkdir(segmentDir, { recursive: true });
  // These two files are intentionally local-only under the ignored artifacts
  // root.  They make a later offline analysis reproducible without placing
  // private source/prompt text in a manifest, summary, or committed file.
  const sourcePath = join(segmentDir, "source.txt");
  const promptPath = join(segmentDir, "prompt.txt");
  const pcmPath = join(segmentDir, "audio.pcm");
  const wavPath = join(segmentDir, "audio.wav");
  await writeFile(sourcePath, segment.text);
  await writeFile(promptPath, request.prompt);
  await writeFile(pcmPath, parsed.audio);
  await writeFile(wavPath, pcmToWav(parsed.audio));
  const manifest = {
    schemaVersion: 1,
    segmentIndex: request.segmentIndex,
    attemptIndex,
    startedAt: new Date(Date.now() - elapsedMs(startedAt)).toISOString(),
    endedAt: new Date().toISOString(),
    elapsedMs: elapsedMs(startedAt),
    source: { sha256: source.sha256, bytes: source.bytes },
    segment: { sha256: request.segmentSha256, characters: request.segmentCharacters, index: request.segmentIndex, total: request.totalSegments, sourceBoundary: request.sourceBoundary, expectedEndingTokenCount: request.expectedEndingTokenCount, expectedEndingSha256: request.expectedEndingSha256 },
    request: { endpointFamily: "generativelanguage.googleapis.com/v1beta/interactions", apiRevision: API_REVISION, model: MODEL, voice: VOICE, marker: request.marker, markerSha256: request.markerSha256, markerTokenCount: request.markerTokenCount, promptVersion: request.promptVersion, promptSha256: request.promptSha256, spokenScriptSha256: request.spokenScriptSha256, spokenSeparator: request.spokenSeparator, payloadSha256: request.payloadSha256 },
    response: { status: response?.status ?? null, headers: safeHeaderMap(response?.headers) },
    terminal: parsed.events.map((event) => event.data).findLast((event) => /completed|failed|cancel|incomplete|error/i.test(String(event?.event_type || event?.type || event?.status || ""))) || null,
    terminalOutcome,
    acceptance: { ok: acceptance.ok, reason: acceptance.reason, httpStatus: acceptance.httpStatus, deltaCount: acceptance.deltaCount ?? parsed.deltas.length },
    httpPass,
    terminalPass,
    formatFailure,
    pcm: { mimeType: parsed.mimeType || EXPECTED_PCM.mimeType, sampleRate: EXPECTED_PCM.sampleRate, channels: EXPECTED_PCM.channels, bitsPerSample: EXPECTED_PCM.bitsPerSample, formatSource: "interactions_audio_contract_and_mime_validation", bytes: parsed.audio.length, sha256: sha256(parsed.audio), durationSeconds: parsed.audio.length / (EXPECTED_PCM.sampleRate * 2) },
    eventCount: parsed.events.length,
    deltas: parsed.deltas,
    readError: parsed.readError || null,
    localAbort,
    files: { source: sourcePath, prompt: promptPath, pcm: pcmPath, wav: wavPath, events: join(segmentDir, "events.jsonl"), responseHeaders: join(segmentDir, "response-headers.json") },
    markerTokens: lexicalTokens(request.marker),
    analysis: analysisPlan({ outputDir }),
    verifiedForPlayback: false,
    decisiveFailure: Boolean(failureReason),
    failureReason: failureReason || null,
  };
  await writeFile(manifest.files.events, parsed.events.map((event) => JSON.stringify(event)).join("\n") + (parsed.events.length ? "\n" : ""));
  await writeFile(manifest.files.responseHeaders, `${JSON.stringify(safeHeaderMap(response?.headers), null, 2)}\n`);
  await writeFile(join(segmentDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...manifest, segmentDir };
}

export async function runSegmentPipeline({ sourcePath = DEFAULT_SOURCE, outputRoot = DEFAULT_OUTPUT_ROOT, execute = false, confirmPaidProviderCall = false, targetCharacters = DEFAULT_SEGMENT_TARGET_CHARACTERS, env = process.env, envPath = resolve(process.cwd(), ".env"), fetchImpl = globalThis.fetch, readFileImpl = readFile, clock = Date, semanticVerifier = defaultSemanticVerifier, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  if (confirmPaidProviderCall && !execute) throw new Error("--confirm-paid-provider-call requires --execute");
  const source = await verifyFrozenSource(sourcePath, readFileImpl);
  const sourceText = source.contents.toString("utf8");
  const markerSelection = selectNonCollidingMarker(sourceText, MARKER_CANDIDATES);
  if (!markerSelection.ok) throw new Error("no non-colliding sacrificial marker is available");
  const selectedMarker = markerSelection.selectedMarkerTokens;
  const rawSegments = await splitSourceIntoSegments(sourceText, { targetCharacters });
  let sourceTokenCursor = 0;
  const segments = rawSegments.map((segment) => {
    const tokenCount = lexicalTokens(segment.text).length;
    const enriched = { ...segment, sourceBoundary: { unit: "normalized_lexical_token", start: sourceTokenCursor, end: sourceTokenCursor + tokenCount } };
    sourceTokenCursor += tokenCount;
    return enriched;
  });
  const requests = segments.map((segment, index) => buildSegmentRequest({ segment, index, total: segments.length, marker: selectedMarker }));
  const configuration = { model: MODEL, voice: VOICE, apiRevision: API_REVISION, endpointFamily: "generativelanguage.googleapis.com/v1beta/interactions", promptVersion: GEMINI_SPOKEN_PROMPT_VERSION, marker: selectedMarker, markerSelection: markerSelection.metadata, targetCharacters };
  if (!execute) return { schemaVersion: 1, dryRun: true, source: { path: source.sourcePath, sha256: source.sha256, bytes: source.bytes }, configuration, plannedSegments: requests.map((request) => ({ segmentIndex: request.segmentIndex, totalSegments: request.totalSegments, sourceBoundary: request.sourceBoundary, segmentSha256: request.segmentSha256, segmentCharacters: request.segmentCharacters, expectedEndingTokenCount: request.expectedEndingTokenCount, expectedEndingSha256: request.expectedEndingSha256, markerSha256: request.markerSha256, markerTokenCount: request.markerTokenCount, promptVersion: request.promptVersion, promptSha256: request.promptSha256, spokenScriptSha256: request.spokenScriptSha256, spokenSeparator: request.spokenSeparator, payloadSha256: request.payloadSha256 })), networkCalls: 0, analysisRequired: true, verifiedForPlayback: false };
  if (!confirmPaidProviderCall) throw new Error("execution requires --confirm-paid-provider-call");
  const apiKey = await loadGeminiApiKey({ env, envPath, readFileImpl });
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for execution (process environment or .env)");
  const stamp = new Date(clock.now()).toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z");
  const outputDir = join(outputRoot, `${stamp}-segments`);
  await mkdir(outputDir, { recursive: true });
  const results = [];
  for (const [index, request] of requests.entries()) {
    const result = await runSegmentAttempt({ request, segment: segments[index], source, apiKey, outputDir, fetchImpl, attemptIndex: index + 1, timeoutMs });
    if (!result.decisiveFailure) {
      const verificationStartedAt = process.hrtime.bigint();
      try {
        const verification = await semanticVerifier({ result, segment: segments[index], outputDir });
        result.semanticVerification = { ...verification, elapsedMs: elapsedMs(verificationStartedAt) };
        if (!verification.ok) {
          result.decisiveFailure = true;
          result.failureReason = verification.classification || verification.failure || "semantic_verification_failed";
        }
      } catch {
        result.semanticVerification = { ok: false, classification: "verification_error", failure: "verification_error", elapsedMs: elapsedMs(verificationStartedAt) };
        result.decisiveFailure = true;
        result.failureReason = "verification_error";
      }
      await writeFile(join(result.segmentDir, "manifest.json"), `${JSON.stringify(result, null, 2)}\n`);
    }
    results.push({ ...result, segmentIndex: index });
    if (result.decisiveFailure) break;
  }
  const summarySegments = results.map((item, index) => ({
    segmentIndex: item.segmentIndex,
    segmentSha256: item.segment.sha256,
    terminal: item.terminal,
    terminalOutcome: item.terminalOutcome,
    httpStatus: item.response.status,
    httpPass: item.httpPass,
    terminalPass: item.terminalPass,
    formatFailure: item.formatFailure,
    failureReason: item.failureReason,
    decisiveFailure: item.decisiveFailure,
    markerTokens: item.markerTokens,
    startedAt: item.startedAt,
    endedAt: item.endedAt,
    elapsedMs: item.elapsedMs,
    firstAudioLatencyMs: item.deltas[0]?.elapsedMs ?? null,
    pcmBytes: item.pcm.bytes,
    pcmDurationSeconds: item.pcm.durationSeconds,
    semanticVerification: item.semanticVerification || null,
    wav: item.files.wav,
    pcm: item.files.pcm,
    sourceFile: item.files.source,
    verifiedForPlayback: false,
    order: index,
  }));
  const summary = {
    schemaVersion: 1,
    dryRun: false,
    configuration,
    source: { sha256: source.sha256, bytes: source.bytes },
    requestedSegments: segments.length,
    networkCalls: results.length,
    segments: summarySegments,
    attempts: summarySegments.map(({ markerTokens: _marker, wav: _wav, pcm: _pcm, sourceFile: _source, ...attempt }) => attempt),
    stoppedEarly: results.length < segments.length,
    analysisRequired: true,
    verifiedForPlayback: false,
    outputDir,
  };
  await writeFile(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

export function parseArgs(argv) {
  const args = { execute: false, confirmPaidProviderCall: false, sourcePath: DEFAULT_SOURCE, outputRoot: DEFAULT_OUTPUT_ROOT, targetCharacters: DEFAULT_SEGMENT_TARGET_CHARACTERS, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") { args.help = true; continue; }
    if (arg === "--execute") { args.execute = true; continue; }
    if (arg === "--dry-run") { args.execute = false; continue; }
    if (arg === "--confirm-paid-provider-call") { args.confirmPaidProviderCall = true; continue; }
    const take = (name) => { const value = argv[++i]; if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`); return value; };
    if (arg === "--source") { args.sourcePath = resolve(take("--source")); continue; }
    if (arg === "--output-dir") { args.outputRoot = resolve(take("--output-dir")); continue; }
    if (arg === "--target-characters") { args.targetCharacters = Number(take("--target-characters")); continue; }
    if (arg.startsWith("--")) throw new Error(`unknown argument: ${arg}`);
    throw new Error(`unexpected argument: ${arg}`);
  }
  if (!Number.isInteger(args.targetCharacters) || args.targetCharacters < 100) throw new Error("--target-characters must be an integer of at least 100");
  if (args.execute && !args.confirmPaidProviderCall) throw new Error("execution requires --confirm-paid-provider-call");
  if (args.confirmPaidProviderCall && !args.execute) throw new Error("--confirm-paid-provider-call requires --execute");
  return args;
}

export const HELP = `Usage: node scripts/run-gemini-tts-segment-pipeline.mjs [options]\n\nOptions:\n  --execute                         enable paid provider requests\n  --dry-run                         explicitly select the default no-network mode\n  --confirm-paid-provider-call      second required safety confirmation\n  --source PATH                     frozen source text (SHA must match)\n  --output-dir PATH                 ignored artifact root\n  --target-characters N             target segment size (default ${DEFAULT_SEGMENT_TARGET_CHARACTERS})\n  --help                            show this help\n`;

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const args = parseArgs(argv);
    if (args.help) { io.stdout.write(HELP); return 0; }
    io.stdout.write(`${JSON.stringify(await runSegmentPipeline(args), null, 2)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`gemini segment pipeline failed: ${error?.message || "unknown error"}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
