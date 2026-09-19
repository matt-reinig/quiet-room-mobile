#!/usr/bin/env node

/*
 * Offline, fail-closed analysis for the Phase 2 segment prototype.
 *
 * This module intentionally has no provider or network boundary.  A segment
 * directory contains PCM/WAV produced by an already completed provider call;
 * this command only asks the local faster-whisper installation to verify the
 * segment, trims the sacrificial suffix at a quiet PCM boundary, and joins the
 * verified PCM.  Transcripts never appear in the returned or persisted
 * summary: only hashes, booleans, and bounded timing metadata do.
 */

import { createHash } from "node:crypto";
import { execFile as nodeExecFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  GEMINI_PCM_FORMAT,
  findLowEnergyBoundary,
  trimPcmAtLowEnergyBoundary,
  wrapPcmInWav,
} from "./gemini-tts-provider-lib.mjs";
import { deriveConservativeFinalLexicalTokens, lexicalTokens, simulateSequentialGenerationConcurrentPlayback } from "./gemini-tts-segment-pipeline-lib.mjs";

const execFile = promisify(nodeExecFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PYTHON = resolve(SCRIPT_DIR, "../.local/qr-mob-021-asr/venv/bin/python");
export const DEFAULT_TRANSCRIBER = resolve(SCRIPT_DIR, "../.local/qr-mob-021-asr/transcribe.py");
export const DEFAULT_TAIL_SECONDS = 12;
export const DEFAULT_MARKER_TOLERANCE_SECONDS = 0.75;
export const DEFAULT_CROSSFADE_MS = 10;

const DEFAULT_ENDING = Object.freeze(["copper", "meadow", ["nine", "9"]]);
const DEFAULT_MARKER = Object.freeze(["violet", "window", ["thirteen", "13"]]);

const asArray = (value) => Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function tokenise(value) {
  return lexicalTokens(String(value || ""));
}

function normalisePhrase(value, fallback) {
  const source = value === undefined || value === null ? fallback : value;
  if (typeof source === "string") return tokenise(source);
  return asArray(source).map((item) => {
    if (Array.isArray(item)) return item.map((token) => tokenise(token)[0]).filter(Boolean);
    const tokens = tokenise(item);
    return tokens.length > 1 ? tokens : tokens[0] || "";
  }).filter((item) => Array.isArray(item) ? item.length > 0 : item);
}

function alternativesForToken(item) {
  return Array.isArray(item) ? item : [item];
}

export function phrasePresence(text, phrase) {
  const tokens = tokenise(text);
  const alternatives = normalisePhrase(phrase, []);
  const present = alternatives.map((item) => alternativesForToken(item).some((token) => tokens.includes(token)));
  const starts = [];
  for (let start = 0; start <= tokens.length - alternatives.length; start += 1) {
    if (alternatives.every((item, offset) => alternativesForToken(item).includes(tokens[start + offset]))) {
      starts.push(start);
    }
  }
  const start = starts.at(-1) ?? -1;
  const end = start < 0 ? -1 : start + alternatives.length;
  return { tokens: present, complete: alternatives.length > 0 && starts.length === 1, contiguous: starts.length > 0, occurrenceCount: starts.length, startToken: start, endToken: end, finalRegion: end >= 0 && end >= tokens.length - 6 };
}

/** Privacy-safe exact/prefix comparison for a recognized full segment. */
export function tokenSequenceComparison(text, expectedText) {
  const observed = tokenise(text);
  const expected = tokenise(expectedText);
  let mismatchCount = 0;
  let firstMismatchToken = null;
  for (let index = 0; index < expected.length; index += 1) {
    if (observed[index] === expected[index]) continue;
    mismatchCount += 1;
    if (firstMismatchToken === null) firstMismatchToken = index;
  }
  const prefixExact = expected.length > 0 && mismatchCount === 0 && observed.length >= expected.length;
  return {
    expectedTokenCount: expected.length,
    observedTokenCount: observed.length,
    prefixExact,
    exact: prefixExact && observed.length === expected.length,
    trailingTokenCount: Math.max(0, observed.length - expected.length),
    missingTokenCount: Math.max(0, expected.length - observed.length),
    mismatchCount,
    firstMismatchToken,
  };
}

function phrasesInOrder(text, phrases) {
  const tokens = tokenise(text);
  let cursor = 0;
  const present = [];
  for (const phrase of phrases) {
    const alternatives = normalisePhrase(phrase, []);
    let found = -1;
    for (let start = cursor; start <= tokens.length - alternatives.length; start += 1) {
      if (alternatives.every((item, offset) => alternativesForToken(item).includes(tokens[start + offset]))) {
        found = start;
        break;
      }
    }
    present.push(found >= 0);
    if (found < 0) return { complete: false, present };
    cursor = found + alternatives.length;
  }
  return { complete: present.length > 0 && present.every(Boolean), present };
}

function resultText(result) {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  if (typeof result.text === "string") return result.text;
  if (typeof result.transcript === "string") return result.transcript;
  if (typeof result.result === "string") return result.result;
  if (Array.isArray(result.segments)) return result.segments.map((part) => part?.text || "").join(" ");
  return "";
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timeline(result) {
  const output = [];
  for (const segment of Array.isArray(result?.segments) ? result.segments : []) {
    const words = Array.isArray(segment?.words) ? segment.words : [];
    if (words.length) {
      for (const word of words) {
        const start = numeric(word?.start ?? word?.start_seconds ?? word?.startSeconds);
        if (start === null) continue;
        const end = numeric(word?.end ?? word?.end_seconds ?? word?.endSeconds) ?? start;
        output.push({ text: String(word?.word ?? word?.text ?? ""), start, end });
      }
      continue;
    }
    const start = numeric(segment?.start ?? segment?.start_seconds ?? segment?.startSeconds);
    if (start !== null) output.push({ text: String(segment?.text || ""), start, end: numeric(segment?.end ?? segment?.end_seconds ?? segment?.endSeconds) ?? start });
  }
  return output;
}

/** Locate a complete marker phrase without exposing the recognized text. */
export function findPhraseOnset(result, markerPhrase = DEFAULT_MARKER) {
  const items = timeline(result);
  const phrase = normalisePhrase(markerPhrase, DEFAULT_MARKER);
  if (!items.length || !phrase.length) return null;
  // faster-whisper may expose sentence/segment timestamps without word
  // timestamps.  A segment containing the complete marker gives a bounded,
  // defensible onset; the first timestamp of the whole transcript does not.
  for (const item of items) {
    const presence = phrasePresence(item.text, phrase);
    if (presence.complete && presence.startToken === 0 && presence.endToken === tokenise(item.text).length) {
      return { start: item.start, end: item.end, precision: "segment" };
    }
  }
  const matches = (text, part) => alternativesForToken(part).some((token) => tokenise(text).includes(token));
  for (let startIndex = 0; startIndex < items.length; startIndex += 1) {
    if (!matches(items[startIndex].text, phrase[0])) continue;
    let part = 1;
    let end = items[startIndex].end;
    for (let index = startIndex + 1; index < items.length && part < phrase.length; index += 1) {
      if (!matches(items[index].text, phrase[part])) break;
      end = items[index].end;
      part += 1;
    }
    if (part === phrase.length) return { start: items[startIndex].start, end, precision: "word" };
  }
  return null;
}

function parseWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("expected a RIFF/WAVE file");
  let format = null;
  let data = null;
  let cursor = 12;
  while (cursor + 8 <= buffer.length) {
    const id = buffer.toString("ascii", cursor, cursor + 4);
    const size = buffer.readUInt32LE(cursor + 4);
    const start = cursor + 8;
    if (id === "fmt " && size >= 16) format = { audioFormat: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), bitsPerSample: buffer.readUInt16LE(start + 14) };
    if (id === "data") data = buffer.subarray(start, Math.min(buffer.length, start + size));
    cursor = start + size + (size % 2);
  }
  if (!format || !data || format.audioFormat !== 1 || format.channels !== 1 || format.sampleRate !== GEMINI_PCM_FORMAT.sampleRate || format.bitsPerSample !== 16 || data.length % 2) throw new Error("expected aligned mono 16-bit 24 kHz PCM WAV");
  return { data, sampleRate: format.sampleRate, durationSeconds: data.length / 2 / format.sampleRate };
}

