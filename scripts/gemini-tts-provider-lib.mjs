import { createHash } from "node:crypto";

export const GEMINI_PCM_FORMAT = Object.freeze({
  sampleRate: 24_000,
  channels: 1,
  bitsPerSample: 16,
  signed: true,
  littleEndian: true,
});

export const REDACTED = "[REDACTED]";
export const REDACTED_URL = "[REDACTED_URL]";

const SENSITIVE_KEY = /^(?:authorization|api[-_]?key|x[-_]?goog[-_]?api[-_]?key|(?:access|refresh|id|auth|request)[-_]?token|token|secret|password|credential|cookie|set[-_]?cookie|client[-_]?secret|private[-_]?key)$/i;
const URL_KEY = /(?:^|[-_])(url|uri|endpoint|request|target)(?:$|[-_])/i;
const DEFAULT_ALLOWED_PROTOCOLS = new Set(["https:"]);
const DEFAULT_SAFE_HEADER_NAMES = new Set([
  "content-type",
  "content-length",
  "etag",
  "last-modified",
  "retry-after",
  "x-goog-request-id",
  "x-request-id",
]);

function isByteArray(value) {
  return value instanceof Uint8Array || Buffer.isBuffer(value);
}

function asBuffer(value, name = "value") {
  if (!isByteArray(value)) throw new TypeError(`${name} must be a Uint8Array or Buffer`);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function asPcmBuffer(pcm) {
  const bytes = asBuffer(pcm, "pcm");
  if (bytes.byteLength % 2 !== 0) throw new RangeError("pcm must contain complete signed 16-bit samples");
  return bytes;
}

export function sha256Hex(value) {
  if (typeof value !== "string" && !isByteArray(value)) {
    throw new TypeError("sha256Hex expects a string or byte array");
  }
  return createHash("sha256").update(value).digest("hex");
}

export function sha256(value) {
  return sha256Hex(value);
}

export function sha256Bytes(value) {
  if (!isByteArray(value)) throw new TypeError("sha256Bytes expects a byte array");
  return Buffer.from(sha256Hex(value), "hex");
}

function normalizeFormat(format = {}) {
  return {
    sampleRate: format.sampleRate ?? GEMINI_PCM_FORMAT.sampleRate,
    channels: format.channels ?? GEMINI_PCM_FORMAT.channels,
    bitsPerSample: format.bitsPerSample ?? GEMINI_PCM_FORMAT.bitsPerSample,
    signed: format.signed ?? GEMINI_PCM_FORMAT.signed,
    littleEndian: format.littleEndian ?? GEMINI_PCM_FORMAT.littleEndian,
  };
}

export function validatePcmFormat(pcm, format = {}) {
  const bytes = asPcmBuffer(pcm);
  const actual = normalizeFormat(format);
  const expected = GEMINI_PCM_FORMAT;
  const mismatches = Object.keys(expected).filter((key) => actual[key] !== expected[key]);
  if (mismatches.length > 0) {
    throw new RangeError(`PCM must be signed 16-bit mono 24 kHz; invalid ${mismatches.join(", ")}`);
  }
  return Object.freeze({
    ...expected,
    byteLength: bytes.byteLength,
    sampleCount: bytes.byteLength / 2,
    durationSeconds: bytes.byteLength / 2 / expected.sampleRate,
  });
}

export function validatePcm24kMono(pcm, format = {}) {
  return validatePcmFormat(pcm, format);
}

export function validateGeminiPcm(pcm, format = {}) {
  return validatePcmFormat(pcm, format);
}

export function isValidPcmFormat(pcm, format = {}) {
  try {
    validatePcmFormat(pcm, format);
    return true;
  } catch {
    return false;
  }
}

export function wrapPcmInWav(pcm, format = {}) {
  const bytes = asPcmBuffer(pcm);
  const info = validatePcmFormat(bytes, format);
  const wav = Buffer.alloc(44 + bytes.byteLength);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + bytes.byteLength, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // WAVE_FORMAT_PCM
  wav.writeUInt16LE(info.channels, 22);
  wav.writeUInt32LE(info.sampleRate, 24);
  wav.writeUInt32LE(info.sampleRate * info.channels * info.bitsPerSample / 8, 28);
  wav.writeUInt16LE(info.channels * info.bitsPerSample / 8, 32);
  wav.writeUInt16LE(info.bitsPerSample, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(bytes.byteLength, 40);
  bytes.copy(wav, 44);
  return wav;
}

export const pcmToWav = wrapPcmInWav;
export const pcmToWav24kMono = wrapPcmInWav;
export const wrapPcmAsWav = wrapPcmInWav;

function sampleAt(bytes, index) {
  return bytes.readInt16LE(index * 2) / 32768;
}

function rms(bytes, start, end) {
  const first = Math.max(0, Math.floor(start));
  const last = Math.min(bytes.byteLength / 2, Math.floor(end));
  if (last <= first) return 0;
  let sum = 0;
  for (let sample = first; sample < last; sample += 1) {
    const value = sampleAt(bytes, sample);
    sum += value * value;
  }
  return Math.sqrt(sum / (last - first));
}

function peak(bytes, start, end) {
  const first = Math.max(0, Math.floor(start));
  const last = Math.min(bytes.byteLength / 2, Math.floor(end));
  let result = 0;
  for (let sample = first; sample < last; sample += 1) result = Math.max(result, Math.abs(sampleAt(bytes, sample)));
  return result;
}

/**
 * Find a quiet boundary before a marker's estimated onset. The search only
 * considers complete windows before the marker and returns null when no quiet
 * boundary meets both the RMS and peak limits. This is intentionally
 * fail-closed: callers must not trim at an arbitrary marker estimate.
 */
export function findLowEnergyBoundary(pcm, markerStartSample, options = {}) {
  const bytes = asPcmBuffer(pcm);
  validatePcmFormat(bytes, options.format);
  const sampleCount = bytes.byteLength / 2;
  if (!Number.isInteger(markerStartSample) || markerStartSample <= 0 || markerStartSample > sampleCount) {
    throw new RangeError("markerStartSample must be an integer inside the PCM");
  }
  const windowSamples = options.windowSamples ?? Math.round(0.01 * GEMINI_PCM_FORMAT.sampleRate);
  const searchBackSamples = options.searchBackSamples ?? 2 * GEMINI_PCM_FORMAT.sampleRate;
  const stepSamples = options.stepSamples ?? Math.max(1, Math.round(windowSamples / 2));
  const maxRms = options.maxRms ?? 0.025;
  const maxPeak = options.maxPeak ?? 0.12;
  const earliest = Math.max(windowSamples, markerStartSample - searchBackSamples);
  const latest = markerStartSample - (options.markerLeadSamples ?? 0);
  let best = null;
  for (let boundary = latest; boundary >= earliest; boundary -= stepSamples) {
    const start = boundary - windowSamples;
    const candidate = {
      boundarySample: boundary,
      rms: rms(bytes, start, boundary),
      peak: peak(bytes, start, boundary),
      windowStartSample: start,
      windowEndSample: boundary,
    };
    if (candidate.rms > maxRms || candidate.peak > maxPeak) continue;
    if (!best || candidate.rms < best.rms || (candidate.rms === best.rms && candidate.boundarySample > best.boundarySample)) {
      best = candidate;
    }
  }
  return best;
}

export const chooseLowEnergyBoundary = findLowEnergyBoundary;
export const selectLowEnergyBoundary = findLowEnergyBoundary;

function applyFadeOut(pcm, fadeSamples) {
  const output = Buffer.from(pcm);
  const sampleCount = output.byteLength / 2;
  const fade = Math.min(Math.max(0, Math.floor(fadeSamples)), sampleCount);
  if (fade === 0) return output;
  const start = sampleCount - fade;
  for (let index = start; index < sampleCount; index += 1) {
    const scale = (sampleCount - index - 1) / Math.max(1, fade - 1);
    const value = Math.round(output.readInt16LE(index * 2) * scale);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, value)), index * 2);
  }
  return output;
}

