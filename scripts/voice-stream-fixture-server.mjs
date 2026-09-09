#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const MAX_REQUEST_DURATION_MS = 120_000;
export const DEFAULT_FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../e2e/fixtures/voice-stream/closing-phrase-v1.mp3",
);
const DEFAULT_MANIFEST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../e2e/fixtures/voice-stream/manifest.json",
);

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 0;
const DEFAULT_CONTENT_TYPE = "audio/mpeg";
const DEFAULT_TAIL_DELAY_MS = 750;
const DEFAULT_EOF_DELAY_MS = 750;
// Keep the default transfer open long enough for the native player to begin
// consuming audio before the final bytes arrive on a typical emulator.
const DEFAULT_CHUNK_DELAY_MS = 250;
const DEFAULT_FINAL_CHUNK_SIZES = {
  "schedule-a": 4096,
  "schedule-b": 12288,
};
const VALID_CASES = new Set([
  "complete-file",
  "complete-file-control",
  "steady",
  "delayed-tail",
  "delayed-tail-250",
  "delayed-tail-750",
  "delayed-tail-1500",
  "chunk-schedule",
  "chunk-schedule-a",
  "chunk-schedule-b",
  "normal-eof",
  "normal-eof-immediate",
  "normal-eof-delayed",
  "truncated",
]);

function asPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function asNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function boundedId(value, fallback) {
  const normalized = String(value ?? "").trim().replace(/[^A-Za-z0-9._:-]/g, "_");
  return normalized.slice(0, 128) || fallback;
}

function createFixtureHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function splitWithFinalSize(bytes, finalSize, pattern) {
  const safeFinalSize = Math.min(Math.max(1, finalSize), Math.max(1, bytes.length - 1));
  const chunks = [];
  let offset = 0;
  let patternIndex = 0;

  while (bytes.length - offset > safeFinalSize) {
    const remainingBeforeFinalChunk = bytes.length - offset - safeFinalSize;
    const requestedSize = pattern[patternIndex % pattern.length];
    const size = Math.min(requestedSize, remainingBeforeFinalChunk);
    chunks.push(bytes.subarray(offset, offset + size));
    offset += size;
    patternIndex += 1;
  }

  chunks.push(bytes.subarray(offset));
  return chunks;
}

