import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assembleTrimmedPcmSegments,
  deriveConservativeFinalLexicalTokens,
  detectMarkerSourceCollision,
  normalizeAsrText,
  selectNonCollidingMarker,
  simulateSequentialGenerationConcurrentPlayback,
  splitPrivateSourceText,
  verifySegmentEndingAndMarkerSequence,
} from "../scripts/gemini-tts-segment-pipeline-lib.mjs";

function pcmFromSamples(samples) {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => pcm.writeInt16LE(sample, index * 2));
  return pcm;
}

test("splits at sentence and paragraph boundaries within configured bounds", () => {
  const source = "First sentence has enough words to make a useful bounded segment. Second sentence follows here.\n\nA new paragraph should remain a natural boundary. Final sentence closes it.";
  const segments = splitPrivateSourceText(source, { minChars: 20, targetChars: 70, maxChars: 95 });
  assert.ok(segments.length >= 2);
  assert.ok(segments.every((segment) => segment.charCount <= 95));
  assert.ok(segments.every((segment) => !Object.hasOwn(segment, "summary")));
  assert.equal(segments.map((segment) => segment.text).join(" ").replace(/\s+/gu, " "), source.replace(/\n+/gu, " "));
  assert.ok(segments.some((segment) => segment.paragraphIndex === 1));
});

test("hard-splits an oversized word without exceeding maxChars", () => {
  const segments = splitPrivateSourceText("abcdefghijklmnop", { minChars: 2, targetChars: 4, maxChars: 5 });
  assert.deepEqual(segments.map((segment) => segment.text), ["abcde", "fghij", "klmno", "p"]);
  assert.ok(segments.every((segment) => segment.charCount <= 5));
});

test("rejects invalid segment bounds and empty private source", () => {
  assert.throws(() => splitPrivateSourceText("hello", { minChars: 5, targetChars: 3, maxChars: 4 }), /minChars/);
  assert.throws(() => splitPrivateSourceText(" \n "), /empty/);
});

test("normalizes punctuation, apostrophes, hyphens, and spoken numbers", () => {
  assert.equal(normalizeAsrText("Twenty-one, COPPER—MEADOW! nine."), "21 copper meadow 9");
  assert.equal(normalizeAsrText("2,000 and one"), "2000 1");
  assert.deepEqual(deriveConservativeFinalLexicalTokens("The closing phrase is copper meadow nine."), ["copper", "meadow", "9"]);
});

test("derives only the conservative final lexical window", () => {
  assert.deepEqual(deriveConservativeFinalLexicalTokens({ text: "one two three four five" }, { finalTokenCount: 2 }), ["4", "5"]);
  assert.throws(() => deriveConservativeFinalLexicalTokens("text", { finalTokenCount: 0 }), /finalTokenCount/);
});

test("verifies each segment ending before its marker in order", () => {
  const expected = [
    { finalTokens: ["copper", "meadow", "9"], markerTokens: ["marker", "alpha"] },
    { finalTokens: ["quiet", "room", "10"], markerTokens: ["marker", "bravo"] },
  ];
  const observed = [
    { asrText: "copper meadow nine marker alpha" },
    { asrText: "quiet room ten marker bravo" },
  ];
  const result = verifySegmentEndingAndMarkerSequence(expected, observed);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "verified");
  assert.deepEqual(result.details.map((detail) => detail.markerStart), [3, 3]);
});

test("fails closed for missing ending, missing marker, and count mismatch", () => {
  const expected = [{ finalTokens: ["last", "word"], markerTokens: ["marker", "alpha"] }];
  assert.equal(verifySegmentEndingAndMarkerSequence(expected, [{ asrText: "last marker alpha" }]).outcome, "ending_missing");
  assert.equal(verifySegmentEndingAndMarkerSequence(expected, [{ asrText: "last word" }]).outcome, "marker_missing");
  assert.equal(verifySegmentEndingAndMarkerSequence(expected, []).outcome, "count_mismatch");
  assert.equal(verifySegmentEndingAndMarkerSequence(expected, [{ asrText: "marker alpha last word" }]).outcome, "marker_order_invalid");
});

