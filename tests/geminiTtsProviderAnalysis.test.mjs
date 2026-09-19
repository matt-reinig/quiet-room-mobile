import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  analyzeGeminiProviderRun,
  phraseBooleans,
  wavFromPcm,
} from "../scripts/analyze-gemini-tts-provider-control.mjs";

const ENDING = "The final words are copper meadow nine.";
const MARKER = "Violet window thirteen.";

function asr(text, start = 6, end = 8) {
  return {
    tool: { name: "fake-faster-whisper", version: "test" },
    segments: [{ start, end, text }],
  };
}

function makePcm() {
  const samples = new Int16Array(24_000 * 10);
  for (let index = 0; index < samples.length; index += 1) {
    const inPreMarkerSilence = index >= 24_000 * 5.8 && index < 24_000 * 6;
    samples[index] = inPreMarkerSilence ? 0 : Math.round(Math.sin(index / 13) * 2_000);
  }
  return samples;
}

async function fixture({ tail = false, terminal = "completed" } = {}) {
  const run = await mkdtemp(join(tmpdir(), "gemini-provider-analysis-"));
  const wavPath = join(run, "response.wav");
  await writeFile(wavPath, wavFromPcm(makePcm(), 24_000));
  await writeFile(join(run, "manifest.json"), JSON.stringify({
    wav: "response.wav",
    terminal: terminal === "completed" ? { event_type: "interaction.completed", interaction: { status: "completed" } } : { event_type: "interaction.status_update", status: terminal },
    terminalOutcome: terminal === "completed" ? { outcome: "completed", completed: true } : { outcome: String(terminal).toLowerCase(), completed: false },
    acceptance: { ok: terminal === "completed", reason: terminal === "completed" ? null : String(terminal).toLowerCase() },
    mode: tail ? "tail-a" : "control",
    tailSeconds: 4,
  }));
  return run;
}

function makeAnalyzer({ tail = false, markerLeak = false, partialMarkerLeak = false, disagreement = false, endingMissing = false, terminal = "completed" } = {}) {
  return async (run, options = {}) => {
    const transcribe = async ({ outputPath, model, view }) => {
      let text = ENDING;
      if (tail || view === "tail") text = `${ENDING} ${MARKER}`;
      if (view === "trimmed") text = markerLeak ? `${ENDING} ${MARKER}` : partialMarkerLeak ? `${ENDING} violet` : ENDING;
      if (endingMissing) text = text.replace("copper", "amber");
      const onset = disagreement && model === "small.en" ? 7 : 6;
      const result = asr(text, view === "tail" ? onset - 6 : onset, view === "tail" ? onset - 5 : onset + 2);
      await writeFile(outputPath, JSON.stringify(result));
      return result;
    };
    const deriveTail = async ({ inputPath, outputPath }) => {
      const full = await readFile(inputPath);
      // 24 kHz mono 16-bit, four seconds plus the 44-byte WAV header.
      await writeFile(outputPath, Buffer.concat([full.subarray(0, 44), full.subarray(Math.max(44, full.length - 4 * 24_000 * 2))]));
    };
    return analyzeGeminiProviderRun(run, {
      ...options,
      transcribe,
      deriveTail,
      providerLib: options.providerLib || {
        findLowEnergyBoundary: (_samples, markerOnsetSample) => ({ boundarySample: markerOnsetSample - 2_000 }),
        trimPcmWithFade: (samples, markerOnsetSample) => ({ pcm: samples.slice(0, markerOnsetSample - 2_000), boundarySample: markerOnsetSample - 2_000 }),
      },
    });
  };
}

test("control analysis keeps transcript text private and requires both endings", async () => {
  const run = await fixture();
  const result = await makeAnalyzer()(run);
  assert.equal(result.classification, "complete", JSON.stringify({ failure: result.failure, error: result.error, trim: result.trim }));
  assert.equal(result.asr.full.length, 2);
  assert.equal(result.asr.full[0].ending.complete, true);
  const summary = JSON.parse(await readFile(join(run, ".analysis", "summary.json"), "utf8"));
  assert.equal(summary.classification, "complete");
  assert.equal(JSON.stringify(summary).includes(ENDING), false);
  assert.equal(JSON.stringify(summary).includes("rawTranscript"), true);
});

test("tail analysis agrees on marker, invokes boundary/fade helpers, and trims cleanly", async () => {
  const run = await fixture({ tail: true });
  const result = await makeAnalyzer({ tail: true })(run);
  assert.equal(result.classification, "complete");
  assert.equal(result.trim.markerLeak, false);
  assert.ok(result.trim.boundarySample > 0);
  assert.equal(result.asr.trimmed.length, 2);
});

test("tail analysis integrates with the default low-energy and fade helpers", async () => {
  const run = await fixture({ tail: true });
  const providerLib = await import("../scripts/gemini-tts-provider-lib.mjs");
  const result = await makeAnalyzer({ tail: true })(run, { providerLib });
  assert.equal(result.classification, "complete", JSON.stringify({ failure: result.failure, error: result.error, trim: result.trim }));
  assert.ok(result.trim.boundarySample > 0);
  assert.equal(result.trim.markerLeak, false);
});

test("tail marker disagreement fails closed as trim_uncertain", async () => {
  const run = await fixture({ tail: true });
  const result = await makeAnalyzer({ tail: true, disagreement: true })(run);
  assert.equal(result.classification, "trim_uncertain");
});

test("trimmed marker leakage is not accepted", async () => {
  const run = await fixture({ tail: true });
  const result = await makeAnalyzer({ tail: true, markerLeak: true })(run);
  assert.equal(result.classification, "marker_leak");
});

test("scattered, reordered, non-final endings and repeated markers fail lexical gates", () => {
  assert.equal(phraseBooleans("copper pause meadow nine").ending.complete, false);
  assert.equal(phraseBooleans("meadow copper nine").ending.complete, false);
  assert.equal(phraseBooleans("copper meadow nine followed by many unrelated trailing words here now").ending.finalRegion, false);
  assert.equal(phraseBooleans(`${ENDING} ${MARKER} ${MARKER}`).marker.complete, false);
});

test("a single leaked suffix token after trimming is rejected", async () => {
  const run = await fixture({ tail: true });
  const result = await makeAnalyzer({ tail: true, partialMarkerLeak: true })(run);
  assert.equal(result.classification, "marker_leak");
});

test("ending loss and non-completed provider terminal are distinct failures", async () => {
  const missingRun = await fixture();
  assert.equal((await makeAnalyzer({ endingMissing: true })(missingRun)).classification, "ending_missing");

  const failedRun = await fixture({ terminal: "OTHER" });
  const failed = await analyzeGeminiProviderRun(failedRun, {
    transcribe: async ({ outputPath }) => {
      const result = asr(ENDING);
      await writeFile(outputPath, JSON.stringify(result));
      return result;
    },
    deriveTail: async ({ inputPath, outputPath }) => writeFile(outputPath, await readFile(inputPath)),
    providerLib: {},
  });
  assert.equal(failed.classification, "provider_failed");
  assert.equal(failed.contentClassification, "complete");
  assert.equal(failed.asr.full.length, 2);
});
