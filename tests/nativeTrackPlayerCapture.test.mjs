import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  extractCaptureCorrelation,
  summarizeNativeCaptureDirectory,
} from "../scripts/collect-native-trackplayer-capture.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeRequest(directory, {
  attemptId = "attempt-one",
  body,
  position,
  runId = "run-one",
  sequence,
}) {
  const basename = `request-${String(sequence).padStart(3, "0")}-position-${position}`;
  await writeFile(path.join(directory, `${basename}.bin`), body);
  await writeFile(path.join(directory, `${basename}.json`), `${JSON.stringify({
    schemaVersion: "qr-mob-021.native-capture.v1",
    runId,
    attemptId,
    endpointMode: "live",
    requestSequence: sequence,
    httpMethod: "GET",
    position,
    requestedLength: -1,
    upstreamOpenLength: body.length,
    bytesCaptured: body.length,
    sha256: sha256(body),
    terminalState: "completed",
    eofObserved: true,
    openedAtElapsedRealtimeMs: 10,
    firstByteElapsedRealtimeMs: 11,
    lastByteElapsedRealtimeMs: 12,
    captureWriteDurationNs: 100,
    maxCaptureWriteDurationNs: 50,
    responseHeaderNames: ["content-type"],
    bodyFile: `${basename}.bin`,
    upstreamErrorClass: null,
    captureErrorClass: null,
  }, null, 2)}\n`);
}

test("extracts correlation from fixture and autoplay evidence", () => {
  assert.deepEqual(extractCaptureCorrelation({ correlation: { runId: "run-a", attemptId: "attempt-a" } }), {
    runId: "run-a",
    attemptId: "attempt-a",
  });
  assert.deepEqual(extractCaptureCorrelation({ attempts: [{ runId: "run-b", attemptId: "attempt-b" }] }), {
    runId: "run-b",
    attemptId: "attempt-b",
  });
  assert.throws(() => extractCaptureCorrelation({ correlation: { runId: "../unsafe", attemptId: "attempt" } }), /unsafe/);
});

test("verifies and reassembles separate native range requests", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "qr-mob-021-native-capture-"));
  try {
    await writeRequest(directory, { body: Buffer.from("abcdef"), position: 0, sequence: 1 });
    await writeRequest(directory, { body: Buffer.from("defghi"), position: 3, sequence: 2 });
    const summary = await summarizeNativeCaptureDirectory({
      attemptId: "attempt-one",
      captureDirectory: directory,
      expectedEndpoint: "live",
      expectedSha256: sha256(Buffer.from("abcdefghi")),
      runId: "run-one",
    });

    assert.equal(summary.requestCount, 2);
    assert.equal(summary.assertions.bodiesVerified, true);
    assert.equal(summary.assertions.expectedSourceMatched, true);
    assert.equal(summary.assertions.noByteConflicts, true);
    assert.equal(summary.assertions.noCoverageGaps, true);
    assert.equal(summary.assertions.sourceComparable, false);
    assert.equal(summary.reassembly.source.sha256, sha256(Buffer.from("abcdefghi")));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("marks one complete position-zero request as directly comparable", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "qr-mob-021-native-capture-comparable-"));
  try {
    const body = Buffer.from("complete-source");
    await writeRequest(directory, { body, position: 0, sequence: 1 });
    const summary = await summarizeNativeCaptureDirectory({
      attemptId: "attempt-one",
      captureDirectory: directory,
      expectedEndpoint: "live",
      expectedSha256: sha256(body),
      runId: "run-one",
    });

    assert.equal(summary.assertions.sourceComparable, true);
    assert.equal(summary.assertions.terminalCompletionObserved, true);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("rejects mismatched bodies and privacy-unsafe metadata", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "qr-mob-021-native-capture-bad-"));
  try {
    await mkdir(directory, { recursive: true });
    const body = Buffer.from("audio");
    await writeRequest(directory, { body, position: 0, sequence: 1 });
    const metadataPath = path.join(directory, "request-001-position-0.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.url = "https://private.example/path";
    metadata.sha256 = "wrong";
    await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`);

    const summary = await summarizeNativeCaptureDirectory({
      attemptId: "attempt-one",
      captureDirectory: directory,
      expectedEndpoint: "live",
      expectedSha256: null,
      runId: "run-one",
    });
    assert.equal(summary.assertions.bodiesVerified, false);
    assert.deepEqual(summary.requests[0].errors.sort(), [
      "body hash mismatch",
      "metadata contains a sensitive key",
    ]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
