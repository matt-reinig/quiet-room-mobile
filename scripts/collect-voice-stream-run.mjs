#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const DIAGNOSTIC_PREFIX = "QR_MOB_021_VOICE_DIAG ";
const SERVER_PREFIX = "[voice-fixture] ";
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJsonLine(line, marker) {
  const markerIndex = line.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(line.slice(markerIndex + marker.length));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseServerEvents(text) {
  return text
    .split(/\r?\n/)
    .map((line) => parseJsonLine(line, SERVER_PREFIX))
    .filter((event) => event?.event && event?.runId && event?.attemptId);
}

export function parseDiagnosticEvents(text) {
  return text
    .split(/\r?\n/)
    .map((line) => parseJsonLine(line, DIAGNOSTIC_PREFIX))
    .filter((event) => event?.prefix === "QR_MOB_021_VOICE_DIAG" && event?.runId);
}

async function readBoundedEvents(filePath, parser) {
  // Stream the log line-by-line and retain only structured diagnostic events;
  // this avoids copying a potentially large Detox/device log into the manifest.
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const events = [];
  for await (const line of lines) {
    const event = parser(line);
    if (event) {
      events.push(event);
    }
  }
  return events;
}

async function readOptionalEvents(filePath, parser) {
  try {
    return await readBoundedEvents(filePath, parser);
  } catch {
    return [];
  }
}

function relativePointer(root, value) {
  return value ? path.relative(root, value) || "." : null;
}

async function gitMetadata(root) {
  try {
    const { stdout: head } = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"]);
    const { stdout: status } = await execFileAsync(
      "git",
      ["-C", root, "status", "--porcelain", "--untracked-files=normal"],
    );
    return { dirty: Boolean(status.trim()), head: head.trim() };
  } catch {
    return { dirty: null, head: null };
  }
}

async function appMetadata(root) {
  try {
    const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const appJson = JSON.parse(await readFile(path.join(root, "app.json"), "utf8"));
    const expo = appJson.expo || {};
    const trackPlayer = String(packageJson.dependencies?.["react-native-track-player"] || "")
      .replace(/^[^0-9]*/, "") || null;
    return {
      packageVersion: packageJson.version || null,
      expoVersion: expo.version || null,
      iosBuildNumber: expo.ios?.buildNumber || null,
      androidVersionCode: expo.android?.versionCode || null,
      trackPlayerVersion: trackPlayer,
    };
  } catch {
    return {
      androidVersionCode: null,
      expoVersion: null,
      iosBuildNumber: null,
      packageVersion: null,
      trackPlayerVersion: null,
    };
  }
}

async function adbMetadata(serialHint) {
  let serial = serialHint || process.env.ANDROID_SERIAL || process.env.ADB_SERIAL || null;
  try {
    if (!serial) {
      const { stdout } = await execFileAsync("adb", ["devices"], { timeout: 5000 });
      serial = stdout
        .split(/\r?\n/)
        .map((line) => line.match(/^(\S+)\s+device$/)?.[1])
        .find((candidate) => candidate?.startsWith("emulator-")) || null;
    }
    if (!serial) {
      return { available: false, serial: null };
    }
    const { stdout } = await execFileAsync(
      "adb",
      ["-s", serial, "shell", "getprop"],
      { timeout: 5000, maxBuffer: 256 * 1024 },
    );
    const properties = Object.fromEntries(
      stdout
        .split(/\r?\n/)
        .map((line) => /^\[([^\]]+)\]: \[([^\]]*)\]$/.exec(line))
        .filter(Boolean)
        .map((match) => [match[1], match[2]]),
    );
    return {
      api: properties["ro.build.version.sdk"] || null,
      abi: properties["ro.product.cpu.abi"] || null,
      available: true,
      model: properties["ro.product.model"] || null,
      serial,
    };
  } catch {
    return { available: false, serial };
  }
}