function pathValue(value, keys) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) if (typeof value[key] === "string" && /\.(?:wav|wave|pcm)$/i.test(value[key])) return value[key];
  return null;
}

async function resolveManifest(runDir, supplied) {
  const candidates = supplied ? [supplied] : [join(runDir, "summary.json"), join(runDir, "manifest.json"), join(runDir, "pipeline-manifest.json"), join(runDir, "run-manifest.json")];
  for (const candidate of candidates) {
    try { return { path: candidate, value: JSON.parse(await readFile(candidate, "utf8")) }; } catch (error) { if (supplied || error?.code !== "ENOENT") throw error; }
  }
  throw new Error("segment pipeline manifest not found");
}

function getSegments(manifest) {
  const segments = manifest?.segments || manifest?.pipeline?.segments || manifest?.run?.segments;
  if (!Array.isArray(segments) || segments.length === 0) throw new Error("manifest must contain a non-empty segments array");
  return segments;
}

async function resolveAudioPath(segment, runDir) {
  const value = pathValue(segment, ["wav", "wavPath", "audioWav", "audioPath", "pcmWav", "pcmPath", "sourceWav", "path"])
    || pathValue(segment?.output, ["wav", "wavPath", "audioPath", "pcmPath"]);
  if (value) {
    const path = isAbsolute(value) ? value : resolve(runDir, value);
    await access(path);
    return path;
  }
  throw new Error("segment does not identify a WAV/PCM output");
}

