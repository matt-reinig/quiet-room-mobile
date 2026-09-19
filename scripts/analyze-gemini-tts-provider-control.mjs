#!/usr/bin/env node

/*
 * Offline analysis for a Gemini provider-control run.  This module deliberately
 * has no HTTP/provider code: the runner owns that boundary, and this command
 * only reads its manifest and PCM/WAV output.  Full recognizer output is kept
 * in the ignored run directory; the returned/written summary contains only
 * hashes, tool/model metadata, and phrase-presence booleans.
 */

import { createHash } from "node:crypto";
import { execFile as nodeExecFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { lexicalTokens } from "./gemini-tts-segment-pipeline-lib.mjs";

const execFile = promisify(nodeExecFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PYTHON = resolve(SCRIPT_DIR, "../.local/qr-mob-021-asr/venv/bin/python");
const DEFAULT_TRANSCRIBER = resolve(SCRIPT_DIR, "../.local/qr-mob-021-asr/transcribe.py");
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_TAIL_SECONDS = 25;
const DEFAULT_MARKER_TOLERANCE_SECONDS = 0.75;
const DEFAULT_FADE_MS = 30;

const ENDING_TOKEN_ALTERNATIVES = Object.freeze([
  ["copper"],
  ["meadow"],
  ["nine", "9"],
]);
const MARKER_TOKEN_ALTERNATIVES = Object.freeze([
  ["violet"],
  ["window"],
  ["thirteen", "13"],
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function tokenise(value) {
  return lexicalTokens(String(value || ""));
}

function normalizedAlternatives(parts) {
  return parts.map((alternatives) => [...new Set(alternatives.flatMap((value) => lexicalTokens(value)))])
    .map((alternatives) => alternatives.length ? alternatives : [""]);
}

function locateSequences(tokens, phraseParts) {
  const phrase = normalizedAlternatives(phraseParts);
  const starts = [];
  for (let index = 0; index <= tokens.length - phrase.length; index += 1) {
    if (phrase.every((alternatives, offset) => alternatives.includes(tokens[index + offset]))) starts.push(index);
  }
  return { starts, length: phrase.length };
}

function phraseBooleans(text) {
  const tokens = tokenise(text);
  const ending = locateSequences(tokens, ENDING_TOKEN_ALTERNATIVES);
  const marker = locateSequences(tokens, MARKER_TOKEN_ALTERNATIVES);
  const endingStart = ending.starts.at(-1) ?? -1;
  const markerStart = marker.starts.find((start) => start >= endingStart + ending.length) ?? -1;
  return {
    ending: {
      copper: tokens.includes("copper"),
      meadow: tokens.includes("meadow"),
      nine: tokens.includes("9"),
      complete: ending.starts.length > 0,
      contiguous: ending.starts.length > 0,
      occurrenceCount: ending.starts.length,
      startToken: endingStart,
      endToken: endingStart < 0 ? -1 : endingStart + ending.length,
      finalRegion: endingStart >= 0 && endingStart + ending.length >= tokens.length - 6,
    },
    marker: {
      violet: tokens.includes("violet"),
      window: tokens.includes("window"),
      thirteen: tokens.includes("13"),
      complete: marker.starts.length === 1,
      contiguous: marker.starts.length > 0,
      occurrenceCount: marker.starts.length,
      startToken: marker.starts[0] ?? -1,
      afterEnding: markerStart >= 0,
    },
  };
}

function getText(result) {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  if (typeof result.text === "string") return result.text;
  if (typeof result.transcript === "string") return result.transcript;
  if (typeof result.result === "string") return result.result;
  if (Array.isArray(result.segments)) return result.segments.map((segment) => segment?.text || "").join(" ");
  return "";
}

function segmentTime(segment, key) {
  const value = segment?.[key] ?? segment?.[`${key}_seconds`] ?? segment?.[`${key}Seconds`];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timelineFromAsr(result) {
  const timeline = [];
  for (const segment of Array.isArray(result?.segments) ? result.segments : []) {
    const words = Array.isArray(segment?.words) ? segment.words : [];
    if (words.length > 0) {
      for (const word of words) {
        const start = segmentTime(word, "start");
        const end = segmentTime(word, "end");
        if (start !== null) timeline.push({ text: String(word.word ?? word.text ?? ""), start, end: end ?? start });
      }
      continue;
    }
    const start = segmentTime(segment, "start");
    const end = segmentTime(segment, "end");
    if (start !== null) timeline.push({ text: String(segment?.text || ""), start, end: end ?? start });
  }
  return timeline;
}

function tokenMatches(text, alternatives) {
  const tokens = tokenise(text);
  return alternatives.some((alternative) => tokens.includes(alternative));
}

/** Return the first complete marker sequence's onset, or null. */
export function findMarkerOnset(result) {
  const timeline = timelineFromAsr(result);
  if (timeline.length === 0) return null;
  for (let index = 0; index < timeline.length; index += 1) {
    if (!tokenMatches(timeline[index].text, MARKER_TOKEN_ALTERNATIVES[0])) continue;
    let markerPart = 1;
    let end = timeline[index].end;
    while (index + markerPart < timeline.length && markerPart < MARKER_TOKEN_ALTERNATIVES.length) {
      const next = timeline[index + markerPart];
      if (!tokenMatches(next.text, MARKER_TOKEN_ALTERNATIVES[markerPart])) break;
      end = next.end;
      markerPart += 1;
    }
    if (markerPart === MARKER_TOKEN_ALTERNATIVES.length) return { start: timeline[index].start, end };
  }
  // Segment timestamps often contain the complete sentence rather than words.
  // In that case, use its start only after all marker words are present.
  for (const item of timeline) {
    const phrase = phraseBooleans(item.text).marker;
    if (phrase.complete) return { start: item.start, end: item.end };
  }
  return null;
}

function summarizeAsr(result, { model, view, inputPath, outputPath, command }) {
  const text = getText(result);
  const phrases = phraseBooleans(text);
  const markerOnset = findMarkerOnset(result);
  return {
    model,
    view,
    tool: {
      name: result?.tool?.name || result?.toolName || "faster-whisper",
      version: result?.tool?.version || result?.toolVersion || null,
      modelRevision: result?.modelRevision || result?.model?.revision || null,
      command: command || null,
    },
    input: { path: basename(inputPath), bytes: null, sha256: null },
    rawTranscript: { path: basename(outputPath), sha256: null },
    ending: phrases.ending,
    marker: phrases.marker,
    markerOnset,
  };
}

function parseWav(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("expected a RIFF/WAVE file");
  }
  let format = null;
  let data = null;
  let cursor = 12;
  while (cursor + 8 <= buffer.length) {
    const id = buffer.toString("ascii", cursor, cursor + 4);
    const size = buffer.readUInt32LE(cursor + 4);
    const start = cursor + 8;
    if (id === "fmt ") format = {
      audioFormat: buffer.readUInt16LE(start),
      channels: buffer.readUInt16LE(start + 2),
      sampleRate: buffer.readUInt32LE(start + 4),
      bitsPerSample: buffer.readUInt16LE(start + 14),
    };
    if (id === "data") data = buffer.subarray(start, Math.min(buffer.length, start + size));
    cursor = start + size + (size % 2);
  }
  if (!format || !data || format.audioFormat !== 1 || format.bitsPerSample !== 16 || format.channels !== 1 || format.sampleRate !== DEFAULT_SAMPLE_RATE || data.byteLength % 2 !== 0) {
    throw new Error("expected aligned mono 16-bit 24 kHz PCM WAV");
  }
  return {
    ...format,
    data,
    samples: new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2)),
    durationSeconds: data.byteLength / 2 / format.sampleRate,
  };
}

function wavFromPcm(samples, sampleRate) {
  const pcm = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      if (!parsed.run) parsed.run = token;
      continue;
    }
    const [key, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) parsed[key] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) parsed[key] = argv[++index];
    else parsed[key] = true;
  }
  return parsed;
}