test("detects marker vocabulary and ordered-sequence collisions without exposing text", () => {
  const collision = detectMarkerSourceCollision(
    "A violet window opens before the final sentence.",
    ["violet", "window", ["thirteen", "13"]],
  );
  assert.equal(collision.ok, true);
  assert.equal(collision.collides, true);
  assert.equal(collision.outcome, "collision");
  assert.equal(collision.sequenceCollision, false);
  assert.equal(collision.vocabularyCollisionCount, 2);
  assert.equal(Object.hasOwn(collision, "source"), false);
  assert.equal(Object.hasOwn(collision, "marker"), false);
  assert.equal(Object.hasOwn(collision, "tokens"), false);

  const sequence = detectMarkerSourceCollision("The phrase violet window thirteen is spoken.", "violet window thirteen");
  assert.equal(sequence.sequenceCollision, true);
  assert.equal(sequence.vocabularyCollisionCount, 3);
});

test("selects an explicit replacement and returns privacy-safe selection metadata", () => {
  const selection = selectNonCollidingMarker("The source contains violet.", [
    "violet window thirteen",
    "cobalt meadow seven",
  ]);
  assert.equal(selection.ok, true);
  assert.equal(selection.outcome, "replacement_selected");
  assert.deepEqual(selection.selectedMarkerTokens, "cobalt meadow seven");
  assert.equal(selection.metadata.selectedIndex, 1);
  assert.equal(selection.metadata.replacementSelected, true);
  assert.equal(selection.metadata.rejectedCount, 1);
  assert.equal(Object.hasOwn(selection.metadata, "source"), false);
  assert.equal(Object.hasOwn(selection.metadata, "marker"), false);
  assert.equal(JSON.stringify(selection.metadata).includes("violet"), false);
  assert.equal(JSON.stringify(selection.metadata).includes("cobalt"), false);
  const optionForm = selectNonCollidingMarker("The source contains violet.", {
    candidates: ["violet window thirteen", "cobalt meadow seven"],
  });
  assert.equal(optionForm.outcome, "replacement_selected");
  assert.deepEqual(optionForm.selectedMarkerTokens, "cobalt meadow seven");
});

test("does not invent a marker replacement when every explicit candidate collides", () => {
  const selection = selectNonCollidingMarker("violet cobalt", ["violet window", "cobalt meadow"]);
  assert.equal(selection.ok, false);
  assert.equal(selection.outcome, "no_non_colliding_candidate");
  assert.equal(selection.selectedMarkerTokens, null);
  assert.equal(selection.metadata.selectedIndex, null);
  assert.equal(selection.metadata.replacementSelected, false);
});

test("trims marker tails, natural silence, and preserves mono 24 kHz PCM", () => {
  const segmentA = pcmFromSamples([...Array(4).fill(0), ...Array(8).fill(8000), ...Array(4).fill(0), ...Array(3).fill(-4000)]);
  const segmentB = pcmFromSamples([...Array(4).fill(0), ...Array(8).fill(6000), ...Array(4).fill(0), ...Array(3).fill(500)]);
  const result = assembleTrimmedPcmSegments([
    { pcm: segmentA, markerStartSample: 16 },
    { pcm: segmentB, markerStartSample: 16 },
  ], { windowSamples: 2, searchBackSamples: 8, stepSamples: 1, maxRms: 0.01, fadeSamples: 1, maxNaturalSilenceSamples: 2 });
  assert.equal(result.sampleRate, 24000);
  assert.equal(result.channels, 1);
  assert.equal(result.bitsPerSample, 16);
  assert.equal(result.segmentCount, 2);
  assert.ok(result.sampleCount > 0);
  assert.equal(result.joins[0].overlapSamples, 0);
});