async function deriveTailDefault({ inputPath, outputPath, seconds, tailSeconds }) {
  const duration = seconds ?? tailSeconds ?? DEFAULT_TAIL_SECONDS;
  await execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-sseof", `-${duration}`, "-i", inputPath, "-vn", "-ac", "1", "-ar", String(GEMINI_PCM_FORMAT.sampleRate), "-c:a", "pcm_s16le", "-f", "wav", outputPath]);
}

async function transcribeDefault({ python, transcriber, inputPath, outputPath, model }) {
  // Deliberately no --prompt/initial_prompt: expected words must be recovered,
  // not supplied to the recognizer.
  await execFile(python, [transcriber, inputPath, outputPath, "--model", model, "--language", "en", "--beam-size", "5"], { maxBuffer: 1024 * 1024 });
  return JSON.parse(await readFile(outputPath, "utf8"));
}

function safeModel(model) { return String(model).replace(/[^a-z0-9.-]/gi, "_"); }

function terminalValue(segment) {
  return segment?.terminal ?? segment?.provider?.terminal ?? segment?.status ?? segment?.provider?.status ?? null;
}

function terminalPass(segment) {
  const value = terminalValue(segment);
  if (segment?.httpPass === false || segment?.terminalPass === false) return false;
  if (segment?.deliveryMode === "non-streaming") return segment?.acceptance?.ok === true && String(value?.status || "").toLowerCase() === "completed";
  if (!segment?.terminalOutcome || segment.terminalOutcome.completed !== true || segment.terminalOutcome.outcome !== "completed") return false;
  if (value && typeof value === "object") {
    const type = value.type ?? value.event_type;
    const status = value.status ?? value.interaction?.status;
    return type === "interaction.completed" && status === "completed";
  }
  return false;
}

async function expectedEndingForSegment(segment, runDir, fallback) {
  const explicit = segment.expectedEndingTokens ?? segment.expectedEnding ?? segment.endingTokens;
  if (explicit) return explicit;
  const sourceFile = segment.sourceFile ?? segment.files?.source;
  if (typeof sourceFile === "string") {
    const sourcePath = isAbsolute(sourceFile) ? sourceFile : resolve(runDir, sourceFile);
    return deriveConservativeFinalLexicalTokens(await readFile(sourcePath, "utf8"));
  }
  return fallback;
}

async function expectedSourceForSegment(segment, runDir) {
  const sourceFile = segment.sourceFile ?? segment.files?.source;
  if (typeof sourceFile !== "string") return null;
  const sourcePath = isAbsolute(sourceFile) ? sourceFile : resolve(runDir, sourceFile);
  return readFile(sourcePath, "utf8");
}

