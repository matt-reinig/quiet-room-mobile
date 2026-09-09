#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CHECKER_SCHEMA_VERSION = "qr-mob-021.capture-check.v1";
export const DEFAULT_SAMPLE_RATE = 8_000;
export const DEFAULT_FRAME_MS = 20;
export const DEFAULT_HOP_MS = 20;
export const DEFAULT_MIN_ALIGNMENT_CORRELATION = 0.78;
export const DEFAULT_MIN_CLOSING_CORRELATION = 0.72;
export const DEFAULT_MIN_CLOSING_ENERGY_RATIO = 0.45;
export const DEFAULT_MIN_COVERAGE = 0.95;
export const DEFAULT_MIN_MISSING_TAIL_ALIGNMENT_CORRELATION = 0.75;
export const DEFAULT_CLOSING_ALIGNMENT_WINDOW_MS = 750;

const DEFAULT_OPTIONS = {
  frameMs: DEFAULT_FRAME_MS,
  hopMs: DEFAULT_HOP_MS,
  minAlignmentCorrelation: DEFAULT_MIN_ALIGNMENT_CORRELATION,
  minClosingCorrelation: DEFAULT_MIN_CLOSING_CORRELATION,
  minClosingEnergyRatio: DEFAULT_MIN_CLOSING_ENERGY_RATIO,
  minCoverage: DEFAULT_MIN_COVERAGE,
  minMissingTailAlignmentCorrelation: DEFAULT_MIN_MISSING_TAIL_ALIGNMENT_CORRELATION,
  closingAlignmentWindowMs: DEFAULT_CLOSING_ALIGNMENT_WINDOW_MS,
  sampleRate: DEFAULT_SAMPLE_RATE,
  searchStepMs: DEFAULT_HOP_MS,
};

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = finiteNumber(value, fallback);
  return Math.min(maximum, Math.max(minimum, parsed));
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const withoutPrefix = token.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");
    if (equalsIndex >= 0) {
      options[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[withoutPrefix] = next;
      index += 1;
    } else {
      options[withoutPrefix] = true;
    }
  }

  return options;
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashFileBytes(bytes) {
  return { bytes: bytes.byteLength, sha256: hashBytes(bytes) };
}

function rms(samples, start, end) {
  if (end <= start) {
    return 0;
  }

  let sum = 0;
  for (let index = start; index < end; index += 1) {
    const sample = samples[index] || 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / (end - start));
}

export function buildRmsEnvelope(samples, sampleRate, { frameMs = DEFAULT_FRAME_MS, hopMs = DEFAULT_HOP_MS } = {}) {
  const frameSize = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const hopSize = Math.max(1, Math.round((sampleRate * hopMs) / 1000));
  const envelope = [];

  for (let start = 0; start < samples.length; start += hopSize) {
    const end = Math.min(samples.length, start + frameSize);
    if (end - start < Math.max(1, Math.floor(frameSize / 2))) {
      break;
    }
    envelope.push(rms(samples, start, end));
  }

  return {
    envelope,
    envelopeRateHz: 1000 / hopMs,
    frameMs,
    hopMs,
    durationSeconds: samples.length / sampleRate,
  };
}

function mean(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values, average = mean(values)) {
  if (!values.length) {
    return 0;
  }
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function normalizedCorrelation(reference, candidate) {
  const length = Math.min(reference.length, candidate.length);
  if (length < 2) {
    return 0;
  }

  const referenceSlice = reference.slice(0, length);
  const candidateSlice = candidate.slice(0, length);
  const referenceMean = mean(referenceSlice);
  const candidateMean = mean(candidateSlice);
  const referenceDeviation = standardDeviation(referenceSlice, referenceMean);
  const candidateDeviation = standardDeviation(candidateSlice, candidateMean);

  if (referenceDeviation <= Number.EPSILON || candidateDeviation <= Number.EPSILON) {
    return 0;
  }

  let covariance = 0;
  for (let index = 0; index < length; index += 1) {
    covariance += (referenceSlice[index] - referenceMean) * (candidateSlice[index] - candidateMean);
  }

  return covariance / (length * referenceDeviation * candidateDeviation);
}

function averageEnergy(values) {
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) : 0;
}

function sliceWithCoverage(values, start, length) {
  const requestedStart = Math.round(start);
  const requestedLength = Math.max(0, Math.round(length));
  const requestedEnd = requestedStart + requestedLength;
  const safeStart = Math.max(0, requestedStart);
  const end = Math.min(values.length, Math.max(safeStart, requestedEnd));
  return {
    values: values.slice(safeStart, end),
    coverage: requestedLength > 0 ? Math.max(0, (end - safeStart) / requestedLength) : 0,
  };
}