export function trimPcmAtLowEnergyBoundary(pcm, markerStartSample, options = {}) {
  const bytes = asPcmBuffer(pcm);
  const boundary = findLowEnergyBoundary(bytes, markerStartSample, options);
  if (!boundary) throw new Error("no safe low-energy PCM boundary before marker");
  const fadeSamples = options.fadeSamples ?? Math.round(0.005 * GEMINI_PCM_FORMAT.sampleRate);
  const trimmed = applyFadeOut(bytes.subarray(0, boundary.boundarySample * 2), fadeSamples);
  return {
    pcm: trimmed,
    boundarySample: boundary.boundarySample,
    trimSeconds: boundary.boundarySample / GEMINI_PCM_FORMAT.sampleRate,
    fadeSamples: Math.min(fadeSamples, boundary.boundarySample),
    rms: boundary.rms,
    peak: boundary.peak,
  };
}

export const trimPcmAtBoundary = trimPcmAtLowEnergyBoundary;

function eventType(event) {
  if (typeof event?.type === "string") return event.type;
  if (typeof event?.event_type === "string") return event.event_type;
  if (typeof event?.event === "string") return event.event;
  return "";
}

function eventStatus(event) {
  if (typeof event?.status === "string") return event.status;
  if (typeof event?.interaction?.status === "string") return event.interaction.status;
  if (typeof event?.data?.status === "string") return event.data.status;
  if (typeof event?.data?.interaction?.status === "string") return event.data.interaction.status;
  return undefined;
}