async function findDetoxArtifacts(root, detoxConfig, runStartedAt, serverEvents = []) {
  const artifactsRoot = path.join(root, "artifacts");
  let entries;
  try {
    entries = await readdir(artifactsRoot, { withFileTypes: true });
  } catch {
    return { directory: null, detoxLog: null, deviceLog: null };
  }

  const startedMs = runStartedAt ? Date.parse(runStartedAt) : 0;
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${detoxConfig}.`)) {
      continue;
    }
    const directory = path.join(artifactsRoot, entry.name);
    const directoryStat = await stat(directory).catch(() => null);
    if (!directoryStat) {
      continue;
    }
    candidates.push({ directory, mtimeMs: directoryStat.mtimeMs, recent: directoryStat.mtimeMs >= startedMs - 5000 });
  }
  candidates.sort((left, right) => {
    if (left.recent !== right.recent) return left.recent ? -1 : 1;
    return right.mtimeMs - left.mtimeMs;
  });
  if (candidates.length === 0) {
    return { directory: null, detoxLog: null, deviceLog: null };
  }

  const serverRunIds = new Set(
    serverEvents
      .filter((event) => event.event === "request" && event.method === "GET")
      .map((event) => event.runId),
  );
  let fallback = null;
  async function findFiles(directory) {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await findFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  for (const candidate of candidates) {
    const files = await findFiles(candidate.directory).catch(() => []);
    const detoxLog = files.find((file) => path.basename(file) === "detox.log") || null;
    const deviceLogs = files.filter((file) => path.basename(file).endsWith("device.log"));
    let deviceLog = null;
    let deviceEvents = [];
    for (const deviceCandidate of deviceLogs) {
      const events = await readOptionalEvents(deviceCandidate, (line) => parseJsonLine(line, DIAGNOSTIC_PREFIX));
      if (events.length > 0) {
        deviceLog = deviceCandidate;
        deviceEvents = events;
        break;
      }
    }
    const artifact = { deviceLog, directory: candidate.directory, detoxLog };
    if (!fallback || candidate.recent) {
      fallback = artifact;
    }
    if (deviceEvents.some((event) => serverRunIds.has(event.runId))) {
      return artifact;
    }
  }
  return fallback || { directory: null, detoxLog: null, deviceLog: null };
}

export function chooseCorrelation(diagnosticEvents, fixtureCase) {
  const attempts = diagnosticEvents
    .filter((event) => event.event === "attempt.started" && event.attemptId)
    .filter((event) => !fixtureCase || event.fields?.fixtureCase === fixtureCase);
  const selected = attempts.at(-1) || diagnosticEvents.find((event) => event.attemptId);
  return selected ? { attemptId: selected.attemptId, runId: selected.runId } : { attemptId: null, runId: null };
}

export function summarizeServerEvents(events, correlation) {
  const correlated = events.filter(
    (event) =>
      event.runId === correlation.runId &&
      event.attemptId === correlation.attemptId,
  );
  const instances = [];
  let current = null;

  for (const event of correlated) {
    if (event.event === "request" && event.method === "GET") {
      current = { request: event, chunks: [], terminal: null };
      instances.push(current);
    } else if (current && event.event === "chunk") {
      current.chunks.push(event);
    } else if (current && event.event === "terminal") {
      current.terminal = event;
      current = null;
    }
  }

  const summarizeInstance = ({ request, chunks, terminal }) => {
    const firstChunk = chunks[0] || null;
    const finalChunk = chunks.at(-1) || null;
    return {
    request: request
      ? { case: request.case, method: request.method, runId: request.runId, attemptId: request.attemptId, wallTime: request.wallTime }
      : null,
    chunks: {
      count: chunks.length,
      bytes: finalChunk?.bytesWritten ?? 0,
      first: firstChunk ? { bytes: firstChunk.chunkBytes, elapsedMs: firstChunk.elapsedMs, wallTime: firstChunk.wallTime } : null,
      final: finalChunk ? { bytes: finalChunk.chunkBytes, elapsedMs: finalChunk.elapsedMs, wallTime: finalChunk.wallTime } : null,
    },
    terminal: terminal
      ? { bytesWritten: terminal.bytesWritten, chunksWritten: terminal.chunksWritten, elapsedMs: terminal.elapsedMs, status: terminal.status, wallTime: terminal.wallTime }
      : null,
    };
  };

  const requests = instances.map(summarizeInstance);
  const selected = requests[0] || summarizeInstance({ request: null, chunks: [], terminal: null });
  return { ...selected, requestCount: requests.length, requests };
}

export async function collectVoiceStreamRun({
  avdName = null,
  detoxArtifactDir = null,
  detoxConfig = null,
  detoxExitStatus = null,
  fixtureCase = "steady",
  fixtureManifestPath,
  fixturePath: fixturePathOverride,
  root = DEFAULT_ROOT,
  runStartedAt = null,
  serverLogPath,
  serial = null,
} = {}) {
  const manifestPath = fixtureManifestPath || path.join(root, "e2e/fixtures/voice-stream/manifest.json");
  const manifestRaw = await readFile(manifestPath, "utf8");
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    const lines = manifestRaw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    manifest = JSON.parse(lines.at(-1));
  }
  const fixturePath = fixturePathOverride
    ? path.resolve(fixturePathOverride)
    : manifest.fixtureFile
      ? path.resolve(path.dirname(manifestPath), manifest.fixtureFile)
      : null;
  if (!fixturePath) {
    throw new Error("fixture path is required when the manifest does not declare fixtureFile");
  }
  const fixtureBytes = await readFile(fixturePath);
  const serverEvents = serverLogPath ? await readOptionalEvents(serverLogPath, (line) => parseJsonLine(line, SERVER_PREFIX)) : [];
  const artifacts = detoxArtifactDir
    ? { directory: detoxArtifactDir, detoxLog: path.join(detoxArtifactDir, "detox.log"), deviceLog: null }
    : await findDetoxArtifacts(root, detoxConfig || "android.emu.release", runStartedAt, serverEvents);
  let diagnosticEvents = [];
  if (artifacts.deviceLog) {
    diagnosticEvents = await readOptionalEvents(artifacts.deviceLog, (line) => parseJsonLine(line, DIAGNOSTIC_PREFIX));
  }
  const correlation = chooseCorrelation(diagnosticEvents, fixtureCase);
  const runManifest = {
    schemaVersion: "qr-mob-021.run.v1",
    collectedAt: new Date().toISOString(),
    runStartedAt,
    fixture: {
      case: fixtureCase,
      bytes: manifest.payloadBytes ?? fixtureBytes.length,
      contentType: manifest.contentType || null,
      file: relativePointer(root, fixturePath),
      manifestFile: relativePointer(root, manifestPath),
      manifestSha256: sha256(await readFile(manifestPath)),
      sha256: manifest.sha256 || sha256(fixtureBytes),
    },
    runtime: {
      adb: await adbMetadata(serial),
      app: await appMetadata(root),
      avdName,
      detoxConfig,
      git: await gitMetadata(root),
    },
    detox: {
      artifactDirectory: relativePointer(root, artifacts.directory),
      deviceLog: relativePointer(root, artifacts.deviceLog),
      detoxLog: relativePointer(root, artifacts.detoxLog),
      exitStatus: detoxExitStatus,
      passed: detoxExitStatus === 0,
    },
    correlation,
    server: {
      log: relativePointer(root, serverLogPath),
      ...summarizeServerEvents(serverEvents, correlation),
    },
  };
  return runManifest;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    values.set(key, inlineValue ?? argv[++index]);
  }
  return values;
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.get("root") || DEFAULT_ROOT);
  const output = path.resolve(args.get("output") || path.join(root, "run-manifest.json"));
  const runManifest = await collectVoiceStreamRun({
    avdName: args.get("avd-name") || null,
    detoxConfig: args.get("detox-config") || null,
    detoxExitStatus: args.has("detox-status") ? Number(args.get("detox-status")) : null,
    fixtureCase: args.get("fixture-case") || "steady",
    fixtureManifestPath: args.get("fixture-manifest") ? path.resolve(args.get("fixture-manifest")) : undefined,
    fixturePath: args.get("fixture-path") ? path.resolve(args.get("fixture-path")) : undefined,
    root,
    runStartedAt: args.get("run-started-at") || null,
    serverLogPath: args.get("server-log") ? path.resolve(args.get("server-log")) : null,
    serial: args.get("serial") || null,
  });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(runManifest, null, 2)}\n`, "utf8");
  console.log(`QR-MOB-021 run manifest: ${output}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await runCli();
}