async function resolveManifest(runDir, manifestPath) {
  const candidate = manifestPath || join(runDir, "manifest.json");
  try { return { path: candidate, value: JSON.parse(await readFile(candidate, "utf8")) }; } catch (error) {
    if (manifestPath) throw error;
    const alternate = join(runDir, "run-manifest.json");
    return { path: alternate, value: JSON.parse(await readFile(alternate, "utf8")) };
  }
}

function recursivePath(value, keys = []) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    if (typeof value[key] === "string" && /\.(wav|wave)$/i.test(value[key])) return value[key];
  }
  for (const child of Object.values(value)) {
    const found = recursivePath(child, keys);
    if (found) return found;
  }
  return null;
}

async function audioPathFromManifest(manifest, runDir) {
  const explicit = recursivePath(manifest, ["wav", "wavPath", "audioWav", "audioPath", "pcmWav", "sourceWav"]);
  if (explicit) return isAbsolute(explicit) ? explicit : resolve(runDir, explicit);
  const fallback = ["audio.wav", "source.wav", "output.wav", "response.wav"];
  for (const name of fallback) {
    const candidate = join(runDir, name);
    try { await access(candidate); return candidate; } catch { /* try the next documented fallback */ }
  }
  throw new Error("manifest does not identify a WAV output");
}