function timingForSegment(segment) {
  const timing = segment?.timing || {};
  const timeValue = (value) => {
    const parsed = numeric(value);
    if (parsed !== null) return parsed;
    const date = Date.parse(String(value || ""));
    return Number.isFinite(date) ? date : null;
  };
  const started = timeValue(timing.startedAtMs ?? timing.startMs ?? timing.startedAt ?? segment?.startedAtMs ?? segment?.generationStartedMs ?? segment?.startedAt);
  const ended = timeValue(timing.endedAtMs ?? timing.endMs ?? timing.endedAt ?? segment?.endedAtMs ?? segment?.generationEndedMs ?? segment?.endedAt);
  const elapsed = numeric(timing.elapsedMs ?? segment?.elapsedMs ?? (started !== null && ended !== null ? ended - started : null));
  return { generationElapsedMs: elapsed, generationStartedAtMs: started, generationEndedAtMs: ended };
}

function summaryAsr(result, model, view, inputPath, rawPath) {
  const text = resultText(result);
  return {
    model,
    view,
    input: { path: basename(inputPath), bytes: null, sha256: null },
    transcript: { path: basename(rawPath), bytes: null, sha256: null },
    textSha256: sha256(text),
  };
}

async function asrView({ transcribe, python, transcriber, inputPath, outputPath, model, view, phrase, marker, expectedSource, requireExactSource = false }) {
  const startedAt = performance.now();
  const result = await transcribe({ python, transcriber, inputPath, outputPath, model, view });
  const input = await readFile(inputPath);
  const raw = await readFile(outputPath).catch(() => Buffer.from(JSON.stringify(result)));
  const summary = summaryAsr(result, model, view, inputPath, outputPath);
  summary.input = { path: basename(inputPath), bytes: input.length, sha256: sha256(input) };
  summary.transcript = { path: basename(outputPath), bytes: raw.length, sha256: sha256(raw) };
  summary.ending = phrasePresence(resultText(result), phrase);
  summary.marker = phrasePresence(resultText(result), marker);
  summary.marker.afterEnding = summary.ending.endToken >= 0 && summary.marker.startToken >= summary.ending.endToken;
  if (expectedSource !== null && expectedSource !== undefined) {
    summary.sourceFidelity = tokenSequenceComparison(resultText(result), expectedSource);
    summary.sourceFidelity.requiredMatch = requireExactSource ? "exact" : "prefix";
    summary.sourceFidelity.passed = requireExactSource ? summary.sourceFidelity.exact : summary.sourceFidelity.prefixExact;
  }
  const onset = findPhraseOnset(result, marker);
  summary.markerOnset = onset;
  summary.durationMs = Number((performance.now() - startedAt).toFixed(3));
  return { result, summary };
}

function normalizePcm(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof Int16Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value?.pcm) return normalizePcm(value.pcm);
  throw new Error("trim helper did not return PCM");
}

/** Linear PCM crossfade. Inputs are copied and remain byte-aligned. */
export function crossfadePcm(left, right, crossfadeSamples = 0) {
  const a = normalizePcm(left);
  const b = normalizePcm(right);
  if (a.length % 2 || b.length % 2) throw new RangeError("PCM must contain complete samples");
  const overlap = Math.min(Math.max(0, Math.floor(crossfadeSamples)), a.length / 2, b.length / 2);
  if (!overlap) return Buffer.concat([a, b]);
  const output = Buffer.alloc(a.length + b.length - overlap * 2);
  a.copy(output, 0, 0, a.length - overlap * 2);
  const join = a.length - overlap * 2;
  for (let index = 0; index < overlap; index += 1) {
    const alpha = (index + 1) / overlap;
    const av = a.readInt16LE((a.length - overlap * 2 + index * 2));
    const bv = b.readInt16LE(index * 2);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(av * (1 - alpha) + bv * alpha))), join + index * 2);
  }
  b.copy(output, join + overlap * 2, overlap * 2);
  return output;
}

export function concatenateSanitizedPcm(parts, { crossfadeSamples = 0 } = {}) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error("no sanitized PCM segments");
  return parts.map(normalizePcm).reduce((all, part) => crossfadePcm(all, part, crossfadeSamples), Buffer.alloc(0));
}