export function alignEnvelope(referenceEnvelope, captureEnvelope, { searchStepFrames = 1 } = {}) {
  const referenceLength = referenceEnvelope.length;
  const captureLength = captureEnvelope.length;
  if (referenceLength < 2 || captureLength < 2) {
    return {
      offsetFrames: null,
      referenceOffsetFrames: null,
      score: 0,
      overlapFrames: 0,
      coverage: 0,
    };
  }

  const step = Math.max(1, Math.round(searchStepFrames));
  if (captureLength < referenceLength) {
    const maxReferenceOffset = referenceLength - captureLength;
    let best = {
      offsetFrames: 0,
      referenceOffsetFrames: 0,
      score: -1,
      overlapFrames: captureLength,
      coverage: captureLength / referenceLength,
    };
    for (let referenceOffset = 0; referenceOffset <= maxReferenceOffset; referenceOffset += step) {
      const score = normalizedCorrelation(
        referenceEnvelope.slice(referenceOffset, referenceOffset + captureLength),
        captureEnvelope,
      );
      if (score > best.score) {
        best = {
          offsetFrames: 0,
          referenceOffsetFrames: referenceOffset,
          score,
          overlapFrames: captureLength,
          coverage: captureLength / referenceLength,
        };
      }
    }
    if (best.referenceOffsetFrames !== maxReferenceOffset && maxReferenceOffset % step !== 0) {
      const score = normalizedCorrelation(
        referenceEnvelope.slice(maxReferenceOffset, maxReferenceOffset + captureLength),
        captureEnvelope,
      );
      if (score > best.score) {
        best = {
          offsetFrames: 0,
          referenceOffsetFrames: maxReferenceOffset,
          score,
          overlapFrames: captureLength,
          coverage: captureLength / referenceLength,
        };
      }
    }
    return best;
  }

  const maxOffset = captureLength - referenceLength;
  let best = { offsetFrames: 0, score: -1, overlapFrames: referenceLength, coverage: 1 };
  for (let offset = 0; offset <= maxOffset; offset += step) {
    const score = normalizedCorrelation(referenceEnvelope, captureEnvelope.slice(offset, offset + referenceLength));
    if (score > best.score) {
      best = { offsetFrames: offset, score, overlapFrames: referenceLength, coverage: 1 };
    }
  }

  if (best.offsetFrames !== maxOffset && maxOffset % step !== 0) {
    const score = normalizedCorrelation(referenceEnvelope, captureEnvelope.slice(maxOffset, maxOffset + referenceLength));
    if (score > best.score) {
      best = { offsetFrames: maxOffset, score, overlapFrames: referenceLength, coverage: 1 };
    }
  }

  return { ...best, referenceOffsetFrames: 0 };
}