test("applies only a bounded optional crossfade", () => {
  const pcm = pcmFromSamples([...Array(20).fill(5000), ...Array(4).fill(0)]);
  const result = assembleTrimmedPcmSegments([
    { pcm, verified: true }, { pcm, verified: true },
  ], { trimNaturalSilence: false, crossfadeMs: 0.25, maxCrossfadeMs: 2, fadeSamples: 0 });
  assert.ok(result.joins[0].overlapSamples > 0);
  assert.throws(() => assembleTrimmedPcmSegments([{ pcm, verified: true }, { pcm, verified: true }], { trimNaturalSilence: false, crossfadeMs: 3, maxCrossfadeMs: 2 }), /bounded maximum/);
});

test("fails closed for unverified PCM without a defensible trim boundary", () => {
  const pcm = pcmFromSamples([1, 2, 3, 4]);
  assert.throws(() => assembleTrimmedPcmSegments([{ pcm }]), /unverified PCM/);
  assert.throws(() => assembleTrimmedPcmSegments([{ pcm, markerStartSample: 3 }], { maxRms: 0, windowSamples: 2 }), /low-energy/);
});

test("simulates sequential generation and concurrent playback", () => {
  const result = simulateSequentialGenerationConcurrentPlayback([
    { generationDurationMs: 100, durationMs: 500 },
    { generationDurationMs: 200, durationMs: 500 },
    { generationDurationMs: 300, durationMs: 500 },
  ], { verificationMs: 50 });
  assert.equal(result.ok, true);
  assert.equal(result.firstAudioLatencyMs, 150);
  assert.equal(result.gapsMs, 0);
  assert.equal(result.readyAheadMs, 500);
  assert.equal(result.totalDurationMs, 1650);
  assert.deepEqual(result.timeline.map((item) => item.playStartMs), [150, 650, 1150]);
  assert.deepEqual(result.timeline.map((item) => item.readyAtMs), [150, 350, 650]);
});

test("reports playback gaps and rejects incomplete timing inputs", () => {
  const result = simulateSequentialGenerationConcurrentPlayback([
    { generationDurationMs: 100, durationMs: 100 },
    { generationDurationMs: 500, durationMs: 100 },
  ], { verificationMs: 50 });
  assert.equal(result.gapsMs, 400);
  assert.deepEqual(result.gapsBySegment, [0, 400]);
  assert.equal(simulateSequentialGenerationConcurrentPlayback([{ durationMs: 10 }]).ok, false);
  assert.equal(simulateSequentialGenerationConcurrentPlayback([]).outcome, "invalid_input");
});

test("requires measured per-segment verification and reports ready/play timing", () => {
  const result = simulateSequentialGenerationConcurrentPlayback([
    { generationDurationMs: 100, verificationMs: 25, durationMs: 500 },
    { generationDurationMs: 200, verificationMs: 75, durationMs: 500 },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.timeline.map((item) => item.verificationMs), [25, 75]);
  assert.deepEqual(result.timeline.map((item) => item.readyAtMs), [125, 375]);
  assert.deepEqual(result.timeline.map((item) => item.playStartMs), [125, 625]);
  assert.deepEqual(result.timeline.map((item) => item.firstVerifiedAudibleAudioAtMs), [125, 625]);
  assert.equal(result.timeline[0].playWaitMs, 0);
  assert.equal(result.timeline[1].playWaitMs, 250);
  assert.equal(simulateSequentialGenerationConcurrentPlayback([
    { generationDurationMs: 100, durationMs: 500 },
  ]).ok, false);
});

test("accepts an explicitly measured verification vector for legacy callers", () => {
  const result = simulateSequentialGenerationConcurrentPlayback([
    { generationDurationMs: 100, durationMs: 100 },
    { generationDurationMs: 100, durationMs: 100 },
  ], { verificationMsBySegment: [10, 20] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.timeline.map((item) => item.readyAtMs), [110, 220]);
});