function terminalKind(type, status) {
  const value = `${type} ${status || ""}`.toLowerCase();
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("incomplete") || value.includes("partial")) return "incomplete";
  if (value.includes("fail") || value.includes("error")) return "failed";
  if (type === "interaction.completed" && status === "completed") return "completed";
  if (type === "interaction.completed" && !status) return undefined;
  // Only the exact Interactions completion event is success.  In particular,
  // step.completed and provider-specific completion-like names must not be
  // treated as terminal success merely because they carry status=completed.
  if (type.includes("completed")) return "invalid_terminal";
  return undefined;
}

/**
 * Classify only sanitized event objects. A completed result requires the
 * exact interaction.completed event and an exact completed status, with no
 * conflicting terminal/error event anywhere in the stream.
 */
export function classifyInteractionsTerminalOutcome(events) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  const terminals = [];
  events.forEach((event, index) => {
    if (!event || typeof event !== "object") return;
    const type = eventType(event);
    const status = eventStatus(event);
    const kind = terminalKind(type, status);
    if (kind) terminals.push({ kind, type, status, index });
  });
  const completed = terminals.find((item) => item.kind === "completed");
  const conflicting = terminals.filter((item) => item.kind !== "completed");
  if (completed && conflicting.length === 0) {
    return { outcome: "completed", completed: true, eventType: completed.type, status: completed.status, eventIndex: completed.index };
  }
  const last = terminals.at(-1);
  return {
    outcome: conflicting.at(-1)?.kind || "missing_terminal",
    completed: false,
    ...(last ? { eventType: last.type, ...(last.status ? { status: last.status } : {}), eventIndex: last.index } : {}),
  };
}

export const classifyInteractionEvents = classifyInteractionsTerminalOutcome;
export const classifyInteractionsEvents = classifyInteractionsTerminalOutcome;
export const classifyTerminalOutcome = classifyInteractionsTerminalOutcome;

function responseStatus(responseOrStatus) {
  if (typeof responseOrStatus === "number") return responseOrStatus;
  const value = responseOrStatus?.status;
  return value === undefined || value === null ? null : Number(value);
}