function chunksForCase(bytes, fixture, query) {
  const requestedCase = query.get("fixture_case") || query.get("case") || "steady";
  const chunkDelayMs = asNonNegativeInteger(query.get("chunk_delay_ms"), DEFAULT_CHUNK_DELAY_MS);
  const caseName = requestedCase
    .replace(/^delayed-tail-(250|750|1500)$/, "delayed-tail")
    .replace(/^chunk-schedule-(a|b)$/, "chunk-schedule")
    .replace(/^normal-eof-(immediate|delayed)$/, "normal-eof");

  if (!VALID_CASES.has(requestedCase)) {
    throw new Error(`Unknown fixture case: ${requestedCase}`);
  }

  if (caseName === "complete-file" || caseName === "complete-file-control") {
    return { chunks: [bytes], chunkDelayMs: 0, delayBeforeTailMs: 0, progressive: false };
  }

  if (caseName === "delayed-tail") {
    const aliasDelay = requestedCase.match(/^delayed-tail-(250|750|1500)$/)?.[1];
    const delayMs = asNonNegativeInteger(
      query.get("delay_ms"),
      aliasDelay ? Number.parseInt(aliasDelay, 10) : DEFAULT_TAIL_DELAY_MS,
    );
    const tailLength = Math.min(fixture.tailBytes, Math.max(1, bytes.length - 1));
    return {
      chunks: [
        ...splitWithFinalSize(
          bytes.subarray(0, bytes.length - tailLength),
          8192,
          [8192, 12288, 16384],
        ),
        bytes.subarray(bytes.length - tailLength),
      ],
      chunkDelayMs,
      delayBeforeTailMs: delayMs,
      progressive: true,
    };
  }

  if (caseName === "chunk-schedule") {
    const aliasSchedule = requestedCase.match(/^chunk-schedule-(a|b)$/)?.[1];
    const schedule = query.get("schedule") || (aliasSchedule ? `schedule-${aliasSchedule}` : "schedule-a");
    const finalSize = asPositiveInteger(
      query.get("final_chunk_size"),
      DEFAULT_FINAL_CHUNK_SIZES[schedule] || DEFAULT_FINAL_CHUNK_SIZES["schedule-a"],
    );
    const pattern = schedule === "schedule-b"
      ? [12288, 4096, 20480, 8192]
      : [8192, 16384, 4096, 12288];
    return {
      chunks: splitWithFinalSize(bytes, finalSize, pattern),
      chunkDelayMs,
      delayBeforeTailMs: 0,
      progressive: true,
    };
  }

  if (caseName === "truncated") {
    const requestedTailBytes = asPositiveInteger(query.get("truncate_bytes"), fixture.tailBytes);
    const truncateBytes = Math.min(requestedTailBytes, Math.max(1, bytes.length - 1));
    const truncatedBytes = bytes.subarray(0, bytes.length - truncateBytes);
    return {
      chunks: splitWithFinalSize(truncatedBytes, 8192, [8192, 12288, 16384]),
      chunkDelayMs,
      delayBeforeTailMs: 0,
      progressive: true,
      truncated: true,
      truncatedBytes: bytes.length - truncatedBytes.length,
    };
  }

  const chunks = splitWithFinalSize(bytes, 8192, [8192, 12288, 16384, 4096]);
  const eofDelayMs =
    caseName === "normal-eof"
      ? asNonNegativeInteger(
          query.get("eof_delay_ms"),
          requestedCase === "normal-eof-delayed" ? DEFAULT_EOF_DELAY_MS : 0,
        )
      : 0;
  return { chunks, chunkDelayMs, delayBeforeTailMs: 0, eofDelayMs, progressive: true };
}

function parseSingleRange(value, length) {
  if (!value) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) {
    return { invalid: true };
  }

  let start;
  let end;
  if (match[1]) {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : length - 1;
  } else {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return { invalid: true };
    }
    start = Math.max(0, length - suffixLength);
    end = length - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= length
  ) {
    return { invalid: true };
  }

  return { end: Math.min(end, length - 1), start };
}

function createRequestEvent(context, type, extra = {}) {
  return {
    attemptId: context.attemptId,
    case: context.caseName,
    event: type,
    fixtureSha256: context.fixture.sha256,
    runId: context.runId,
    elapsedMs: Math.round(performance.now() - context.startedAt),
    wallTime: new Date().toISOString(),
    ...extra,
  };
}

export async function loadFixture(
  fixturePath = DEFAULT_FIXTURE_PATH,
  manifestPath = DEFAULT_MANIFEST_PATH,
) {
  const [bytes, manifestRaw] = await Promise.all([
    readFile(fixturePath),
    readFile(manifestPath, "utf8"),
  ]);
  const manifest = JSON.parse(manifestRaw);
  const sha256 = createFixtureHash(bytes);
  if (bytes.length !== manifest.payloadBytes || sha256 !== manifest.sha256) {
    throw new Error("Frozen voice fixture does not match its manifest.");
  }

  return {
    bytes,
    closingPhrase: manifest.closingPhrase,
    contentType: manifest.contentType,
    durationSeconds: manifest.durationSeconds,
    manifest,
    path: fixturePath,
    sha256,
    tailBytes: manifest.tailBytes,
  };
}

