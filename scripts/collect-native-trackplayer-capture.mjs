#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const SAFE_PACKAGE = /^[A-Za-z][A-Za-z0-9_.]{2,127}$/;
const SAFE_CAPTURE_FILE = /^request-[0-9]{3}-position-[0-9]+\.(?:json|bin|bin\.partial)$/;
const SENSITIVE_KEY = /authorization|cookie|token|secret|password|api[_-]?key|uri|url|requestheaders/i;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    args.set(key, inlineValue ?? argv[++index]);
  }
  return args;
}

function assertSafeCorrelation(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new Error(`${label} is missing or unsafe`);
  }
  return value;
}

function containsSensitiveKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) =>
    SENSITIVE_KEY.test(key) || containsSensitiveKey(nested),
  );
}

export function extractCaptureCorrelation(evidence) {
  const candidate = evidence?.correlation || evidence?.attempts?.[0] || null;
  return {
    attemptId: assertSafeCorrelation(candidate?.attemptId, "attemptId"),
    runId: assertSafeCorrelation(candidate?.runId, "runId"),
  };
}

async function hashFile(filePath) {
  const bytes = await readFile(filePath);
  return { bytes: bytes.length, data: bytes, sha256: sha256(bytes) };
}

function buildReassembledSource(requests) {
  const usable = requests.filter((request) => request.body?.data?.length > 0 && request.position >= 0);
  const sourceBytes = usable.reduce(
    (maximum, request) => Math.max(maximum, request.position + request.body.data.length),
    0,
  );
  if (sourceBytes === 0) {
    return { bytes: null, conflicts: 0, gaps: 0 };
  }

  const output = Buffer.alloc(sourceBytes);
  const coverage = new Uint8Array(sourceBytes);
  let conflicts = 0;
  for (const request of usable.sort((left, right) => left.requestSequence - right.requestSequence)) {
    for (let index = 0; index < request.body.data.length; index += 1) {
      const position = request.position + index;
      const value = request.body.data[index];
      if (coverage[position] && output[position] !== value) {
        conflicts += 1;
      } else if (!coverage[position]) {
        output[position] = value;
        coverage[position] = 1;
      }
    }
  }

  let gaps = 0;
  for (const covered of coverage) {
    if (!covered) gaps += 1;
  }
  return { bytes: output, conflicts, gaps };
}

export async function summarizeNativeCaptureDirectory({
  attemptId,
  captureDirectory,
  expectedEndpoint,
  expectedSha256,
  runId,
}) {
  const entries = await readdir(captureDirectory, { withFileTypes: true });
  const metadataFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  const requests = [];

  for (const metadataName of metadataFiles) {
    const metadataPath = path.join(captureDirectory, metadataName);
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    const errors = [];
    if (containsSensitiveKey(metadata)) errors.push("metadata contains a sensitive key");
    if (metadata.schemaVersion !== "qr-mob-021.native-capture.v1") errors.push("unexpected schema");
    if (metadata.runId !== runId || metadata.attemptId !== attemptId) errors.push("correlation mismatch");
    if (expectedEndpoint && metadata.endpointMode !== expectedEndpoint) errors.push("endpoint mismatch");
    if (!Number.isInteger(metadata.requestSequence) || metadata.requestSequence < 1) errors.push("invalid sequence");
    if (!Number.isInteger(metadata.position) || metadata.position < 0) errors.push("invalid position");
    if (metadata.captureErrorClass) errors.push("capture write failed");

    let body = null;
    if (typeof metadata.bodyFile !== "string" || !SAFE_CAPTURE_FILE.test(metadata.bodyFile)) {
      errors.push("body file is missing or unsafe");
    } else {
      const bodyPath = path.join(captureDirectory, metadata.bodyFile);
      const bodyStat = await stat(bodyPath).catch(() => null);
      if (!bodyStat?.isFile()) {
        errors.push("body file is absent");
      } else {
        body = await hashFile(bodyPath);
        if (body.bytes !== metadata.bytesCaptured) errors.push("body byte count mismatch");
        if (body.sha256 !== metadata.sha256) errors.push("body hash mismatch");
      }
    }

    requests.push({
      body,
      bodyFile: metadata.bodyFile || null,
      bytesCaptured: metadata.bytesCaptured,
      captureErrorClass: metadata.captureErrorClass,
      captureWriteDurationNs: metadata.captureWriteDurationNs,
      endpointMode: metadata.endpointMode,
      eofObserved: metadata.eofObserved,
      errors,
      firstByteElapsedRealtimeMs: metadata.firstByteElapsedRealtimeMs,
      lastByteElapsedRealtimeMs: metadata.lastByteElapsedRealtimeMs,
      maxCaptureWriteDurationNs: metadata.maxCaptureWriteDurationNs,
      openedAtElapsedRealtimeMs: metadata.openedAtElapsedRealtimeMs,
      position: metadata.position,
      requestSequence: metadata.requestSequence,
      requestedLength: metadata.requestedLength,
      responseHeaderNames: metadata.responseHeaderNames,
      terminalState: metadata.terminalState,
      upstreamErrorClass: metadata.upstreamErrorClass,
      upstreamOpenLength: metadata.upstreamOpenLength,
    });
  }

  const sequenceValues = requests.map((request) => request.requestSequence);
  const uniqueSequences = new Set(sequenceValues);
  const reassembled = buildReassembledSource(requests);
  const sourcePath = path.join(captureDirectory, "reassembled-source.bin");
  const source = reassembled.bytes && reassembled.gaps === 0 && reassembled.conflicts === 0
    ? {
        bytes: reassembled.bytes.length,
        file: path.basename(sourcePath),
        sha256: sha256(reassembled.bytes),
      }
    : null;
  if (source) {
    await writeFile(sourcePath, reassembled.bytes);
  }

  const onePositionZeroRequest =
    requests.length === 1 && requests[0].position === 0 && requests[0].errors.length === 0;
  const terminalCompletionObserved = requests.some(
    (request) =>
      request.terminalState === "completed" &&
      (request.eofObserved === true ||
        (request.upstreamOpenLength >= 0 && request.bytesCaptured >= request.upstreamOpenLength)),
  );
  const expectedSourceMatched = expectedSha256 ? source?.sha256 === expectedSha256 : null;
  const sourceComparable =
    onePositionZeroRequest && (terminalCompletionObserved || expectedSourceMatched === true);
  const assertions = {
    bodiesVerified: requests.length > 0 && requests.every((request) => request.body && request.errors.length === 0),
    correlationMatched: requests.length > 0 && requests.every((request) => request.errors.every((error) => error !== "correlation mismatch")),
    endpointMatched: requests.length > 0 && requests.every((request) => request.errors.every((error) => error !== "endpoint mismatch")),
    expectedSourceMatched,
    noByteConflicts: reassembled.conflicts === 0,
    noCoverageGaps: reassembled.gaps === 0,
    requestSequencesUnique: uniqueSequences.size === sequenceValues.length,
    sourceComparable,
    sourceReassembled: Boolean(source),
    terminalCompletionObserved,
  };

  return {
    assertions,
    attemptId,
    comparisonClassification: sourceComparable
      ? "direct"
      : onePositionZeroRequest && source
        ? "observed-bytes-only"
        : "not-comparable",
    requestCount: requests.length,
    requests: requests.map(({ body, ...request }) => ({
      ...request,
      body: body ? { bytes: body.bytes, sha256: body.sha256 } : null,
    })),
    reassembly: {
      conflicts: reassembled.conflicts,
      gaps: reassembled.gaps,
      source,
    },
    runId,
    schemaVersion: "qr-mob-021.native-capture-summary.v1",
  };
}