function mimeFormat(value, fallback = GEMINI_PCM_FORMAT) {
  const source = typeof value === "string" ? value : value?.mimeType || value?.mime_type || value?.contentType || value?.content_type;
  const mime = String(source || "audio/pcm").toLowerCase();
  const [mediaType, ...parts] = mime.split(";").map((part) => part.trim());
  if (!/^audio\/(?:pcm|raw|l16)$/i.test(mediaType)) return { error: "unexpected_pcm_mime", mediaType };
  const parameters = Object.fromEntries(parts.map((part) => part.split("=", 2).map((item) => item.trim())).filter(([key, item]) => key && item));
  const number = (...keys) => {
    for (const key of keys) if (parameters[key] !== undefined) return Number(parameters[key]);
    return null;
  };
  const format = {
    sampleRate: number("rate", "samplerate", "sample-rate") ?? fallback.sampleRate,
    channels: number("channels", "channel") ?? fallback.channels,
    bitsPerSample: number("bits", "width", "bits-per-sample", "bit-depth") ?? fallback.bitsPerSample,
    signed: fallback.signed,
    littleEndian: fallback.littleEndian,
  };
  const mismatches = Object.keys(fallback).filter((key) => format[key] !== fallback[key]);
  return mismatches.length ? { error: "unexpected_pcm_format", mediaType, format, mismatches } : { mediaType, format };
}

function audioDeltaRecord(delta) {
  if (isByteArray(delta)) return { bytes: Buffer.from(delta), mimeType: "audio/pcm" };
  if (!delta || typeof delta !== "object") return null;
  const bytes = delta.bytes ?? delta.pcm ?? delta.data ?? delta.audio;
  const source = isByteArray(bytes) ? bytes : audioCandidate(bytes);
  if (!source) return null;
  return {
    bytes: Buffer.from(source),
    mimeType: delta.mimeType || delta.mime_type || delta.contentType || delta.content_type || "audio/pcm",
    format: delta.format,
  };
}

/** Validate one audio delta's declared media format and byte alignment. */
export function validateGeminiAudioDelta(delta, format = GEMINI_PCM_FORMAT) {
  const record = audioDeltaRecord(delta);
  if (!record) return { ok: false, reason: "missing_audio_delta" };
  const declared = mimeFormat(record.mimeType, format);
  if (declared.error) return { ok: false, reason: declared.error, mediaType: declared.mediaType, mismatches: declared.mismatches || [] };
  const explicit = record.format ? normalizeFormat({ ...format, ...record.format }) : declared.format;
  const mismatches = Object.keys(format).filter((key) => explicit[key] !== format[key]);
  if (mismatches.length) return { ok: false, reason: "unexpected_pcm_format", mismatches };
  if (record.bytes.byteLength % 2 !== 0) return { ok: false, reason: "odd_pcm_byte_count", bytes: record.bytes.byteLength };
  return { ok: true, bytes: record.bytes, mimeType: record.mimeType, format: declared.format };
}

/**
 * Validate a streaming Interactions response as one strict acceptance gate.
 * HTTP status, every audio delta, concatenated PCM, and the complete event
 * history all participate in the result; no later success can erase failure.
 */