export async function startVoiceFixtureServer({
  fixturePath = DEFAULT_FIXTURE_PATH,
  host = DEFAULT_HOST,
  logger = console,
  port = DEFAULT_PORT,
} = {}) {
  const fixture = await loadFixture(fixturePath);
  const events = [];

  function emit(event) {
    events.push(event);
    if (typeof logger?.info === "function") {
      logger.info(`[voice-fixture] ${JSON.stringify(event)}`);
    }
  }

  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "fixture_server_error" }));
      } else if (!response.writableEnded) {
        response.destroy(error);
      }
    });
  });

  async function handleRequest(request, response) {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || host}`);
    const runId = boundedId(requestUrl.searchParams.get("run_id"), "run-unknown");
    const attemptId = boundedId(requestUrl.searchParams.get("attempt_id"), `attempt-${Date.now()}`);
    const caseName = requestUrl.searchParams.get("fixture_case") || requestUrl.searchParams.get("case") || "steady";
    const context = { attemptId, caseName, fixture, runId, startedAt: performance.now() };
    let terminal = false;
    let bytesWritten = 0;
    let chunksWritten = 0;
    let timeoutId;
    const timers = new Map();

    const finishTerminal = (terminalStatus, extra = {}) => {
      if (terminal) {
        return;
      }
      terminal = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      for (const { id, reject } of timers.values()) {
        clearTimeout(id);
        reject(new Error("request_closed"));
      }
      timers.clear();
      emit(
        createRequestEvent(context, "terminal", {
          bytesWritten,
          chunksWritten,
          status: terminalStatus,
          ...extra,
        }),
      );
    };

    const delay = (milliseconds) => {
      if (milliseconds <= 0) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, milliseconds);
        timers.set(id, { id, reject });
      });
    };

    const fail = (statusCode, message) => {
      finishTerminal("error", { error: message, httpStatus: statusCode });
      if (!response.writableEnded) {
        response.writeHead(statusCode, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: message }));
      }
    };

    emit(createRequestEvent(context, "request", {
      authorizationPresent: typeof request.headers.authorization === "string",
      method: request.method,
      path: requestUrl.pathname,
      rangePresent: typeof request.headers.range === "string",
    }));

    response.once("error", (error) => {
      finishTerminal("error", { error: error.message });
    });
    response.once("close", () => {
      if (!terminal && !response.writableEnded) {
        finishTerminal("cancelled");
      }
    });

    timeoutId = setTimeout(() => {
      if (!terminal) {
        finishTerminal("error", { error: "request_timeout" });
        response.destroy(new Error("fixture request exceeded 120 seconds"));
      }
    }, MAX_REQUEST_DURATION_MS);

    if (request.method !== "GET" && request.method !== "HEAD") {
      fail(405, "method_not_allowed");
      return;
    }

    if (requestUrl.pathname !== "/api/voice_stream") {
      fail(404, "not_found");
      return;
    }

    const messageIndexRaw = requestUrl.searchParams.get("message_index");
    const messageIndex = Number.parseInt(messageIndexRaw ?? "", 10);
    if (
      !requestUrl.searchParams.get("conversation_id") ||
      !Number.isInteger(messageIndex) ||
      messageIndex < 0
    ) {
      fail(400, "conversation_id_and_message_index_required");
      return;
    }

    if (!VALID_CASES.has(caseName)) {
      fail(400, `unknown_fixture_case:${caseName}`);
      return;
    }

    const range = parseSingleRange(request.headers.range, fixture.bytes.length);
    if (range?.invalid) {
      response.setHeader("Content-Range", `bytes */${fixture.bytes.length}`);
      fail(416, "unsupported_or_unsatisfiable_range");
      return;
    }

    const rangeBytes = range
      ? fixture.bytes.subarray(range.start, range.end + 1)
      : fixture.bytes;
    let fixtureCase;
    try {
      fixtureCase = chunksForCase(rangeBytes, fixture, requestUrl.searchParams);
      if (range) {
        fixtureCase = {
          chunkDelayMs: 0,
          chunks: [rangeBytes],
          delayBeforeTailMs: 0,
          progressive: false,
        };
      }
    } catch (error) {
      fail(400, error instanceof Error ? error.message : "invalid_fixture_case");
      return;
    }

    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Type": fixture.contentType,
      "X-Fixture-Case": caseName,
      "X-Fixture-SHA256": fixture.sha256,
      "X-Fixture-Run-Id": runId,
      "X-Fixture-Attempt-Id": attemptId,
    };
    if (fixtureCase.truncated) {
      headers["X-Fixture-Truncated"] = String(fixtureCase.truncatedBytes);
    }
    if (range) {
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${fixture.bytes.length}`;
    }
    const completeLength = fixtureCase.chunks.reduce((total, chunk) => total + chunk.length, 0);
    const isProgressive = fixtureCase.progressive && fixtureCase.chunks.length > 1;
    if (!isProgressive) {
      headers["Content-Length"] = String(completeLength);
    }

    response.writeHead(range ? 206 : 200, headers);
    response.flushHeaders?.();
    if (request.method === "HEAD") {
      response.end();
      finishTerminal("normal_eof", { head: true });
      return;
    }

    const writeChunk = (chunk) =>
      new Promise((resolve, reject) => {
        if (terminal || response.destroyed) {
          reject(new Error("response_closed"));
          return;
        }
        let settled = false;
        const onClose = () => settle(new Error("response_closed"));
        const onDrain = () => settle();
        const settle = (error) => {
          if (settled) {
            return;
          }
          settled = true;
          response.off("close", onClose);
          response.off("drain", onDrain);
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        response.once("close", onClose);
        const canContinue = response.write(chunk, (error) => settle(error));
        if (!canContinue) {
          response.once("drain", onDrain);
        }
      });

    try {
      for (let index = 0; index < fixtureCase.chunks.length; index += 1) {
        if (index > 0 && fixtureCase.chunkDelayMs) {
          await delay(fixtureCase.chunkDelayMs);
        }
        if (index > 0 && index === fixtureCase.chunks.length - 1 && fixtureCase.delayBeforeTailMs) {
          await delay(fixtureCase.delayBeforeTailMs);
        }
        const chunk = fixtureCase.chunks[index];
        await writeChunk(chunk);
        bytesWritten += chunk.length;
        chunksWritten += 1;
        emit(createRequestEvent(context, "chunk", {
          bytesWritten,
          chunkBytes: chunk.length,
          chunkIndex: index,
          chunksWritten,
        }));
      }

      const eofDelayMs = fixtureCase.eofDelayMs || 0;
      if (eofDelayMs > 0) {
        await delay(eofDelayMs);
      }
      if (!terminal) {
        response.end();
        finishTerminal("normal_eof");
      }
    } catch (error) {
      if (!terminal) {
        finishTerminal(response.destroyed ? "cancelled" : "error", {
          error: error instanceof Error ? error.message : "fixture_write_failed",
        });
      }
      if (!response.destroyed && !response.writableEnded) {
        response.destroy(error);
      }
    }
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    address,
    baseUrl: `http://${host}:${actualPort}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    events,
    fixture,
    server,
  };
}

async function runCli() {
  const options = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (!argument.startsWith("--")) {
      continue;
    }
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    const value = inlineValue ?? process.argv[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    options.set(key, value);
  }

  const fixtureServer = await startVoiceFixtureServer({
    fixturePath: options.get("fixture") || DEFAULT_FIXTURE_PATH,
    host: options.get("host") || DEFAULT_HOST,
    port: asNonNegativeInteger(options.get("port"), 8787),
  });
  console.log(JSON.stringify({
    contentType: fixtureServer.fixture.contentType,
    fixtureBytes: fixtureServer.fixture.bytes.length,
    fixtureSha256: fixtureServer.fixture.sha256,
    url: `${fixtureServer.baseUrl}/api/voice_stream?conversation_id=fixture&message_index=1&fixture_case=steady`,
  }));

  const shutdown = async () => {
    await fixtureServer.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runCli();
}