function writeSummary(path, value) { return writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }

function failure(result, classification, reason, error) {
  result.classification = classification;
  result.failure = reason;
  // Do not persist recognizer/provider error text: command lines and paths can
  // accidentally carry private input context.  The reason above is the
  // stable, privacy-safe diagnostic category.
  if (error) result.error = "analysis_error";
  return result;
}

/** Analyze an ignored Phase 2 run directory without contacting a provider. */
export async function analyzeGeminiTtsSegmentPipeline(runDirectory, options = {}) {
  const runDir = resolve(runDirectory);
  const { path: manifestPath, value: manifest } = await resolveManifest(runDir, options.manifestPath);
  const segments = getSegments(manifest);
  const analysisDir = options.analysisDir || join(runDir, ".analysis-segments");
  const segmentDir = join(analysisDir, "segments");
  await mkdir(segmentDir, { recursive: true });
  const models = options.models || ["base.en", "small.en"];
  if (models.length !== 2) throw new Error("exactly two recognizer models are required");
  const transcribe = options.transcribe || transcribeDefault;
  const deriveTail = options.deriveTail || deriveTailDefault;
  const providerLib = options.providerLib || { findLowEnergyBoundary, trimPcmAtLowEnergyBoundary, wrapPcmInWav };
  const wrapWav = providerLib.wrapPcmInWav || providerLib.pcmToWav || wrapPcmInWav;
  const result = {
    schema: "qr-mob-021.gemini-segment-pipeline-analysis.v1",
    run: { directory: basename(runDir), manifest: { path: basename(manifestPath), sha256: sha256(JSON.stringify(manifest)) } },
    mode: "offline",
    models,
    segments: [],
    pipeline: { segmentCount: segments.length },
    classification: null,
  };
  if (manifest.stoppedEarly || (Number.isInteger(manifest.requestedSegments) && manifest.requestedSegments !== segments.length)) {
    await writeSummary(join(analysisDir, "summary.json"), failure(result, "provider_failed", "segment_sequence_incomplete"));
    return result;
  }
  const pcmParts = [];
  const timing = [];
  const expectedEndings = [];
  const tailSeconds = Number(options.tailSeconds || manifest.tailSeconds || DEFAULT_TAIL_SECONDS);
  const tolerance = Number(options.markerToleranceSeconds || manifest.markerToleranceSeconds || DEFAULT_MARKER_TOLERANCE_SECONDS);

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const verificationStartedAt = performance.now();
    const segment = segments[segmentIndex];
    const segmentSummary = { index: segmentIndex, asr: { full: [], tail: [], trimmed: [] }, timing: timingForSegment(segment), trim: null, terminal: { present: terminalValue(segment) !== null, completed: terminalPass(segment) } };
    result.segments.push(segmentSummary);
    if (!segmentSummary.terminal.completed) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "provider_failed", "non_completed_terminal")); return result; }
    let audioPath;
    let audioBytes;
    let audio;
    try {
      audioPath = await resolveAudioPath(segment, runDir);
      audioBytes = await readFile(audioPath);
      audio = parseWav(audioBytes);
    } catch (error) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "provider_failed", "invalid_segment_audio", error)); return result; }
    segmentSummary.input = { path: basename(audioPath), bytes: audioBytes.length, sha256: sha256(audioBytes), durationSeconds: audio.durationSeconds };
    const phrase = await expectedEndingForSegment(segment, runDir, manifest.expectedEndingTokens ?? DEFAULT_ENDING);
    const expectedSource = await expectedSourceForSegment(segment, runDir);
    expectedEndings.push(phrase);
    const marker = segment.markerTokens ?? segment.marker ?? segment.suffixTokens ?? manifest.markerTokens ?? DEFAULT_MARKER;
    const fullEntries = [];
    try {
      for (const model of models) {
        const outputPath = join(segmentDir, `${String(segmentIndex).padStart(2, "0")}-full-${safeModel(model)}.json`);
        fullEntries.push(await asrView({ transcribe, python: options.python || DEFAULT_PYTHON, transcriber: options.transcriber || DEFAULT_TRANSCRIBER, inputPath: audioPath, outputPath, model, view: "full", phrase, marker, expectedSource }));
      }
    } catch (error) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "provider_failed", "full_asr_failed", error)); return result; }
    segmentSummary.asr.full = fullEntries.map((entry) => entry.summary);
    const tailPath = join(segmentDir, `${String(segmentIndex).padStart(2, "0")}-tail.wav`);
    const tailDerivationStartedAt = performance.now();
    try { await deriveTail({ inputPath: audioPath, outputPath: tailPath, seconds: tailSeconds, tailSeconds, sampleRate: GEMINI_PCM_FORMAT.sampleRate, segmentIndex }); }
    catch (error) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "provider_failed", "tail_derivation_failed", error)); return result; }
    segmentSummary.timing.tailDerivationMs = Number((performance.now() - tailDerivationStartedAt).toFixed(3));
    let tailAudio;
    try { tailAudio = parseWav(await readFile(tailPath)); }
    catch (error) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "provider_failed", "invalid_tail_audio", error)); return result; }
    const tailStart = Math.max(0, audio.durationSeconds - tailAudio.durationSeconds);
    const tailEntries = [];
    const trimStartedAt = performance.now();
    try {
      for (const model of models) {
        const outputPath = join(segmentDir, `${String(segmentIndex).padStart(2, "0")}-tail-${safeModel(model)}.json`);
        tailEntries.push(await asrView({ transcribe, python: options.python || DEFAULT_PYTHON, transcriber: options.transcriber || DEFAULT_TRANSCRIBER, inputPath: tailPath, outputPath, model, view: "tail", phrase, marker }));
      }
    } catch (error) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "provider_failed", "tail_asr_failed", error)); return result; }
    segmentSummary.asr.tail = tailEntries.map((entry) => entry.summary);
    const endingPass = [...fullEntries, ...tailEntries].every((entry) => entry.summary.ending.complete && entry.summary.ending.finalRegion);
    const markerEntries = [...fullEntries, ...tailEntries];
    const markerPass = markerEntries.every((entry) => entry.summary.marker.complete && entry.summary.marker.afterEnding && entry.summary.markerOnset)
      && (expectedSource === null || fullEntries.every((entry) => entry.summary.marker.startToken === entry.summary.sourceFidelity?.expectedTokenCount));
    const sourceFidelityPass = expectedSource === null || fullEntries.every((entry) => entry.summary.sourceFidelity?.passed);
    if (!endingPass) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "ending_missing", "recognizer_missing_expected_ending")); return result; }
    if (!sourceFidelityPass) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "source_mismatch", "recognizer_full_source_mismatch")); return result; }
    if (!markerPass) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "trim_uncertain", "marker_missing_or_unusable")); return result; }
    const onsets = [
      ...fullEntries.map((entry) => entry.summary.markerOnset.start),
      ...tailEntries.map((entry) => entry.summary.markerOnset.start + tailStart),
    ];
    const spread = Math.max(...onsets) - Math.min(...onsets);
    segmentSummary.trim = { markerOnsetsSeconds: onsets, disagreementSeconds: spread, toleranceSeconds: tolerance };
    if (!Number.isFinite(spread) || spread > tolerance) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "trim_uncertain", "marker_onset_disagreement")); return result; }
    const markerOnsetSample = Math.floor(Math.min(...onsets) * audio.sampleRate);
    let trimmed;
    try {
      const boundaryFinder = providerLib.findLowEnergyBoundary || providerLib.findLowEnergyTrimBoundary || providerLib.findLowEnergyCut;
      let expectedBoundary = null;
      const trimOptions = { format: GEMINI_PCM_FORMAT, fadeSamples: Math.round((options.fadeMs || 30) * audio.sampleRate / 1000) };
      if (typeof boundaryFinder === "function") {
        const found = await boundaryFinder(audio.data, markerOnsetSample, trimOptions);
        expectedBoundary = found?.boundarySample ?? found?.sample ?? found?.sampleIndex ?? (Number.isInteger(found) ? found : null);
        if (!Number.isInteger(expectedBoundary) || expectedBoundary <= 0 || expectedBoundary > markerOnsetSample) throw new Error("unsafe low-energy boundary");
      }
      const trim = providerLib.trimPcmAtLowEnergyBoundary || providerLib.trimPcmWithFade || trimPcmAtLowEnergyBoundary;
      trimmed = await trim(audio.data, markerOnsetSample, trimOptions);
      const boundary = trimmed?.boundarySample ?? trimmed?.sample ?? null;
      if (!Number.isInteger(boundary) || boundary <= 0 || boundary > markerOnsetSample || boundary >= audio.data.length / 2) throw new Error("unsafe trim boundary");
      if (expectedBoundary !== null && boundary !== expectedBoundary) throw new Error("trim helper selected a different boundary");
      const pcm = normalizePcm(trimmed?.pcm ?? trimmed);
      segmentSummary.trim.boundarySample = boundary;
      segmentSummary.trim.boundarySeconds = boundary / audio.sampleRate;
      const sanitizedWav = wrapWav(pcm);
      segmentSummary.trim.output = { path: `${String(segmentIndex).padStart(2, "0")}-sanitized.wav`, bytes: sanitizedWav.length, sha256: sha256(sanitizedWav), durationSeconds: pcm.length / 2 / audio.sampleRate };
      await writeFile(join(segmentDir, `${String(segmentIndex).padStart(2, "0")}-sanitized.wav`), sanitizedWav);
      pcmParts.push(pcm);
      for (const model of models) {
        const outputPath = join(segmentDir, `${String(segmentIndex).padStart(2, "0")}-trimmed-${safeModel(model)}.json`);
        segmentSummary.asr.trimmed.push((await asrView({ transcribe, python: options.python || DEFAULT_PYTHON, transcriber: options.transcriber || DEFAULT_TRANSCRIBER, inputPath: join(segmentDir, `${String(segmentIndex).padStart(2, "0")}-sanitized.wav`), outputPath, model, view: "trimmed", phrase, marker, expectedSource, requireExactSource: true })).summary);
      }
    } catch (error) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "trim_uncertain", "fade_trim_or_trimmed_asr_failed", error)); return result; }
    segmentSummary.timing.trimAndPostTrimVerificationMs = Number((performance.now() - trimStartedAt).toFixed(3));
    const trimmedEndingPass = segmentSummary.asr.trimmed.every((entry) => entry.ending.complete);
    const trimmedSourceFidelityPass = expectedSource === null || segmentSummary.asr.trimmed.every((entry) => entry.sourceFidelity?.passed);
    const markerLeak = segmentSummary.asr.trimmed.some((entry) => entry.marker.tokens.some(Boolean));
    segmentSummary.trim.markerLeak = markerLeak;
    if (markerLeak) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "marker_leak", "marker_recovered_after_trim")); return result; }
    if (!trimmedEndingPass) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "ending_missing", "trimmed_audio_lost_expected_ending")); return result; }
    if (!trimmedSourceFidelityPass) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "source_mismatch", "trimmed_audio_source_mismatch")); return result; }
    segmentSummary.timing.verificationElapsedMs = Number((performance.now() - verificationStartedAt).toFixed(3));
    timing.push(segmentSummary.timing);
  }

  const crossfadeSamples = Math.round((options.crossfadeMs ?? manifest.crossfadeMs ?? DEFAULT_CROSSFADE_MS) * GEMINI_PCM_FORMAT.sampleRate / 1000);
  let combined;
  try { combined = concatenateSanitizedPcm(pcmParts, { crossfadeSamples }); }
  catch (error) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "trim_uncertain", "concatenation_failed", error)); return result; }
  const combinedPath = join(analysisDir, "sanitized-pipeline.wav");
  const combinedWav = wrapWav(combined);
  await writeFile(combinedPath, combinedWav);
  result.pipeline.output = { path: basename(combinedPath), bytes: combinedWav.length, sha256: sha256(combinedWav), durationSeconds: combined.length / 2 / GEMINI_PCM_FORMAT.sampleRate, crossfadeSamples };
  result.pipeline.timing = summarizeTiming(timing);
  const combinedAsr = [];
  const combinedEntries = [];
  try {
    for (const model of models) {
      const outputPath = join(analysisDir, `combined-${safeModel(model)}.json`);
      const finalSegment = segments[segments.length - 1];
      const entry = await asrView({ transcribe, python: options.python || DEFAULT_PYTHON, transcriber: options.transcriber || DEFAULT_TRANSCRIBER, inputPath: combinedPath, outputPath, model, view: "combined", phrase: finalSegment.expectedEndingTokens ?? finalSegment.expectedEnding ?? finalSegment.endingTokens ?? manifest.expectedEndingTokens ?? DEFAULT_ENDING, marker: finalSegment.markerTokens ?? finalSegment.marker ?? finalSegment.suffixTokens ?? manifest.markerTokens ?? DEFAULT_MARKER });
      combinedEntries.push(entry);
      combinedAsr.push(entry.summary);
    }
  } catch (error) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "provider_failed", "combined_asr_failed", error)); return result; }
  result.pipeline.asr = combinedAsr;
  const sequenceChecks = combinedEntries.map((entry) => phrasesInOrder(resultText(entry.result), expectedEndings));
  result.pipeline.segmentEndingsInOrder = sequenceChecks.map((entry) => entry.present);
  const combinedEnding = sequenceChecks.every((entry) => entry.complete);
  const combinedMarkerLeak = combinedAsr.some((entry) => entry.marker.tokens.some(Boolean));
  if (!combinedEnding) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "ending_missing", "combined_audio_missing_expected_ending")); return result; }
  if (combinedMarkerLeak) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "marker_leak", "combined_audio_contains_marker")); return result; }
  const simulation = simulateSequentialGenerationConcurrentPlayback(result.segments.map((segment) => ({
    generationDurationMs: segment.timing.generationElapsedMs,
    firstAudioLatencyMs: segments[segment.index]?.firstAudioLatencyMs ?? 0,
    verificationMs: segment.timing.verificationElapsedMs,
    durationMs: segment.trim.output.durationSeconds * 1000,
  })));
  result.pipeline.playbackSimulation = simulation;
  result.pipeline.workerLimits = { providerRequests: 1, verificationWorkers: 1 };
  result.pipeline.actualAudibleStartMs = null;
  if (!simulation.ok) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "timing_failed", "playback_simulation_failed")); return result; }
  if (simulation.firstAudioLatencyMs > 30_000) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "timing_failed", "first_audio_latency_exceeded")); return result; }
  if (simulation.gapsBySegment.slice(1).some((gap) => gap > 500)) { await writeSummary(join(analysisDir, "summary.json"), failure(result, "timing_failed", "inter_segment_gap_exceeded")); return result; }
  result.pipeline.cleanSequenceUx = simulation.gapsBySegment.slice(1).every((gap) => gap <= 250);
  result.classification = "complete";
  await writeSummary(join(analysisDir, "summary.json"), result);
  return result;
}