export function scoreAlignedCapture({
  alignment,
  captureEnvelope,
  closingAlignmentWindowMs = DEFAULT_CLOSING_ALIGNMENT_WINDOW_MS,
  envelopeRateHz,
  finalSpeechIntervalSeconds,
  referenceEnvelope,
}) {
  if (alignment.offsetFrames === null) {
    return {
      full: { score: 0, referenceEnergy: averageEnergy(referenceEnvelope), captureEnergy: 0, energyRatio: 0, coverage: 0 },
      closing: { score: 0, referenceEnergy: 0, captureEnergy: 0, energyRatio: 0, coverage: 0 },
    };
  }

  const alignedCapture = captureEnvelope.slice(
    alignment.offsetFrames,
    alignment.offsetFrames + alignment.overlapFrames,
  );
  const referenceOffsetFrames = alignment.referenceOffsetFrames || 0;
  const alignedReference = referenceEnvelope.slice(
    referenceOffsetFrames,
    referenceOffsetFrames + alignedCapture.length,
  );
  const fullReferenceEnergy = averageEnergy(alignedReference);
  const fullCaptureEnergy = averageEnergy(alignedCapture);
  const fullEnergyRatio = fullReferenceEnergy > 0 ? fullCaptureEnergy / fullReferenceEnergy : 0;

  const closingStartFrame = Math.max(0, Math.floor(finalSpeechIntervalSeconds.start * envelopeRateHz));
  const closingLengthFrames = Math.max(
    1,
    Math.ceil((finalSpeechIntervalSeconds.end - finalSpeechIntervalSeconds.start) * envelopeRateHz),
  );
  const referenceClosing = referenceEnvelope.slice(
    closingStartFrame,
    closingStartFrame + closingLengthFrames,
  );
  const captureClosing = sliceWithCoverage(
    captureEnvelope,
    alignment.offsetFrames + Math.max(0, closingStartFrame - referenceOffsetFrames),
    closingLengthFrames,
  );
  const predictedClosingStartFrame =
    alignment.offsetFrames + Math.max(0, closingStartFrame - referenceOffsetFrames);
  const closingSearchRadiusFrames = Math.max(
    0,
    Math.round((closingAlignmentWindowMs * envelopeRateHz) / 1000),
  );
  let localClosing = {
    startFrame: predictedClosingStartFrame,
    correlation: normalizedCorrelation(referenceClosing, captureClosing.values),
    coverage: captureClosing.coverage,
  };
  for (
    let candidateStart = predictedClosingStartFrame - closingSearchRadiusFrames;
    candidateStart <= predictedClosingStartFrame + closingSearchRadiusFrames;
    candidateStart += 1
  ) {
    const candidate = sliceWithCoverage(captureEnvelope, candidateStart, closingLengthFrames);
    const candidateCorrelation = normalizedCorrelation(referenceClosing, candidate.values);
    const candidateScore = candidateCorrelation * candidate.coverage;
    const localScore = localClosing.correlation * localClosing.coverage;
    const candidateDistance = Math.abs(candidateStart - predictedClosingStartFrame);
    const localDistance = Math.abs(localClosing.startFrame - predictedClosingStartFrame);
    if (
      candidateScore > localScore + 1e-6 ||
      (Math.abs(candidateScore - localScore) <= 1e-6 && candidateDistance < localDistance)
    ) {
      localClosing = {
        startFrame: candidateStart,
        correlation: candidateCorrelation,
        coverage: candidate.coverage,
      };
    }
  }
  const localClosingCapture = sliceWithCoverage(
    captureEnvelope,
    localClosing.startFrame,
    closingLengthFrames,
  );
  const closingReferenceEnergy = averageEnergy(referenceClosing);
  const closingCaptureEnergy = averageEnergy(localClosingCapture.values);
  const closingEnergyRatio = closingReferenceEnergy > 0
    ? closingCaptureEnergy / closingReferenceEnergy
    : 0;
  const gainNormalizedClosingEnergyRatio = fullEnergyRatio > Number.EPSILON
    ? closingEnergyRatio / fullEnergyRatio
    : 0;

  return {
    full: {
      score: alignment.score,
      referenceEnergy: fullReferenceEnergy,
      captureEnergy: fullCaptureEnergy,
      energyRatio: fullEnergyRatio,
      coverage: alignment.coverage,
    },
    closing: {
      score: localClosing.correlation * localClosing.coverage,
      rawCorrelation: localClosing.correlation,
      referenceEnergy: closingReferenceEnergy,
      captureEnergy: closingCaptureEnergy,
      energyRatio: closingEnergyRatio,
      gainNormalizedEnergyRatio: gainNormalizedClosingEnergyRatio,
      coverage: localClosing.coverage,
      alignment: {
        predictedStartFrame: predictedClosingStartFrame,
        localStartFrame: localClosing.startFrame,
        driftFrames: localClosing.startFrame - predictedClosingStartFrame,
        driftSeconds: (localClosing.startFrame - predictedClosingStartFrame) / envelopeRateHz,
        windowSeconds: closingAlignmentWindowMs / 1000,
      },
      referenceStartSeconds: finalSpeechIntervalSeconds.start,
      referenceEndSeconds: finalSpeechIntervalSeconds.end,
      captureStartSeconds: localClosing.startFrame / envelopeRateHz,
      captureEndSeconds: (localClosing.startFrame + localClosingCapture.values.length) / envelopeRateHz,
    },
  };
}

export function classifyCaptureResult({
  alignment,
  scores,
  minAlignmentCorrelation = DEFAULT_MIN_ALIGNMENT_CORRELATION,
  minClosingCorrelation = DEFAULT_MIN_CLOSING_CORRELATION,
  minClosingEnergyRatio = DEFAULT_MIN_CLOSING_ENERGY_RATIO,
  minCoverage = DEFAULT_MIN_COVERAGE,
  minMissingTailAlignmentCorrelation = DEFAULT_MIN_MISSING_TAIL_ALIGNMENT_CORRELATION,
}) {
  if (!alignment || alignment.offsetFrames === null) {
    return "inconclusive";
  }

  if (
    scores.closing.coverage < minCoverage ||
    scores.closing.score < minClosingCorrelation ||
    (scores.closing.gainNormalizedEnergyRatio ?? scores.closing.energyRatio) < minClosingEnergyRatio
  ) {
    return alignment.score >= minMissingTailAlignmentCorrelation
      ? "audible-tail-missing"
      : "inconclusive";
  }

  if (alignment.score < minAlignmentCorrelation) {
    return "inconclusive";
  }

  if (scores.full.coverage < minCoverage) {
    return "inconclusive";
  }

  return "complete";
}

