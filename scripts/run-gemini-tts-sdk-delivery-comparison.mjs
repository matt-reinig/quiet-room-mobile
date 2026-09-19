#!/usr/bin/env node

/*
 * QR-MOB-021 official @google/genai delivery comparison.
 *
 * This is intentionally separate from the REST and segmented runners. It is
 * an exact two-arm diagnostic: one official-SDK stream followed by one
 * official-SDK non-streaming request using the same frozen segment, prompt,
 * model, voice, and API settings. Dry-run is the default and never loads the
 * SDK or makes a network request.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  GEMINI_PCM_FORMAT,
  validateGeminiNonStreamingResponse,
  validateGeminiStreamingResponse,
  wrapPcmInWav,
} from "./gemini-tts-provider-lib.mjs";
import { loadGeminiApiKey } from "./run-gemini-tts-provider-control.mjs";
import {
  GEMINI_SPOKEN_PROMPT_VERSION,
  buildGeminiSpokenPrompt,
  buildGeminiTtsPayload,
} from "./gemini-tts-segment-pipeline-lib.mjs";

export const SDK_PACKAGE = "@google/genai";
export const SDK_VERSION = "2.23.0";
export const API_VERSION = "v1beta";
export const API_REVISION = "2026-05-20";
export const MODEL = "gemini-3.1-flash-tts-preview";
export const VOICE = "Kore";
export const MARKER = "Violet window thirteen.";
export const EXPECTED_SOURCE_SHA256 = "13a3ddd146503d36f9b0ae121eee477a6db2cf095246cbb06f891c107731d4b7";
export const EXPECTED_SEGMENT_SHA256 = "f2a5b6a925dc1b8ac2d9a953c61a12f6c49e3ee0af0bfbdb14bd0782e55d42b7";
export const EXPECTED_PROMPT_SHA256 = "1093c966ca7f3847bd660d309bf0cdf5bfde597316bf4b9c31eae8ae4145979d";
export const EXPECTED_SPOKEN_SCRIPT_SHA256 = "b50552cef23605da7757bc890b06f76881360f0f387eef3f8dc3bd49b39de6f4";
export const EXPECTED_STREAMING_PAYLOAD_SHA256 = "f9321d65559bd7ac4a74f21fa334f5e752cc5da7fa78b207c1656df752982c31";
export const EXPECTED_NON_STREAMING_PAYLOAD_SHA256 = "f63f1fe725b9aa69447563d36e5a5983b048f69dfa94ddb7d0dfc858a6bd8cd4";
export const DEFAULT_PARENT_SOURCE = resolve(process.cwd(), "artifacts/qr-mob-021/controlled-comparison-20260917/frozen-source.txt");
export const DEFAULT_SEGMENT_SOURCE = resolve(process.cwd(), "artifacts/qr-mob-021/gemini-segment-pipeline/20260918T204833520Z-segments/segment-001/source.txt");
export const DEFAULT_SDK_ROOT = resolve(process.cwd(), ".local/qr-mob-021-google-sdk");
export const DEFAULT_OUTPUT_ROOT = resolve(process.cwd(), "artifacts/qr-mob-021/gemini-sdk-delivery-comparison");
export const REQUEST_TIMEOUT_MS = 120_000;
export const COST_ASSUMPTION = Object.freeze({
  source: "official_gemini_pricing_2026-09-19",
  paidTextUsdPerMillionTokens: 1,
  paidAudioUsdPerMillionTokens: 20,
  audioTokensPerSecond: 25,
  estimatedTwoArmUsdFromPriorReportedUsage: 0.05057,
  requestCap: 2,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nowIso(clock = Date) {
  return new Date(clock.now()).toISOString();
}

function elapsedMs(startedAt) {
  return Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(3));
}

function jsonLine(value) {
  return `${JSON.stringify(value)}\n`;
}

function isByteArray(value) {
  return Buffer.isBuffer(value) || value instanceof Uint8Array;
}

function decodeBase64(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
  const decoded = Buffer.from(normalized, "base64");
  return decoded.length ? decoded : null;
}

function readAudioBlock(block) {
  if (!block || typeof block !== "object") return null;
  const data = isByteArray(block.data) ? Buffer.from(block.data) : decodeBase64(block.data);
  if (!data) return null;
  return {
    bytes: data,
    mimeType: block.mime_type || block.mimeType || "audio/l16",
    sampleRate: block.sample_rate ?? block.sampleRate,
    channels: block.channels,
  };
}

function sanitizeEvent(value, key = "") {
  const lower = String(key).toLowerCase();
  if (/authorization|api[_-]?key|(?:access|refresh|id)[_-]?token|bearer|secret|password|cookie|credential/.test(lower)) return "[REDACTED]";
  if (["input", "prompt", "transcript", "text"].includes(lower)) return "[REDACTED_TEXT]";
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}[truncated]` : value;
  if (isByteArray(value)) return `<${value.byteLength} bytes>`;
  if (Array.isArray(value)) return value.map((item) => sanitizeEvent(item, key));
  if (typeof value === "object") {
    const result = {};
    const audioObject = value.type === "audio" || /audio/.test(lower);
    for (const [childKey, childValue] of Object.entries(value)) {
      if (childKey === "data" && (audioObject || /audio|delta|content/.test(lower))) result[childKey] = "[RETAINED_AUDIO_BLOCK]";
      else result[childKey] = sanitizeEvent(childValue, childKey);
    }
    return result;
  }
  return "[REDACTED]";
}

function toAsyncIterable(value) {
  if (value && value[Symbol.asyncIterator]) return value;
  throw new Error("official SDK did not return an async iterable for stream=true");
}

function interactionId(value) {
  return value?.interaction?.id || value?.id || null;
}

function interactionStatus(value) {
  return value?.interaction?.status || value?.status || null;
}

function streamAudioRecord(event) {
  if (event?.event_type !== "step.delta" || event?.delta?.type !== "audio") return null;
  return readAudioBlock(event.delta);
}

function validateAudioMetadata(block) {
  if (block.sampleRate !== undefined && Number(block.sampleRate) !== GEMINI_PCM_FORMAT.sampleRate) return "unexpected_sample_rate";
  if (block.channels !== undefined && Number(block.channels) !== GEMINI_PCM_FORMAT.channels) return "unexpected_channels";
  return null;
}

function buildSdkPayload({ prompt, stream }) {
  return buildGeminiTtsPayload({ model: MODEL, prompt, voice: VOICE, stream });
}

export function buildSdkRequest({ prompt }) {
  return {
    streaming: buildSdkPayload({ prompt, stream: true }),
    nonStreaming: buildSdkPayload({ prompt, stream: false }),
  };
}

export async function loadPriorSegment({
  parentSourcePath = DEFAULT_PARENT_SOURCE,
  segmentSourcePath = DEFAULT_SEGMENT_SOURCE,
  readFileImpl = readFile,
} = {}) {
  const parent = await readFileImpl(parentSourcePath);
  const parentSha256 = sha256(parent);
  if (parentSha256 !== EXPECTED_SOURCE_SHA256) throw new Error(`frozen parent source SHA-256 mismatch (expected ${EXPECTED_SOURCE_SHA256}, got ${parentSha256})`);
  const segmentText = (await readFileImpl(segmentSourcePath)).toString("utf8");
  const segmentSha256 = sha256(segmentText);
  if (segmentSha256 !== EXPECTED_SEGMENT_SHA256) throw new Error(`prior segment SHA-256 mismatch (expected ${EXPECTED_SEGMENT_SHA256}, got ${segmentSha256})`);
  const promptDescriptor = buildGeminiSpokenPrompt(segmentText, { marker: MARKER });
  const prompt = promptDescriptor.prompt;
  const promptSha256 = sha256(prompt);
  if (promptSha256 !== EXPECTED_PROMPT_SHA256) throw new Error(`corrected prompt SHA-256 mismatch (expected ${EXPECTED_PROMPT_SHA256}, got ${promptSha256})`);
  const spokenScriptSha256 = sha256(promptDescriptor.spokenScript);
  if (spokenScriptSha256 !== EXPECTED_SPOKEN_SCRIPT_SHA256) throw new Error(`spoken script SHA-256 mismatch (expected ${EXPECTED_SPOKEN_SCRIPT_SHA256}, got ${spokenScriptSha256})`);
  return {
    parentSourceSha256: parentSha256,
    segmentSha256,
    promptSha256,
    promptVersion: GEMINI_SPOKEN_PROMPT_VERSION,
    spokenScriptSha256,
    spokenSeparator: "LF",
    segmentCharacters: [...segmentText].length,
    segmentBytes: Buffer.byteLength(segmentText),
    promptBytes: Buffer.byteLength(prompt),
    prompt,
    sourceFile: resolve(segmentSourcePath),
  };
}

function validateFrozenPromptCondition(prior) {
  if (prior?.parentSourceSha256 !== EXPECTED_SOURCE_SHA256) throw new Error("frozen parent source SHA-256 mismatch");
  if (prior?.segmentSha256 !== EXPECTED_SEGMENT_SHA256) throw new Error("prior segment SHA-256 mismatch");
  if (prior?.promptVersion !== GEMINI_SPOKEN_PROMPT_VERSION) throw new Error("corrected prompt version mismatch");
  if (prior?.promptSha256 !== EXPECTED_PROMPT_SHA256 || sha256(String(prior?.prompt || "")) !== EXPECTED_PROMPT_SHA256) throw new Error("corrected prompt SHA-256 mismatch");
  if (prior?.spokenScriptSha256 !== EXPECTED_SPOKEN_SCRIPT_SHA256 || prior?.spokenSeparator !== "LF") throw new Error("corrected spoken-script identity mismatch");
}

export function buildClientOptions(apiKey) {
  return {
    apiKey,
    apiVersion: API_VERSION,
    httpOptions: {
      headers: { "Api-Revision": API_REVISION },
    },
  };
}

export async function loadPinnedSdk({ sdkRoot = DEFAULT_SDK_ROOT, readFileImpl = readFile, importImpl = (url) => import(url) } = {}) {
  const packageJsonPath = join(sdkRoot, "node_modules", "@google", "genai", "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(await readFileImpl(packageJsonPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`@google/genai ${SDK_VERSION} is not installed under ${sdkRoot}`);
    throw new Error("unable to read the isolated @google/genai package metadata");
  }
  if (packageJson.name !== SDK_PACKAGE || packageJson.version !== SDK_VERSION) {
    throw new Error(`isolated SDK must be ${SDK_PACKAGE}@${SDK_VERSION}`);
  }
  const entry = join(dirname(packageJsonPath), "dist", "node", "index.mjs");
  return importImpl(pathToFileURL(entry).href);
}

function isFatalSdkError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.cause?.status);
  if ([400, 401, 402, 403, 409, 422, 429].includes(status)) return true;
  return /invalid.*(credential|key)|permission|billing|quota|rate.?limit|schema|invalid request|unsupported/i.test(String(error?.message || error));
}

function safeError(error) {
  return {
    name: error?.name || "Error",
    message: String(error?.message || "unknown SDK error").replace(/(api[_-]?key|bearer|token|secret)\s*[:=]?\s*\S+/ig, "$1 [REDACTED]"),
    status: error?.status ?? error?.statusCode ?? null,
  };
}

async function writeArmArtifacts({ armDir, mode, payload, events, interaction, audioBlocks, result, startedAt, endedAt }) {
  await mkdir(armDir, { recursive: true });
  const pcm = Buffer.concat(audioBlocks.map((block) => block.bytes));
  const files = {
    events: join(armDir, "events.jsonl"),
    audioBlocks: join(armDir, "audio-blocks.jsonl"),
    pcm: join(armDir, "audio.pcm"),
    wav: join(armDir, "audio.wav"),
    response: join(armDir, "interaction.json"),
  };
  await writeFile(files.events, events.map((event) => jsonLine(sanitizeEvent(event))).join(""));
  await writeFile(files.audioBlocks, audioBlocks.map((block, index) => jsonLine({
    index,
    bytes: block.bytes.length,
    sha256: sha256(block.bytes),
    mimeType: block.mimeType,
    sampleRate: block.sampleRate ?? null,
    channels: block.channels ?? null,
  })).join(""));
  await writeFile(files.pcm, pcm);
  await writeFile(files.wav, wrapPcmInWav(pcm));
  if (interaction) await writeFile(files.response, `${JSON.stringify(sanitizeEvent(interaction), null, 2)}\n`);
  const safePayload = { ...payload, input: "[REDACTED_TEXT]" };
  const { pcm: _acceptancePcm, ...safeAcceptance } = result;
  const manifest = {
    schemaVersion: 1,
    arm: mode,
    deliveryMode: mode,
    startedAt,
    endedAt,
    elapsedMs: result.elapsedMs,
    request: {
      ...safePayload,
      payloadSha256: sha256(JSON.stringify(payload)),
      apiVersion: API_VERSION,
      apiRevision: API_REVISION,
      retryPolicy: { strategy: "none" },
      timeoutMs: REQUEST_TIMEOUT_MS,
    },
    response: {
      interactionId: interactionId(interaction) || events.map(interactionId).find(Boolean) || null,
      status: interactionStatus(interaction) || events.map(interactionStatus).filter(Boolean).at(-1) || null,
      eventCount: events.length,
      audioBlockCount: audioBlocks.length,
      firstAudioLatencyMs: events.find((event) => streamAudioRecord(event))?._localElapsedMs ?? (audioBlocks.length ? result.elapsedMs : null),
    },
    terminal: mode === "streaming"
      ? events.findLast((event) => event.event_type === "interaction.completed" || /failed|cancel|incomplete|error/i.test(String(event.event_type || event.status || ""))) || null
      : sanitizeEvent(interaction),
    terminalOutcome: mode === "streaming" ? result.terminal || null : { outcome: interactionStatus(interaction) || "missing_terminal", completed: interactionStatus(interaction) === "completed" },
    acceptance: safeAcceptance,
    pcm: {
      bytes: pcm.length,
      sha256: sha256(pcm),
      durationSeconds: pcm.length / (GEMINI_PCM_FORMAT.sampleRate * 2),
    },
    files,
  };
  await writeFile(join(armDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function runSdkArm({ mode, sdk, client, segment, outputDir, armIndex, clock = Date }) {
  if (!client?.interactions?.create) throw new Error("SDK client does not expose interactions.create");
  const streaming = mode === "streaming";
  const payload = buildSdkPayload({ prompt: segment.prompt, stream: streaming });
  const options = { retries: { strategy: "none" }, timeout_ms: REQUEST_TIMEOUT_MS };
  const startedAt = nowIso(clock);
  const startedClock = process.hrtime.bigint();
  const events = [];
  const audioBlocks = [];
  let interaction = null;
  let thrown = null;
  try {
    const response = await client.interactions.create(payload, options);
    if (streaming) {
      for await (const event of toAsyncIterable(response)) {
        events.push({ ...event, _localElapsedMs: elapsedMs(startedClock) });
        const audio = streamAudioRecord(event);
        if (audio) audioBlocks.push(audio);
      }
    } else {
      interaction = response;
      events.push({ event_type: "interaction.response", interaction: response });
      for (const step of response?.steps || []) {
        for (const content of step?.content || []) {
          if (content?.type === "audio") {
            const audio = readAudioBlock(content);
            if (audio) audioBlocks.push(audio);
          }
        }
      }
      if (!audioBlocks.length && response?.output_audio) {
        const audio = readAudioBlock(response.output_audio);
        if (audio) audioBlocks.push(audio);
      }
    }
  } catch (error) {
    thrown = error;
  }
  const endedAt = nowIso(clock);
  const elapsed = elapsedMs(startedClock);
  let acceptance;
  if (thrown) {
    acceptance = { ok: false, reason: "sdk_error", error: safeError(thrown), fatal: isFatalSdkError(thrown) };
  } else {
    const metadataError = audioBlocks.map(validateAudioMetadata).find(Boolean) || null;
    const interactionError = !streaming && Array.isArray(interaction?.errors) && interaction.errors.length > 0;
    const gate = streaming
      ? validateGeminiStreamingResponse({ status: 200, events, audioDeltas: audioBlocks, audio: Buffer.concat(audioBlocks.map((block) => block.bytes)) })
      : validateGeminiNonStreamingResponse({ status: 200, interaction, audioDeltas: audioBlocks, audio: Buffer.concat(audioBlocks.map((block) => block.bytes)) });
    acceptance = interactionError
      ? { ...gate, ok: false, reason: "interaction_error", fatal: false }
      : metadataError
        ? { ...gate, ok: false, reason: metadataError, fatal: false }
        : { ...gate, fatal: false };
  }
  const armDir = join(outputDir, `${String(armIndex).padStart(2, "0")}-${mode}`);
  const manifest = await writeArmArtifacts({ armDir, mode, payload, events, interaction, audioBlocks, result: { ...acceptance, elapsedMs: elapsed }, startedAt, endedAt });
  const { pcm: _acceptancePcm, ...safeAcceptance } = acceptance;
  return { ...manifest, mode, acceptance: safeAcceptance, fatal: Boolean(acceptance.fatal) };
}

async function retrieveMissingTerminalInteraction({ client, arm }) {
  const id = arm.response.interactionId;
  if (arm.mode !== "streaming" || arm.acceptance.reason !== "missing_terminal" || !id) {
    return { attempted: false, status: "not_applicable", interactionId: id || null };
  }
  if (typeof client?.interactions?.get !== "function") {
    return { attempted: false, status: "sdk_get_unavailable", interactionId: id };
  }
  try {
    const interaction = await client.interactions.get(id, undefined, {
      retries: { strategy: "none" },
      timeout_ms: REQUEST_TIMEOUT_MS,
    });
    const file = join(dirname(arm.files.pcm), "retrieved-interaction.json");
    await writeFile(file, `${JSON.stringify(sanitizeEvent(interaction), null, 2)}\n`);
    return {
      attempted: true,
      status: "available",
      interactionId: id,
      interactionStatus: interactionStatus(interaction),
      file,
    };
  } catch (error) {
    const httpStatus = Number(error?.status ?? error?.statusCode ?? error?.cause?.status) || null;
    return {
      attempted: true,
      status: httpStatus === 404 ? "not_found" : "unavailable",
      interactionId: id,
      httpStatus,
      errorName: error?.name || "Error",
    };
  }
}

async function persistArmDiagnostics(arm) {
  const armDir = dirname(arm.files.pcm);
  const semanticFile = join(armDir, "semantic-verification.json");
  await writeFile(semanticFile, `${JSON.stringify(arm.semanticVerification, null, 2)}\n`);
  arm.files.semanticVerification = semanticFile;
  if (arm.retrieval?.attempted || arm.retrieval?.status === "sdk_get_unavailable") {
    const retrievalFile = join(armDir, "retrieval.json");
    await writeFile(retrievalFile, `${JSON.stringify(arm.retrieval, null, 2)}\n`);
    arm.files.retrieval = retrievalFile;
  }
  await writeFile(join(armDir, "manifest.json"), `${JSON.stringify(arm, null, 2)}\n`);
}

async function defaultSemanticAnalyzer({ arm, segment }) {
  if (!segment.sourceFile) return { ok: arm.acceptance.ok, classification: arm.acceptance.ok ? "not_run_without_source_fixture" : "provider_failed", failure: arm.acceptance.reason || null };
  const descriptorPath = join(dirname(arm.files.pcm), "verification-manifest.json");
  const descriptor = {
    schemaVersion: 1,
    requestedSegments: 1,
    stoppedEarly: false,
    segments: [{
      deliveryMode: arm.deliveryMode,
      terminal: arm.terminal,
      terminalOutcome: arm.terminalOutcome,
      acceptance: arm.acceptance,
      httpPass: true,
      sourceFile: segment.sourceFile,
      wav: arm.files.wav,
      elapsedMs: arm.elapsedMs,
      firstAudioLatencyMs: arm.response.firstAudioLatencyMs,
      markerTokens: ["violet", "window", ["thirteen", "13"]],
    }],
  };
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  const { analyzeGeminiTtsSegmentPipeline } = await import("./analyze-gemini-tts-segment-pipeline.mjs");
  const analysis = await analyzeGeminiTtsSegmentPipeline(dirname(arm.files.pcm), {
    manifestPath: descriptorPath,
    analysisDir: join(dirname(arm.files.pcm), ".verification"),
  });
  return { ok: analysis.classification === "complete", classification: analysis.classification, failure: analysis.failure || null, summaryPath: join(dirname(arm.files.pcm), ".verification", "summary.json") };
}

function stamp(clock = Date) {
  return nowIso(clock).replace(/[-:.]/g, "").replace(/Z$/, "Z");
}

export async function runComparison({
  execute = false,
  confirmPaidProviderCall = false,
  segment,
  sdk,
  sdkRoot = DEFAULT_SDK_ROOT,
  apiKey,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  clock = Date,
  loadSdkImpl = loadPinnedSdk,
  credentialLoader = loadGeminiApiKey,
  clientFactory,
  semanticAnalyzer = defaultSemanticAnalyzer,
} = {}) {
  if (confirmPaidProviderCall && !execute) throw new Error("--confirm-paid-provider-call requires --execute");
  const prior = segment || await loadPriorSegment();
  validateFrozenPromptCondition(prior);
  const requests = buildSdkRequest({ prompt: prior.prompt });
  const requestHashes = {
    streaming: sha256(JSON.stringify(requests.streaming)),
    nonStreaming: sha256(JSON.stringify(requests.nonStreaming)),
  };
  if (requestHashes.streaming !== EXPECTED_STREAMING_PAYLOAD_SHA256) throw new Error("corrected streaming payload SHA-256 mismatch");
  if (requestHashes.nonStreaming !== EXPECTED_NON_STREAMING_PAYLOAD_SHA256) throw new Error("corrected non-streaming payload SHA-256 mismatch");
  const plan = {
    arms: ["streaming", "non-streaming"],
    networkCalls: 0,
    source: {
      parentSha256: prior.parentSourceSha256,
      segmentSha256: prior.segmentSha256,
      promptSha256: prior.promptSha256,
      promptVersion: prior.promptVersion,
      spokenScriptSha256: prior.spokenScriptSha256,
      spokenSeparator: prior.spokenSeparator,
      segmentCharacters: prior.segmentCharacters,
    },
    configuration: { sdkPackage: SDK_PACKAGE, sdkVersion: SDK_VERSION, apiVersion: API_VERSION, apiRevision: API_REVISION, model: MODEL, voice: VOICE, marker: MARKER, promptVersion: GEMINI_SPOKEN_PROMPT_VERSION, timeoutMs: REQUEST_TIMEOUT_MS, retryPolicy: { strategy: "none" }, costAssumption: COST_ASSUMPTION },
    requestHashes,
  };
  if (!execute) return { dryRun: true, ...plan };
  if (!confirmPaidProviderCall) throw new Error("execution requires --confirm-paid-provider-call");
  const resolvedApiKey = apiKey || await credentialLoader();
  if (!sdk && !resolvedApiKey) throw new Error("GEMINI_API_KEY is required for execution (process environment or .env)");
  const loaded = sdk || await loadSdkImpl({ sdkRoot });
  const client = clientFactory
    ? await clientFactory({ sdk: loaded, apiKey: resolvedApiKey, options: buildClientOptions(resolvedApiKey) })
    : new loaded.GoogleGenAI(buildClientOptions(resolvedApiKey));
  const outputDir = join(outputRoot, `${stamp(clock)}-official-sdk-prompt-v2`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "request-manifest.json"), `${JSON.stringify({ ...plan, requestPayloads: { streaming: { ...requests.streaming, input: "[REDACTED_TEXT]" }, nonStreaming: { ...requests.nonStreaming, input: "[REDACTED_TEXT]" } } }, null, 2)}\n`);
  const arms = [];
  for (const [index, mode] of ["streaming", "non-streaming"].entries()) {
    const result = await runSdkArm({ mode, sdk: loaded, client, segment: prior, outputDir, armIndex: index + 1, clock });
    result.retrieval = await retrieveMissingTerminalInteraction({ client, arm: result });
    const verificationStartedAt = process.hrtime.bigint();
    const semantic = await semanticAnalyzer({ arm: result, segment: prior, outputDir });
    result.semanticVerification = { ...semantic, elapsedMs: elapsedMs(verificationStartedAt) };
    await persistArmDiagnostics(result);
    arms.push(result);
    if (result.fatal) break;
  }
  const summary = {
    schemaVersion: 1,
    dryRun: false,
    ...plan,
    networkCalls: arms.length,
    outputDir,
    arms: arms.map((arm) => ({ arm: arm.mode, ok: arm.acceptance.ok && arm.semanticVerification.ok, providerOk: arm.acceptance.ok, semanticOk: arm.semanticVerification.ok, reason: arm.acceptance.reason || arm.semanticVerification.failure || null, classification: arm.semanticVerification.classification, verificationElapsedMs: arm.semanticVerification.elapsedMs, fatal: arm.fatal, pcmBytes: arm.pcm.bytes, eventCount: arm.response.eventCount, audioBlockCount: arm.response.audioBlockCount, retrieval: arm.retrieval })),
    stoppedEarly: arms.length < 2,
    stopReason: arms.length < 2 ? "fatal_sdk_error" : null,
  };
  await writeFile(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

export function parseArgs(argv) {
  const args = { execute: false, confirmPaidProviderCall: false, sdkRoot: DEFAULT_SDK_ROOT, outputRoot: DEFAULT_OUTPUT_ROOT, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") { args.help = true; continue; }
    if (arg === "--execute") { args.execute = true; continue; }
    if (arg === "--dry-run") { args.execute = false; continue; }
    if (arg === "--confirm-paid-provider-call") { args.confirmPaidProviderCall = true; continue; }
    const take = (name) => { const value = argv[++index]; if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`); return value; };
    if (arg === "--sdk-root") { args.sdkRoot = resolve(take("--sdk-root")); continue; }
    if (arg === "--output-dir") { args.outputRoot = resolve(take("--output-dir")); continue; }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (args.execute && !args.confirmPaidProviderCall) throw new Error("execution requires --confirm-paid-provider-call");
  if (args.confirmPaidProviderCall && !args.execute) throw new Error("--confirm-paid-provider-call requires --execute");
  return args;
}

export const HELP = `Usage: node scripts/run-gemini-tts-sdk-delivery-comparison.mjs [options]\n\nOptions:\n  --execute                         enable the exactly-two-call comparison\n  --dry-run                         select the default no-network mode\n  --confirm-paid-provider-call      second required safety confirmation\n  --sdk-root PATH                   isolated SDK root (default .local/qr-mob-021-google-sdk)\n  --output-dir PATH                 ignored artifact root\n  --help                            show this help\n`;

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const args = parseArgs(argv);
    if (args.help) { io.stdout.write(HELP); return 0; }
    const result = await runComparison(args);
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`gemini SDK delivery comparison failed: ${error?.message || "unknown error"}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
