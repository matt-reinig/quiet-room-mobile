import assert from "node:assert/strict";
import test from "node:test";

import {
  alignEnvelope,
  buildRmsEnvelope,
  classifyCaptureResult,
  normalizedCorrelation,
  scoreAlignedCapture,
} from "../scripts/check-voice-playback-capture.mjs";

function makePulseEnvelope(length, pulses) {
  const result = new Array(length).fill(0.01);
  for (const [start, end, value] of pulses) {
    for (let index = start; index < end && index < result.length; index += 1) {
      result[index] = value;
    }
  }
  return result;
}

test("RMS envelope and normalized correlation preserve a deterministic closing pattern", () => {
  const samples = Float32Array.from({ length: 800, }, (_, index) =>
    index >= 400 ? Math.sin(index / 7) * 0.5 : 0,
  );
  const envelope = buildRmsEnvelope(samples, 8000, { frameMs: 20, hopMs: 20 });

  assert.equal(envelope.envelopeRateHz, 50);
  assert.ok(envelope.envelope.some((value) => value > 0.2));
  assert.ok(normalizedCorrelation([0, 1, 0, 1], [0, 2, 0, 2]) > 0.99);
});

test("alignment finds the reference inside a longer capture", () => {
  const reference = makePulseEnvelope(80, [
    [5, 16, 0.5],
    [25, 38, 0.8],
    [52, 76, 0.35],
  ]);
  const capture = [
    ...new Array(23).fill(0),
    ...reference.map((value, index) => value * (index % 3 === 0 ? 1.1 : 0.95)),
    ...new Array(17).fill(0),
  ];
  const alignment = alignEnvelope(reference, capture);

  assert.equal(alignment.offsetFrames, 23);
  assert.ok(alignment.score > 0.98);
  assert.equal(alignment.coverage, 1);
});

test("closing score and coverage conservatively classify a missing tail", () => {
  const reference = makePulseEnvelope(100, [
    [10, 30, 0.5],
    [42, 64, 0.7],
    [80, 90, 0.4],
    [90, 100, 0.8],
  ]);
  const completeCapture = [...new Array(12).fill(0), ...reference, ...new Array(10).fill(0)];
  const truncatedCapture = completeCapture.slice(0, 12 + 88);
  const alignment = alignEnvelope(reference, completeCapture);
  const completeScores = scoreAlignedCapture({
    alignment,
    captureEnvelope: completeCapture,
    envelopeRateHz: 50,
    finalSpeechIntervalSeconds: { start: 1.6, end: 2.0 },
    referenceEnvelope: reference,
  });
  const truncatedScores = scoreAlignedCapture({
    alignment,
    captureEnvelope: truncatedCapture,
    envelopeRateHz: 50,
    finalSpeechIntervalSeconds: { start: 1.6, end: 2.0 },
    referenceEnvelope: reference,
  });

  assert.equal(
    classifyCaptureResult({ alignment, scores: completeScores }),
    "complete",
  );
  assert.equal(
    classifyCaptureResult({ alignment, scores: truncatedScores }),
    "audible-tail-missing",
  );
  assert.ok(truncatedScores.closing.coverage < 1);
});

test("closing energy classification is invariant to capture gain", () => {
  const reference = makePulseEnvelope(100, [
    [10, 30, 0.5],
    [42, 64, 0.7],
    [80, 90, 0.4],
    [90, 100, 0.8],
  ]);
  const capture = [...new Array(12).fill(0), ...reference.map((value) => value * 0.023), ...new Array(10).fill(0)];
  const alignment = alignEnvelope(reference, capture);
  const scores = scoreAlignedCapture({
    alignment,
    captureEnvelope: capture,
    envelopeRateHz: 50,
    finalSpeechIntervalSeconds: { start: 1.6, end: 2.0 },
    referenceEnvelope: reference,
  });

  assert.ok(scores.full.energyRatio < 0.03);
  assert.ok(scores.closing.energyRatio < 0.03);
  assert.ok(scores.closing.gainNormalizedEnergyRatio > 0.99);
  assert.equal(classifyCaptureResult({ alignment, scores }), "complete");
});

test("a capture ending before the manifest interval is classified as a missing tail", () => {
  const reference = makePulseEnvelope(100, [
    [10, 30, 0.5],
    [42, 64, 0.7],
    [80, 90, 0.4],
    [90, 100, 0.8],
  ]);
  const truncatedCapture = reference.slice(0, 88);
  const alignment = alignEnvelope(reference, truncatedCapture);
  const scores = scoreAlignedCapture({
    alignment,
    captureEnvelope: truncatedCapture,
    envelopeRateHz: 50,
    finalSpeechIntervalSeconds: { start: 1.6, end: 2.0 },
    referenceEnvelope: reference,
  });

  assert.equal(alignment.referenceOffsetFrames, 0);
  assert.ok(alignment.score > 0.99);
  assert.equal(classifyCaptureResult({ alignment, scores }), "audible-tail-missing");
  assert.ok(scores.closing.coverage < 1);
});

test("weak or absent alignment remains inconclusive", () => {
  const reference = makePulseEnvelope(60, [[20, 40, 0.8]]);
  const capture = makePulseEnvelope(60, [[0, 10, 0.8]]);
  const alignment = alignEnvelope(reference, capture);
  const scores = {
    full: { coverage: 1 },
    closing: { coverage: 1, score: 1, energyRatio: 1 },
  };

  assert.equal(alignment.offsetFrames, 0);
  assert.equal(
    classifyCaptureResult({ alignment: { ...alignment, score: 0.2 }, scores }),
    "inconclusive",
  );
  assert.equal(
    classifyCaptureResult({ alignment: { offsetFrames: null, score: 0 }, scores }),
    "inconclusive",
  );
});
