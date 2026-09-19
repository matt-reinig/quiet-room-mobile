import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  analyzeGeminiTtsSegmentPipeline,
  crossfadePcm,
  findPhraseOnset,
  phrasePresence,
  tokenSequenceComparison,
} from "../scripts/analyze-gemini-tts-segment-pipeline.mjs";
import { wrapPcmInWav } from "../scripts/gemini-tts-provider-lib.mjs";

const ENDING = ["copper", "meadow", ["nine", "9"]];
const MARKER = ["violet", "window", ["thirteen", "13"]];

function samples() {
  const result = new Int16Array(24_000 * 10);
  for (let index = 0; index < result.length; index += 1) {
    // A quiet, deterministic boundary before the marker at eight seconds.
    result[index] = index >= 24_000 * 7.8 && index < 24_000 * 8 ? 0 : 1_500;
  }
  return result;
}

function words(text, markerAt = 8, marker = true) {
  const output = [
    { word: "copper", start: 6, end: 6.25 },
    { word: "meadow", start: 6.3, end: 6.55 },
    { word: "nine", start: 6.6, end: 6.8 },
  ];
  if (marker) output.push(
    { word: "violet", start: markerAt, end: markerAt + 0.2 },
    { word: "window", start: markerAt + 0.25, end: markerAt + 0.45 },
    { word: "thirteen", start: markerAt + 0.5, end: markerAt + 0.75 },
  );
  return { tool: { name: "fake-faster-whisper", version: "test" }, text, segments: [{ words: output }] };
}

async function fixture() {
  const run = await mkdtemp(join(tmpdir(), "gemini-segment-pipeline-"));
  const wav = wrapPcmInWav(Buffer.from(samples().buffer));
  await writeFile(join(run, "one.wav"), wav);
  await writeFile(join(run, "two.wav"), wav);
  await writeFile(join(run, "manifest.json"), JSON.stringify({
    markerTokens: MARKER,
    segments: [
      { wav: "one.wav", terminal: { event_type: "interaction.completed", interaction: { status: "completed" } }, terminalOutcome: { outcome: "completed", completed: true }, expectedEndingTokens: ENDING, timing: { startedAtMs: 0, endedAtMs: 1200 } },
      { wav: "two.wav", terminal: { event_type: "interaction.completed", interaction: { status: "completed" } }, terminalOutcome: { outcome: "completed", completed: true }, expectedEndingTokens: ENDING, timing: { startedAtMs: 1200, endedAtMs: 2400 } },
    ],
  }));
  return run;
}

function fakeIo({ disagree = false, markerLeak = false } = {}) {
  return {
    transcribe: async ({ outputPath, model, view }) => {
      const isTail = view === "tail";
      const isTrimmed = view === "trimmed" || view === "combined";
      const onset = disagree && model === "small.en" ? 8.9 : 8;
      const marker = !isTrimmed || markerLeak;
      const markerStart = isTail ? onset - 6 : onset;
      const baseText = view === "combined" ? "copper meadow nine copper meadow nine" : "copper meadow nine";
      const text = marker ? `${baseText} violet window thirteen` : baseText;
      const result = words(text, markerStart, marker);
      await writeFile(outputPath, JSON.stringify(result));
      return result;
    },
    deriveTail: async ({ inputPath, outputPath }) => {
      const source = await readFile(inputPath);
      const tailBytes = 4 * 24_000 * 2;
      await writeFile(outputPath, Buffer.concat([source.subarray(0, 44), source.subarray(source.length - tailBytes)]));
    },
  };
}

test("phrase presence accepts token alternatives without returning phrase text", () => {
  assert.equal(phrasePresence("copper meadow 9", ENDING).complete, true);
  assert.deepEqual(phrasePresence("copper meadow 9", ENDING).tokens, [true, true, true]);
  assert.equal(phrasePresence("copper meadow eight", ENDING).complete, false);
  assert.equal(phrasePresence("nine copper meadow", ENDING).complete, false);
  assert.equal(phrasePresence("copper meadow nine followed by many unrelated trailing words here now", ENDING).finalRegion, false);
  assert.equal(phrasePresence("copper meadow nine copper meadow nine", ENDING).complete, false);
});

test("full-source comparison is exact, ordered, normalized, and privacy-safe", () => {
  const exact = tokenSequenceComparison("A calm phrase, copper meadow 9.", "A calm phrase copper meadow nine");
  assert.equal(exact.exact, true);
  const trailing = tokenSequenceComparison("A calm phrase copper meadow nine violet window thirteen", "A calm phrase copper meadow nine");
  assert.equal(trailing.prefixExact, true);
  assert.equal(trailing.exact, false);
  assert.equal(trailing.trailingTokenCount, 3);
  const reordered = tokenSequenceComparison("A calm phrase meadow copper nine", "A calm phrase copper meadow nine");
  assert.equal(reordered.prefixExact, false);
  assert.equal(JSON.stringify(reordered).includes("copper"), false);
});