function decodePcm(bytes) {
  const usableLength = bytes.byteLength - (bytes.byteLength % 2);
  const samples = new Float32Array(usableLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, usableLength);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768;
  }
  return samples;
}

export async function decodeMediaToMonoPcm(inputPath, {
  ffmpeg = process.env.FFMPEG_BIN || "ffmpeg",
  sampleRate = DEFAULT_SAMPLE_RATE,
  timeoutMs = 120_000,
} = {}) {
  const args = [
    "-nostdin",
    "-v",
    "error",
    "-i",
    inputPath,
    "-vn",
    "-af",
    "aresample=async=1:first_pts=0",
    "-ac",
    "1",
    "-ar",
    String(sampleRate),
    "-f",
    "s16le",
    "pipe:1",
  ];

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    const output = [];
    const errors = [];
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        rejectPromise(new Error(`ffmpeg decode timed out after ${timeoutMs} ms`));
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        rejectPromise(new Error(`Unable to execute ffmpeg '${ffmpeg}': ${error.message}`));
      }
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (settled) {
        return;
      }
      settled = true;
      if (code !== 0) {
        const detail = Buffer.concat(errors).toString("utf8").trim().slice(0, 500);
        rejectPromise(new Error(`ffmpeg exited with ${signal || `code ${code}`}${detail ? `: ${detail}` : ""}`));
        return;
      }
      const bytes = Buffer.concat(output);
      resolvePromise({
        sampleRate,
        samples: decodePcm(bytes),
        pcmBytes: bytes.byteLength,
      });
    });
  });
}