function summarizeTiming(entries) {
  const elapsed = entries.map((entry) => entry.generationElapsedMs).filter((value) => value !== null);
  const starts = entries.map((entry) => entry.generationStartedAtMs).filter((value) => value !== null);
  const ends = entries.map((entry) => entry.generationEndedAtMs).filter((value) => value !== null);
  return {
    metadataPresent: elapsed.length === entries.length && entries.length > 0,
    segmentGenerationElapsedMs: elapsed,
    totalGenerationElapsedMs: elapsed.length === entries.length ? elapsed.reduce((sum, value) => sum + value, 0) : null,
    firstSegmentStartedAtMs: starts.length === entries.length ? Math.min(...starts) : null,
    lastSegmentEndedAtMs: ends.length === entries.length ? Math.max(...ends) : null,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { if (!result.run) result.run = token; continue; }
    const [key, inline] = token.slice(2).split("=", 2);
    result[key] = inline ?? (argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.run) {
    process.stderr.write("usage: analyze-gemini-tts-segment-pipeline.mjs <ignored-run-directory>\n");
    process.exitCode = 2;
  } else {
    analyzeGeminiTtsSegmentPipeline(args.run, { tailSeconds: args["tail-seconds"] })
      .then((value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`))
      .catch((error) => { process.stderr.write(`segment analysis failed: ${error.message || error}\n`); process.exitCode = 1; });
  }
}