async function defaultDeriveTail({ inputPath, outputPath, tailSeconds, sampleRate }) {
  await execFile("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-sseof", `-${tailSeconds}`,
    "-i", inputPath, "-vn", "-ac", "1", "-ar", String(sampleRate), "-c:a", "pcm_s16le", "-f", "wav", outputPath,
  ]);
}

async function defaultTranscribe({ python, transcriber, inputPath, outputPath, model }) {
  const args = [transcriber, inputPath, outputPath, "--model", model, "--language", "en", "--beam-size", "5"];
  await execFile(python, args, { maxBuffer: 1024 * 1024 });
  return JSON.parse(await readFile(outputPath, "utf8"));
}

async function loadLib(injected) {
  if (injected) return injected;
  return import("./gemini-tts-provider-lib.mjs");
}

async function callBoundary(lib, context) {
  const helper = lib.findLowEnergyBoundary || lib.findLowEnergyTrimBoundary || lib.findLowEnergyCut;
  if (typeof helper !== "function") throw new Error("provider helper lacks low-energy boundary function");
  const pcm = Buffer.from(context.samples.buffer, context.samples.byteOffset, context.samples.byteLength);
  return helper(pcm, context.markerOnsetSample, {
    format: { sampleRate: context.sampleRate, channels: 1, bitsPerSample: 16, signed: true, littleEndian: true },
  });
}

async function callTrim(lib, context) {
  const helper = lib.trimPcmAtLowEnergyBoundary || lib.trimPcmWithFade || lib.trimAndFadePcm || lib.applyFadeTrim;
  if (typeof helper !== "function") throw new Error("provider helper lacks PCM fade-trim function");
  const pcm = Buffer.from(context.samples.buffer, context.samples.byteOffset, context.samples.byteLength);
  return helper(pcm, context.markerOnsetSample, {
    format: { sampleRate: context.sampleRate, channels: 1, bitsPerSample: 16, signed: true, littleEndian: true },
    fadeSamples: Math.round(context.fadeMs * context.sampleRate / 1000),
  });
}

function normaliseBoundary(value) {
  if (typeof value === "number") return value;
  return value?.sample ?? value?.sampleIndex ?? value?.endSample ?? value?.boundarySample ?? null;
}