async function pullCaptureFiles({ adb, attemptId, outputDirectory, packageName, runId, serial }) {
  const remoteDirectory = `/sdcard/Android/data/${packageName}/files/qr-mob-021-native-captures/${runId}/${attemptId}`;
  const { stdout } = await execFileAsync(adb, ["-s", serial, "shell", "ls", "-1", remoteDirectory], {
    maxBuffer: 1024 * 1024,
    timeout: 15000,
  });
  const files = stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (files.length === 0 || files.some((file) => !SAFE_CAPTURE_FILE.test(file))) {
    throw new Error("native capture directory is empty or contains an unsafe file name");
  }

  await mkdir(outputDirectory, { recursive: true });
  for (const file of files) {
    await execFileAsync(adb, [
      "-s",
      serial,
      "pull",
      `${remoteDirectory}/${file}`,
      path.join(outputDirectory, file),
    ], { maxBuffer: 1024 * 1024, timeout: 60000 });
  }
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.get("root") || DEFAULT_ROOT);
  const evidencePath = path.resolve(args.get("evidence") || "");
  const outputDirectory = path.resolve(args.get("output-dir") || path.join(root, "artifacts/qr-mob-021/native-capture"));
  const summaryPath = path.resolve(args.get("summary") || path.join(outputDirectory, "native-capture-summary.json"));
  const serial = args.get("serial") || process.env.ANDROID_SERIAL;
  const packageName = args.get("package") || "com.quietroom.mobile.qa";
  if (!evidencePath || !serial || !SAFE_PACKAGE.test(packageName)) {
    throw new Error("--evidence, --serial, and a safe --package are required");
  }

  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const correlation = extractCaptureCorrelation(evidence);
  await pullCaptureFiles({
    adb: args.get("adb") || "adb",
    ...correlation,
    outputDirectory,
    packageName,
    serial,
  });
  const summary = await summarizeNativeCaptureDirectory({
    ...correlation,
    captureDirectory: outputDirectory,
    expectedEndpoint: args.get("expected-endpoint") || null,
    expectedSha256: args.get("expected-sha256") || null,
  });
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`QR-MOB-021 native capture summary: ${summaryPath}`);

  if (args.has("strict")) {
    const required = [
      "bodiesVerified",
      "correlationMatched",
      "endpointMatched",
      "noByteConflicts",
      "noCoverageGaps",
      "requestSequencesUnique",
      "sourceReassembled",
    ];
    if (args.get("expected-sha256")) required.push("expectedSourceMatched");
    if (required.some((name) => summary.assertions[name] !== true)) {
      process.exitCode = 4;
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await runCli().catch((error) => {
    console.error(`QR-MOB-021 native capture collection failed: ${error.message}`);
    process.exitCode = 3;
  });
}