test("segment-level marker onset uses the containing segment, never transcript start", () => {
  const result = {
    text: "real source ending violet window thirteen",
    segments: [
      { text: "real source ending", start: 0, end: 8 },
      { text: "violet window thirteen", start: 8, end: 10 },
    ],
  };
  assert.deepEqual(findPhraseOnset(result, MARKER), { start: 8, end: 10, precision: "segment" });
  assert.equal(findPhraseOnset({ text: result.text, segments: [{ text: result.text, start: 0, end: 10 }] }, MARKER), null);
  assert.equal(findPhraseOnset({ text: result.text, segments: [{ text: "real source ending", start: 0, end: 10 }] }, MARKER), null);
});

test("analyzes every segment, trims marker, joins sanitized PCM, and keeps summary private", async () => {
  const run = await fixture();
  const result = await analyzeGeminiTtsSegmentPipeline(run, fakeIo());
  assert.equal(result.classification, "complete", JSON.stringify(result));
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments.every((segment) => segment.trim.markerLeak === false), true);
  assert.equal(result.pipeline.timing.metadataPresent, true);
  assert.ok(result.pipeline.output.bytes > 44);
  assert.equal(JSON.stringify(result).includes("copper meadow nine"), false);
  const persisted = JSON.parse(await readFile(join(run, ".analysis-segments", "summary.json"), "utf8"));
  assert.equal(JSON.stringify(persisted).includes("violet window thirteen"), false);
});

test("derives private ending tokens from ignored source files when runner summary omits them", async () => {
  const run = await fixture();
  await writeFile(join(run, "one.txt"), "copper meadow nine");
  await writeFile(join(run, "two.txt"), "copper meadow nine");
  const manifestPath = join(run, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.segments[0].expectedEndingTokens;
  delete manifest.segments[1].expectedEndingTokens;
  manifest.segments[0].sourceFile = "one.txt";
  manifest.segments[1].sourceFile = "two.txt";
  await writeFile(manifestPath, JSON.stringify(manifest));
  const result = await analyzeGeminiTtsSegmentPipeline(run, fakeIo());
  assert.equal(result.classification, "complete", JSON.stringify(result));
  assert.equal(JSON.stringify(result).includes("Private segment ending"), false);
});

test("full-source mismatch fails before trimming when a source fixture is present", async () => {
  const run = await fixture();
  await writeFile(join(run, "one.txt"), "a required prefix copper meadow nine");
  const manifestPath = join(run, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.segments[0].sourceFile = "one.txt";
  await writeFile(manifestPath, JSON.stringify(manifest));
  const result = await analyzeGeminiTtsSegmentPipeline(run, fakeIo());
  assert.equal(result.classification, "source_mismatch");
  assert.equal(result.failure, "recognizer_full_source_mismatch");
});

test("marker disagreement fails closed before sanitized output is assembled", async () => {
  const run = await fixture();
  const result = await analyzeGeminiTtsSegmentPipeline(run, { ...fakeIo({ disagree: true }), markerToleranceSeconds: 0.2 });
  assert.equal(result.classification, "trim_uncertain");
  assert.equal(result.failure, "marker_onset_disagreement");
  assert.equal(result.pipeline.output, undefined);
});

test("marker leakage after trim is a hard failure", async () => {
  const run = await fixture();
  const result = await analyzeGeminiTtsSegmentPipeline(run, fakeIo({ markerLeak: true }));
  assert.equal(result.classification, "marker_leak");
  assert.equal(result.failure, "marker_recovered_after_trim");
});

test("conflicting runner terminal outcome cannot be bypassed by a completed last event", async () => {
  const run = await fixture();
  const manifestPath = join(run, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.segments[0].terminal = { type: "interaction.completed", status: "completed" };
  manifest.segments[0].terminalOutcome = { outcome: "failed", completed: false };
  await writeFile(manifestPath, JSON.stringify(manifest));
  const result = await analyzeGeminiTtsSegmentPipeline(run, fakeIo());
  assert.equal(result.classification, "provider_failed");
  assert.equal(result.failure, "non_completed_terminal");
});

test("crossfade is deterministic and does not mutate inputs", () => {
  const left = Buffer.alloc(8); left.writeInt16LE(1000, 0); left.writeInt16LE(1000, 2); left.writeInt16LE(1000, 4); left.writeInt16LE(1000, 6);
  const right = Buffer.alloc(8); right.writeInt16LE(-1000, 0); right.writeInt16LE(-1000, 2); right.writeInt16LE(-1000, 4); right.writeInt16LE(-1000, 6);
  const output = crossfadePcm(left, right, 2);
  assert.equal(output.length, 12);
  assert.equal(left.readInt16LE(0), 1000);
  assert.equal(right.readInt16LE(0), -1000);
  assert.ok(output.readInt16LE(4) > -1000 && output.readInt16LE(4) < 1000);
});