function normalisePcm(value) {
  if (value instanceof Int16Array) return value;
  if (Buffer.isBuffer(value)) return new Int16Array(value.buffer, value.byteOffset, Math.floor(value.byteLength / 2));
  if (value?.samples instanceof Int16Array) return value.samples;
  if (value?.pcm instanceof Int16Array) return value.pcm;
  if (Buffer.isBuffer(value?.pcm)) return new Int16Array(value.pcm.buffer, value.pcm.byteOffset, Math.floor(value.pcm.byteLength / 2));
  throw new Error("provider fade-trim helper did not return PCM samples");
}

function maxMarkerDisagreement(onsets) {
  const values = onsets.filter((onset) => onset !== null).map((onset) => onset.start);
  if (values.length < 2) return null;
  return Math.max(...values) - Math.min(...values);
}

function tokenPass(result, key) {
  return Boolean(result?.[key]?.complete);
}

async function transcribeView({ transcribe, python, transcriber, inputPath, outputPath, model, view }) {
  const command = `${python} ${transcriber} ${inputPath} ${outputPath} --model ${model} --language en --beam-size 5`;
  const result = await transcribe({ python, transcriber, inputPath, outputPath, model, view, command });
  const summary = summarizeAsr(result, { model, view, inputPath, outputPath, command });
  const inputBytes = await readFile(inputPath);
  const rawBytes = await readFile(outputPath).catch(() => Buffer.from(JSON.stringify(result)));
  summary.input = { path: basename(inputPath), bytes: inputBytes.length, sha256: sha256(inputBytes) };
  summary.rawTranscript = { path: basename(outputPath), bytes: rawBytes.length, sha256: sha256(rawBytes) };
  return { result, summary };
}