async function readJson(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

function buildOptions(raw) {
  return {
    ...DEFAULT_OPTIONS,
    frameMs: boundedNumber(raw["frame-ms"], DEFAULT_OPTIONS.frameMs, 5, 100),
    hopMs: boundedNumber(raw["hop-ms"], DEFAULT_OPTIONS.hopMs, 5, 100),
    minAlignmentCorrelation: boundedNumber(
      raw["min-alignment-correlation"],
      DEFAULT_OPTIONS.minAlignmentCorrelation,
      -1,
      1,
    ),
    minClosingCorrelation: boundedNumber(
      raw["min-closing-correlation"],
      DEFAULT_OPTIONS.minClosingCorrelation,
      -1,
      1,
    ),
    minClosingEnergyRatio: boundedNumber(
      raw["min-closing-energy-ratio"],
      DEFAULT_OPTIONS.minClosingEnergyRatio,
      0,
      10,
    ),
    minCoverage: boundedNumber(raw["min-coverage"], DEFAULT_OPTIONS.minCoverage, 0, 1),
    minMissingTailAlignmentCorrelation: boundedNumber(
      raw["min-missing-tail-alignment-correlation"],
      DEFAULT_OPTIONS.minMissingTailAlignmentCorrelation,
      -1,
      1,
    ),
    closingAlignmentWindowMs: boundedNumber(
      raw["closing-alignment-window-ms"],
      DEFAULT_OPTIONS.closingAlignmentWindowMs,
      0,
      5_000,
    ),
    sampleRate: Math.round(boundedNumber(raw["sample-rate"], DEFAULT_OPTIONS.sampleRate, 1_000, 48_000)),
    searchStepMs: boundedNumber(raw["search-step-ms"], DEFAULT_OPTIONS.searchStepMs, 5, 500),
  };
}

function usageError(message) {
  const error = new Error(message);
  error.code = "usage_error";
  return error;
}

export async function checkVoicePlaybackCapture({
  capturePath,
  ffmpeg,
  manifestPath,
  options: rawOptions = {},
  referencePath,
}) {
  if (!referencePath || !capturePath || !manifestPath) {
    throw usageError("--reference, --capture, and --manifest are required");
  }

  const options = buildOptions(rawOptions);
  const [referenceBytes, captureBytes, manifest] = await Promise.all([
    readFile(referencePath),
    readFile(capturePath),
    readJson(manifestPath),
  ]);
  const referenceHash = hashFileBytes(referenceBytes);
  const captureHash = hashFileBytes(captureBytes);
  const errors = [];

  if (manifest.payloadBytes !== referenceHash.bytes || manifest.sha256 !== referenceHash.sha256) {
    errors.push("reference does not match frozen fixture manifest");
  }

  const output = {
    schemaVersion: CHECKER_SCHEMA_VERSION,
    classification: "inconclusive",
    reference: {
      file: basename(referencePath),
      ...referenceHash,
      manifestSha256: manifest.sha256 || null,
      durationSeconds: manifest.durationSeconds ?? null,
    },
    capture: {
      file: basename(capturePath),
      ...captureHash,
      extension: extname(capturePath).toLowerCase() || null,
    },
    thresholds: options,
    errors,
  };

  if (errors.length) {
    return output;
  }

  let referenceDecoded;
  let captureDecoded;
  try {
    [referenceDecoded, captureDecoded] = await Promise.all([
      decodeMediaToMonoPcm(referencePath, { ffmpeg, sampleRate: options.sampleRate }),
      decodeMediaToMonoPcm(capturePath, { ffmpeg, sampleRate: options.sampleRate }),
    ]);
  } catch (error) {
    output.errors.push(error instanceof Error ? error.message : String(error));
    return output;
  }

  const referenceEnvelope = buildRmsEnvelope(referenceDecoded.samples, options.sampleRate, options);
  const captureEnvelope = buildRmsEnvelope(captureDecoded.samples, options.sampleRate, options);
  const alignment = alignEnvelope(referenceEnvelope.envelope, captureEnvelope.envelope, {
    searchStepFrames: Math.max(1, Math.round(options.searchStepMs / options.hopMs)),
  });
  const scores = scoreAlignedCapture({
    alignment,
    captureEnvelope: captureEnvelope.envelope,
    closingAlignmentWindowMs: options.closingAlignmentWindowMs,
    envelopeRateHz: referenceEnvelope.envelopeRateHz,
    finalSpeechIntervalSeconds: manifest.finalSpeechIntervalSeconds,
    referenceEnvelope: referenceEnvelope.envelope,
  });

  output.capture.decoded = {
    channelCount: 1,
    sampleRate: options.sampleRate,
    durationSeconds: captureDecoded.samples.length / options.sampleRate,
    pcmBytes: captureDecoded.pcmBytes,
  };
  output.reference.decoded = {
    channelCount: 1,
    sampleRate: options.sampleRate,
    durationSeconds: referenceDecoded.samples.length / options.sampleRate,
    pcmBytes: referenceDecoded.pcmBytes,
  };
  output.alignment = {
    ...alignment,
    offsetSeconds: alignment.offsetFrames === null
      ? null
      : alignment.offsetFrames / referenceEnvelope.envelopeRateHz,
    envelopeRateHz: referenceEnvelope.envelopeRateHz,
    method: "low-rate-rms-envelope-normalized-correlation",
  };
  output.full = scores.full;
  output.closing = scores.closing;
  output.classification = classifyCaptureResult({
    alignment,
    scores,
    minAlignmentCorrelation: options.minAlignmentCorrelation,
    minClosingCorrelation: options.minClosingCorrelation,
    minClosingEnergyRatio: options.minClosingEnergyRatio,
    minCoverage: options.minCoverage,
    minMissingTailAlignmentCorrelation: options.minMissingTailAlignmentCorrelation,
  });
  return output;
}

async function main() {
  const raw = parseArgs(process.argv.slice(2));
  const options = buildOptions(raw);
  const referencePath = raw.reference ? resolve(String(raw.reference)) : null;
  const capturePath = raw.capture ? resolve(String(raw.capture)) : null;
  const manifestPath = raw.manifest
    ? resolve(String(raw.manifest))
    : referencePath
      ? resolve(dirname(referencePath), "manifest.json")
      : null;

  try {
    const result = await checkVoicePlaybackCapture({
      capturePath,
      ffmpeg: raw.ffmpeg || process.env.FFMPEG_BIN,
      manifestPath,
      options: raw,
      referencePath,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.classification === "inconclusive" ? 2 : 0;
  } catch (error) {
    const result = {
      schemaVersion: CHECKER_SCHEMA_VERSION,
      classification: "inconclusive",
      errors: [error instanceof Error ? error.message : String(error)],
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = error?.code === "usage_error" ? 2 : 3;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