export function validateGeminiStreamingResponse({ status, events = [], audioDeltas, audio, format = GEMINI_PCM_FORMAT } = {}) {
  const httpStatus = responseStatus(status);
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 300) {
    return { ok: false, reason: httpStatus === null ? "missing_http_status" : `http_${httpStatus}`, httpStatus, terminal: classifyInteractionsTerminalOutcome(events) };
  }
  const terminal = classifyInteractionsTerminalOutcome(events);
  if (!terminal.completed) return { ok: false, reason: terminal.outcome, httpStatus, terminal };
  const deltas = Array.isArray(audioDeltas) ? audioDeltas : extractAudioDeltaRecords(events);
  if (!deltas.length) return { ok: false, reason: "empty_pcm", httpStatus, terminal, deltaCount: 0 };
  const validated = deltas.map((delta) => validateGeminiAudioDelta(delta, format));
  const failedIndex = validated.findIndex((entry) => !entry.ok);
  if (failedIndex >= 0) return { ok: false, reason: validated[failedIndex].reason, failedDeltaIndex: failedIndex, httpStatus, terminal, deltaCount: deltas.length };
  const pcm = audio === undefined ? Buffer.concat(validated.map((entry) => entry.bytes)) : Buffer.from(audio);
  try {
    const pcmInfo = validatePcmFormat(pcm, format);
    return { ok: true, reason: null, httpStatus, terminal, deltaCount: deltas.length, pcm, pcmInfo };
  } catch (error) {
    return { ok: false, reason: /complete|alignment|sample/i.test(error?.message || "") ? "odd_pcm_byte_count" : "unexpected_pcm_format", httpStatus, terminal, deltaCount: deltas.length };
  }
}

export const validateStreamingProviderResponse = validateGeminiStreamingResponse;
export const validateInteractionsStreamingResponse = validateGeminiStreamingResponse;

/** Validate a non-streaming interaction object without requiring an SSE event. */
export function validateNonStreamingInteractionStatus(interaction) {
  const status = String(eventStatus(interaction) || "").toLowerCase();
  if (status === "completed") return { ok: true, status };
  if (["failed", "error", "cancelled", "canceled", "incomplete", "partial"].includes(status)) return { ok: false, reason: status, status };
  return { ok: false, reason: "missing_terminal", status: status || null };
}

export function validateGeminiNonStreamingResponse({ status, interaction, audioDeltas, audio, format = GEMINI_PCM_FORMAT } = {}) {
  const httpStatus = responseStatus(status);
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 300) return { ok: false, reason: httpStatus === null ? "missing_http_status" : `http_${httpStatus}`, httpStatus };
  const completion = validateNonStreamingInteractionStatus(interaction);
  if (!completion.ok) return { ok: false, ...completion, httpStatus };
  const deltas = Array.isArray(audioDeltas) ? audioDeltas : (audio === undefined ? [] : [audio]);
  const pcmResult = validateGeminiStreamingResponse({ status: httpStatus, events: [{ type: "interaction.completed", status: "completed" }], audioDeltas: deltas, audio, format });
  return { ...pcmResult, completion };
}

function allowedUrl(value, options) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return REDACTED_URL;
  }
  const protocolValues = options.allowedProtocols === undefined
    ? [...DEFAULT_ALLOWED_PROTOCOLS]
    : (typeof options.allowedProtocols === "string" ? [options.allowedProtocols] : [...options.allowedProtocols]);
  const protocols = new Set(protocolValues.map((protocol) => String(protocol).toLowerCase()));
  const hostValues = options.allowedHosts === undefined
    ? null
    : (typeof options.allowedHosts === "string" ? [options.allowedHosts] : [...options.allowedHosts]);
  const hosts = hostValues ? new Set(hostValues.map((host) => String(host).toLowerCase())) : null;
  if (!protocols.has(parsed.protocol) || parsed.username || parsed.password || (hosts && !hosts.has(parsed.hostname.toLowerCase()))) {
    return REDACTED_URL;
  }
  const queryKeys = new Set(options.allowedQueryKeys || []);
  const safe = new URL(parsed.origin + parsed.pathname);
  for (const [key, queryValue] of parsed.searchParams) {
    if (queryKeys.has(key)) safe.searchParams.append(key, queryValue);
  }
  return safe.toString();
}

function sanitizeString(value, options) {
  return value
    .replace(/\bBearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
    .replace(/((?:[?&]|\b)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|key)=)[^&\s"'<>]+/gi, "$1[REDACTED]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => allowedUrl(url.replace(/[),.;]+$/, ""), options));
}