/** Analyze one ignored provider run. See the plan for the fail-closed gates. */
export async function analyzeGeminiProviderRun(runDirectory, options = {}) {
  const runDir = resolve(runDirectory);
  const { path: manifestPath, value: manifest } = await resolveManifest(runDir, options.manifestPath);
  const audioPath = options.audioPath || await audioPathFromManifest(manifest, runDir);
  const audioBytes = await readFile(audioPath);
  const audio = parseWav(audioBytes);
  const analysisDir = options.analysisDir || join(runDir, ".analysis");
  await mkdir(analysisDir, { recursive: true });
  const tailRun = Boolean(manifest.tail || manifest.hasTail || manifest.mode?.includes?.("tail") || manifest.condition?.includes?.("tail") || manifest.variant === "tail-a" || manifest.variant === "tail-b");
  const models = options.models || ["base.en", "small.en"];
  const transcribe = options.transcribe || ((context) => defaultTranscribe(context));
  const transcriber = options.transcriber || DEFAULT_TRANSCRIBER;
  const python = options.python || DEFAULT_PYTHON;
  const lib = await loadLib(options.providerLib);
  const result = {
    schema: "qr-mob-021.gemini-provider-analysis.v1",
    run: { directory: basename(runDir), manifest: { path: basename(manifestPath), sha256: sha256(Buffer.from(JSON.stringify(manifest))) } },
    input: { path: basename(audioPath), bytes: audioBytes.length, sha256: sha256(audioBytes), sampleRate: audio.sampleRate, channels: audio.channels, durationSeconds: audio.durationSeconds },
    provider: {
      terminal: manifest.terminal || manifest.provider?.terminal || manifest.status || null,
      terminalOutcome: manifest.terminalOutcome || manifest.provider?.terminalOutcome || null,
      acceptance: manifest.acceptance || manifest.provider?.acceptance || null,
      model: manifest.model || manifest.request?.model || manifest.provider?.model || null,
      responseId: manifest.responseId || manifest.provider?.responseId || null,
    },
    mode: tailRun ? "tail" : "control",
    asr: { full: [], tail: [], trimmed: [] },
    classification: null,
  };
  const terminal = result.provider.terminal;
  // A missing terminal outcome is intentionally a failure.  HTTP 200, bytes,
  // or a closed stream are not provider completion evidence.
  const terminalType = terminal?.type ?? terminal?.event_type;
  const terminalStatus = terminal?.status ?? terminal?.interaction?.status;
  const outcome = result.provider.terminalOutcome;
  const exactStreamingTerminal = terminalType === "interaction.completed" && terminalStatus === "completed";
  const terminalPass = result.provider.acceptance?.ok === true
    && (manifest.deliveryMode === "non-streaming" || (outcome?.completed === true && outcome?.outcome === "completed" && exactStreamingTerminal));
  result.provider.terminalPass = terminalPass;

  const full = [];
  for (const model of models) {
    const outputPath = join(analysisDir, `transcript-full-${model.replace(/[^a-z0-9.-]/gi, "_")}.json`);
    try { full.push(await transcribeView({ transcribe, python, transcriber, inputPath: audioPath, outputPath, model, view: "full" })); }
    catch (error) { result.classification = "provider_failed"; result.failure = "asr_failed"; result.error = String(error.message || error); await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`); return result; }
  }
  result.asr.full = full.map((entry) => entry.summary);

  const tailSeconds = numberOr(manifest.tailSeconds || manifest.provider?.tailSeconds, options.tailSeconds || DEFAULT_TAIL_SECONDS);
  const tailPath = join(analysisDir, "derived-final-tail.wav");
  try {
    if (options.deriveTail) await options.deriveTail({ inputPath: audioPath, outputPath: tailPath, tailSeconds, sampleRate: audio.sampleRate });
    else await defaultDeriveTail({ inputPath: audioPath, outputPath: tailPath, tailSeconds, sampleRate: audio.sampleRate });
  } catch (error) {
    result.classification = "provider_failed"; result.failure = "tail_derivation_failed"; result.error = String(error.message || error);
    await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`); return result;
  }
  const tailBytes = await readFile(tailPath);
  const tailWav = parseWav(tailBytes);
  result.input.tail = { path: basename(tailPath), bytes: tailBytes.length, sha256: sha256(tailBytes), durationSeconds: tailWav.durationSeconds, startSeconds: Math.max(0, audio.durationSeconds - tailWav.durationSeconds) };
  const tail = [];
  for (const model of models) {
    const outputPath = join(analysisDir, `transcript-tail-${model.replace(/[^a-z0-9.-]/gi, "_")}.json`);
    try { tail.push(await transcribeView({ transcribe, python, transcriber, inputPath: tailPath, outputPath, model, view: "tail" })); }
    catch (error) { result.classification = "provider_failed"; result.failure = "tail_asr_failed"; result.error = String(error.message || error); await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`); return result; }
  }
  result.asr.tail = tail.map((entry) => entry.summary);

  const endingFullPass = full.every((entry) => tokenPass(entry.summary, "ending") && entry.summary.ending.finalRegion);
  const endingTailPass = tail.every((entry) => tokenPass(entry.summary, "ending") && entry.summary.ending.finalRegion);
  if (!endingFullPass || !endingTailPass) {
    result.contentClassification = "ending_missing";
    result.classification = terminalPass ? "ending_missing" : "provider_failed";
    if (!terminalPass) result.failure = "non_completed_terminal";
    await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  if (!tailRun) {
    result.contentClassification = "complete";
    result.classification = terminalPass ? "complete" : "provider_failed";
    if (!terminalPass) result.failure = "non_completed_terminal";
    await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  const orderedSuffixPass = [...full, ...tail].every((entry) => entry.summary.marker.complete && entry.summary.marker.afterEnding);
  if (!orderedSuffixPass) {
    result.classification = "trim_uncertain";
    result.failure = "marker_missing_repeated_or_out_of_order";
    await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  const fullOnsets = full.map((entry) => entry.summary.markerOnset).filter(Boolean);
  const tailOnsets = tail.map((entry) => entry.summary.markerOnset).filter(Boolean);
  const tailStart = result.input.tail.startSeconds;
  const absoluteTailOnsets = tailOnsets.map((onset) => ({ start: onset.start + tailStart, end: onset.end + tailStart }));
  const allOnsets = [...fullOnsets, ...absoluteTailOnsets];
  const disagreement = maxMarkerDisagreement(allOnsets);
  result.trim = { markerOnsetsSeconds: allOnsets.map((onset) => onset.start), disagreementSeconds: disagreement, toleranceSeconds: options.markerToleranceSeconds || DEFAULT_MARKER_TOLERANCE_SECONDS };
  if (allOnsets.length !== full.length + tail.length || disagreement === null || disagreement > result.trim.toleranceSeconds) {
    result.classification = "trim_uncertain";
    await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  const markerOnsetSeconds = Math.min(...allOnsets.map((onset) => onset.start));
  const markerOnsetSample = Math.max(0, Math.floor(markerOnsetSeconds * audio.sampleRate));
  let boundary;
  try { boundary = normaliseBoundary(await callBoundary(lib, { samples: audio.samples, sampleRate: audio.sampleRate, markerOnsetSample, markerOnsetSeconds, fadeMs: DEFAULT_FADE_MS })); }
  catch (error) { result.classification = "trim_uncertain"; result.failure = "low_energy_boundary_failed"; result.error = String(error.message || error); await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`); return result; }
  if (!Number.isInteger(boundary) || boundary <= 0 || boundary >= audio.samples.length || boundary > markerOnsetSample) {
    result.classification = "trim_uncertain";
    await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  let trimmedSamples;
  try {
    const trimmed = await callTrim(lib, { samples: audio.samples, sampleRate: audio.sampleRate, markerOnsetSample, endSample: boundary, boundarySample: boundary, fadeMs: DEFAULT_FADE_MS });
    if (normaliseBoundary(trimmed) !== boundary) throw new Error("trim helper selected a different boundary");
    trimmedSamples = normalisePcm(trimmed);
  }
  catch (error) { result.classification = "trim_uncertain"; result.failure = "fade_trim_failed"; result.error = String(error.message || error); await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`); return result; }
  const trimmedPath = join(analysisDir, "trimmed.wav");
  await writeFile(trimmedPath, wavFromPcm(trimmedSamples, audio.sampleRate));
  result.trim.boundarySample = boundary;
  result.trim.boundarySeconds = boundary / audio.sampleRate;
  result.trim.output = { path: basename(trimmedPath), bytes: (await readFile(trimmedPath)).length, sha256: sha256(await readFile(trimmedPath)), durationSeconds: trimmedSamples.length / audio.sampleRate };
  for (const model of models) {
    const outputPath = join(analysisDir, `transcript-trimmed-${model.replace(/[^a-z0-9.-]/gi, "_")}.json`);
    try { result.asr.trimmed.push((await transcribeView({ transcribe, python, transcriber, inputPath: trimmedPath, outputPath, model, view: "trimmed" })).summary); }
    catch (error) { result.classification = "trim_uncertain"; result.failure = "trimmed_asr_failed"; result.error = String(error.message || error); await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`); return result; }
  }
  const trimmedEndingPass = result.asr.trimmed.every((entry) => tokenPass(entry, "ending"));
  const markerLeaked = result.asr.trimmed.some((entry) => entry.marker.violet || entry.marker.window || entry.marker.thirteen);
  result.trim.markerLeak = markerLeaked;
  result.classification = markerLeaked ? "marker_leak" : trimmedEndingPass ? "complete" : "ending_missing";
  await writeFile(join(analysisDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export { phraseBooleans, parseWav, wavFromPcm };

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.run) {
    process.stderr.write("usage: analyze-gemini-tts-provider-control.mjs <ignored-run-directory> [--tail-seconds N]\n");
    process.exitCode = 2;
  } else {
    analyzeGeminiProviderRun(args.run, { tailSeconds: args["tail-seconds"] })
      .then((summary) => process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`))
      .catch((error) => { process.stderr.write(`provider analysis failed: ${error.message || error}\n`); process.exitCode = 1; });
  }
}