function sanitizeValue(value, options, key, seen) {
  if (SENSITIVE_KEY.test(String(key || ""))) return REDACTED;
  if (typeof value === "string") return URL_KEY.test(String(key || "")) ? allowedUrl(value, options) : sanitizeString(value, options);
  if (value === null || typeof value !== "object") return value;
  if (isByteArray(value)) return `<${value.byteLength} bytes>`;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = value.map((item) => sanitizeValue(item, options, "", seen));
  else {
    result = {};
    for (const [childKey, childValue] of Object.entries(value)) result[childKey] = sanitizeValue(childValue, options, childKey, seen);
  }
  seen.delete(value);
  return result;
}

export function redactCredentialsAndRequestUrls(value, options = {}) {
  return sanitizeValue(value, {
    allowedHosts: options.allowedHosts,
    allowedProtocols: options.allowedProtocols || DEFAULT_ALLOWED_PROTOCOLS,
    allowedQueryKeys: options.allowedQueryKeys,
  }, "", new WeakSet());
}

export const sanitizeProviderRecord = redactCredentialsAndRequestUrls;
export const redactSensitiveFields = redactCredentialsAndRequestUrls;

export function allowlistHeaders(headers, allowedNames = DEFAULT_SAFE_HEADER_NAMES) {
  const allowed = new Set([...allowedNames].map((name) => String(name).toLowerCase()));
  const output = {};
  for (const [name, value] of Object.entries(headers || {})) {
    const lower = name.toLowerCase();
    if (!allowed.has(lower)) continue;
    if (Array.isArray(value)) output[lower] = value.map((item) => String(item));
    else if (value !== undefined && value !== null) output[lower] = String(value);
  }
  return output;
}

function base64ToBuffer(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
  return Buffer.from(normalized, "base64");
}

function audioCandidate(value) {
  if (isByteArray(value)) return Buffer.from(value);
  if (typeof value === "string") return base64ToBuffer(value);
  if (!value || typeof value !== "object") return null;
  for (const key of ["data", "base64", "audio", "delta", "bytes"]) {
    const candidate = audioCandidate(value[key]);
    if (candidate) return candidate;
  }
  return null;
}

function nestedAudioMarker(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (typeof value.type === "string" && value.type.toLowerCase().includes("audio")) return true;
  if (Object.prototype.hasOwnProperty.call(value, "audio") || Object.prototype.hasOwnProperty.call(value, "audioDelta")) return true;
  return false;
}

export function extractAudioDelta(event) {
  if (!event || typeof event !== "object") return null;
  const type = eventType(event).toLowerCase();
  const isAudioEvent = (type.includes("audio") && (type.includes("delta") || type === "audio"))
    || event.audioDelta !== undefined
    || (["content.delta", "step.delta"].includes(type) && nestedAudioMarker(event.delta));
  if (!isAudioEvent) return null;
  for (const value of [event.delta, event.audioDelta, event.audio, event.data, event.content]) {
    const candidate = audioCandidate(value);
    if (candidate) return candidate;
  }
  return null;
}

export function extractAudioDeltas(events) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  return events.map(extractAudioDelta).filter((delta) => delta !== null);
}

function nestedMimeType(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  for (const key of ["mimeType", "mime_type", "contentType", "content_type"]) {
    if (typeof value[key] === "string") return value[key];
  }
  for (const child of Object.values(value)) {
    const found = nestedMimeType(child, seen);
    if (found) return found;
  }
  return null;
}

/** Extract an audio delta while retaining its declared MIME metadata. */
export function extractAudioDeltaRecord(event) {
  const bytes = extractAudioDelta(event);
  return bytes ? { bytes, mimeType: nestedMimeType(event) || "audio/pcm" } : null;
}

export function extractAudioDeltaRecords(events) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  return events.map(extractAudioDeltaRecord).filter((delta) => delta !== null);
}

export function concatenateAudioDeltas(events) {
  return Buffer.concat(extractAudioDeltas(events));
}
