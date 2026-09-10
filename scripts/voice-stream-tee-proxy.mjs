#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import http from "node:http";
import https from "node:https";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8788;
const DEFAULT_OUTPUT_DIR = "artifacts/qr-mob-021/voice-tee";
const RESPONSE_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-encoding",
  "content-range",
  "content-type",
  "expires",
  "etag",
  "last-modified",
  "pragma",
  "vary",
];
const REQUEST_HEADERS = ["accept", "accept-encoding", "content-type", "range", "user-agent"];
function boundedCorrelationValue(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.length > 0 && candidate.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(candidate)
    ? candidate
    : undefined;
}

export function validateUpstreamBase(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--upstream must be an absolute HTTP(S) URL");
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("--upstream must be an HTTP(S) URL without credentials, query, or fragment");
  }
  return url;
}

function targetForRequest(upstreamBase, requestUrl) {
  const incoming = new URL(requestUrl || "/", "http://voice-tee.invalid");
  return new URL(`${incoming.pathname}${incoming.search}`, upstreamBase);
}

function elapsedMs(start) {
  return monotonicElapsedMs(start);
}

function monotonicElapsedMs(start, end = process.hrtime.bigint()) {
  return Number((Number(end - start) / 1e6).toFixed(3));
}

function wallTime() {
  return new Date().toISOString();
}

function safeError(error) {
  return {
    errorName: error?.name || "Error",
    ...(error?.code ? { errorCode: String(error.code) } : {}),
  };
}

function writeChunk(stream, chunk) {
  const submittedAt = process.hrtime.bigint();
  return new Promise((resolve, reject) => {
    if (stream.destroyed || stream.writableEnded) {
      reject(new Error("destination stream is closed"));
      return;
    }
    let callbackDone = false;
    let drained = stream.writableNeedDrain === false;
    let settled = false;
    let accepted = true;
    const onDrain = () => {
      drained = true;
      settle();
    };
    const onError = (error) => {
      if (!settled) {
        settled = true;
        stream.off("drain", onDrain);
        reject(error);
      }
    };
    const settle = () => {
      if (!settled && callbackDone && drained) {
        settled = true;
        stream.off("drain", onDrain);
        stream.off("error", onError);
        const completedAt = process.hrtime.bigint();
        resolve({ submittedAt, completedAt, accepted, backpressure: !accepted });
      }
    };
    stream.once("error", onError);
    accepted = stream.write(chunk, (error) => {
      if (error) {
        onError(error);
        return;
      }
      callbackDone = true;
      settle();
    });
    if (!accepted) {
      drained = false;
      stream.once("drain", onDrain);
      // A small write can drain before the listener is attached. Re-check the
      // state so timing evidence does not wait forever on a missed event.
      if (!stream.writableNeedDrain) onDrain();
    }
    settle();
  });
}

function closeWriteStream(stream) {
  if (!stream || stream.destroyed || stream.writableEnded) return Promise.resolve();
  stream.end();
  return finished(stream);
}

function createRequestHeaders(request) {
  const headers = {};
  for (const name of REQUEST_HEADERS) {
    const value = request.headers[name];
    if (value !== undefined) headers[name] = value;
  }
  if (request.headers.authorization) headers.authorization = request.headers.authorization;
  // Diagnostic correlation is intentionally local-only and must never reach QA.
  return headers;
}

function headerNames(headers) {
  return Object.keys(headers || {}).map((name) => name.toLowerCase()).sort();
}

function requestHeaderPolicy(request) {
  const incoming = new Set(headerNames(request.headers));
  const forwarded = new Set(REQUEST_HEADERS);
  if (request.headers.authorization) forwarded.add("authorization");
  return {
    forwarded: [...forwarded].filter((name) => incoming.has(name)).sort(),
    omitted: [...incoming].filter((name) => !forwarded.has(name)).sort(),
  };
}

function responseHeaders(upstreamResponse) {
  const headers = {};
  for (const name of RESPONSE_HEADERS) {
    const value = upstreamResponse.headers[name];
    if (value !== undefined) headers[name] = value;
  }
  // Deliberately omit content-length so a progressive upstream stays progressive.
  return headers;
}

function responseHeaderPolicy(upstreamResponse) {
  const incoming = new Set(headerNames(upstreamResponse.headers));
  const forwarded = new Set(RESPONSE_HEADERS);
  return {
    forwarded: [...forwarded].filter((name) => incoming.has(name)).sort(),
    omitted: [...incoming].filter((name) => !forwarded.has(name)).sort(),
    removed: ["content-length"].filter((name) => incoming.has(name)),
  };
}

function makeEvent(state, event, fields = {}) {
  const correlation = {};
  if (state.runId) correlation.runId = state.runId;
  if (state.attemptId) correlation.attemptId = state.attemptId;
  return {
    schemaVersion: 1,
    event,
    requestId: state.requestId,
    wallTime: wallTime(),
    elapsedMs: elapsedMs(state.startedAt),
    ...correlation,
    ...fields,
  };
}

export function createTeeProxyServer({ upstreamBase, outputDir = DEFAULT_OUTPUT_DIR } = {}) {
  const base = validateUpstreamBase(String(upstreamBase || ""));
  const server = http.createServer((request, response) => {
    handleRequest({ request, response, upstreamBase: base, outputDir }).catch((error) => {
      if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      if (!response.writableEnded) response.end("voice stream proxy error");
      // Keep the process alive for other requests; request-scoped details go to the manifest.
      if (process.env.VOICE_TEE_DEBUG === "1") console.error(error?.name || "Error");
    });
  });
  return server;
}

export async function startTeeProxy({
  upstreamBase,
  outputDir = DEFAULT_OUTPUT_DIR,
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
} = {}) {
  await mkdir(outputDir, { recursive: true });
  const server = createTeeProxyServer({ upstreamBase, outputDir });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host, port: Number(port) }, resolve);
  });
  return server;
}

async function handleRequest({ request, response, upstreamBase, outputDir }) {
  const state = {
    requestId: randomUUID(),
    method: request.method || "GET",
    runId: boundedCorrelationValue(request.headers["x-qr-mob-021-run-id"]),
    attemptId: boundedCorrelationValue(request.headers["x-qr-mob-021-attempt-id"]),
    startedAt: process.hrtime.bigint(),
    statusCode: null,
    mimeType: null,
    bytesReceived: 0,
    chunkCount: 0,
    hash: createHash("sha256"),
    terminal: null,
    clientClosed: false,
    upstreamEnded: false,
    upstreamError: null,
    eventLogTimings: [],
    response,
  };
  const bodyFile = `${state.requestId}.bin`;
  const eventFile = `${state.requestId}.events.jsonl`;
  const manifestFile = `${state.requestId}.manifest.jsonl`;
  const bodyPath = `${outputDir}/${bodyFile}`;
  const eventPath = `${outputDir}/${eventFile}`;
  const manifestPath = `${outputDir}/${manifestFile}`;
  const bodyStream = createWriteStream(bodyPath, { flags: "wx" });
  const eventStream = createWriteStream(eventPath, { flags: "wx" });
  const manifestStream = createWriteStream(manifestPath, { flags: "wx" });
  let upstreamRequest;
  let finalized = false;

  const emit = async (event, fields = {}) => {
    const eventIndex = state.eventLogTimings.length + 1;
    const submittedAt = process.hrtime.bigint();
    const line = `${JSON.stringify(makeEvent(state, event, fields))}\n`;
    const write = await writeChunk(eventStream, line);
    state.eventLogTimings.push({
      eventIndex,
      event,
      submittedElapsedMs: monotonicElapsedMs(state.startedAt, submittedAt),
      completedElapsedMs: monotonicElapsedMs(state.startedAt, write.completedAt),
      waitMs: monotonicElapsedMs(submittedAt, write.completedAt),
      backpressure: write.backpressure,
    });
    return write;
  };
  const abortUpstream = () => {
    state.clientClosed = true;
    if (upstreamRequest && !upstreamRequest.destroyed) upstreamRequest.destroy();
  };
  request.once("aborted", abortUpstream);
  request.once("close", () => {
    if (!request.complete) abortUpstream();
  });
  response.once("close", () => {
    if (!response.writableEnded && !state.upstreamEnded) abortUpstream();
  });

  const finalize = async (terminalOverride) => {
    if (finalized) return;
    finalized = true;
    state.terminal = terminalOverride || (state.clientClosed ? "client_close" : state.upstreamError ? "upstream_error" : "upstream_exhaustion");
    const sha256 = state.hash.digest("hex");
    try {
      await emit("terminal", {
        terminal: state.terminal,
        statusCode: state.statusCode,
        mimeType: state.mimeType,
        bytesReceived: state.bytesReceived,
        chunkCount: state.chunkCount,
        sha256,
        ...(state.upstreamError ? safeError(state.upstreamError) : {}),
      });
      const endedAt = wallTime();
      const eventLogWaits = state.eventLogTimings.map((timing) => timing.waitMs);
      const manifest = makeEvent(state, "manifest", {
        terminal: state.terminal,
        statusCode: state.statusCode,
        mimeType: state.mimeType,
        bytesReceived: state.bytesReceived,
        chunkCount: state.chunkCount,
        sha256,
        bodyFile,
        eventFile,
        startedAt: new Date(Date.now() - elapsedMs(state.startedAt)).toISOString(),
        endedAt,
        headerPolicy: state.headerPolicy,
        eventLogTimings: state.eventLogTimings,
        eventLogTimingSummary: {
          eventCount: eventLogWaits.length,
          totalWaitMs: Number(eventLogWaits.reduce((sum, value) => sum + value, 0).toFixed(3)),
          maxWaitMs: eventLogWaits.length ? Math.max(...eventLogWaits) : 0,
        },
        ...(state.upstreamError ? safeError(state.upstreamError) : {}),
      });
      await writeChunk(manifestStream, `${JSON.stringify(manifest)}\n`);
    } finally {
      await Promise.allSettled([
        closeWriteStream(bodyStream),
        closeWriteStream(eventStream),
        closeWriteStream(manifestStream),
      ]);
    }
  };

  try {
    state.headerPolicy = {
      request: requestHeaderPolicy(request),
    };
    await emit("request", {
      method: state.method,
      headerPolicy: state.headerPolicy.request,
    });
    const target = targetForRequest(upstreamBase, request.url);
    const transport = target.protocol === "https:" ? https : http;
    const upstreamResponse = await new Promise((resolve, reject) => {
      upstreamRequest = transport.request(target, {
        method: state.method,
        headers: createRequestHeaders(request),
      }, resolve);
      upstreamRequest.once("error", reject);
      if (state.method === "GET" || state.method === "HEAD") upstreamRequest.end();
      else request.pipe(upstreamRequest);
    });
    state.statusCode = upstreamResponse.statusCode || 502;
    state.mimeType = typeof upstreamResponse.headers["content-type"] === "string"
      ? upstreamResponse.headers["content-type"]
      : null;
    upstreamResponse.once("aborted", () => {
      state.upstreamError = Object.assign(new Error("upstream response aborted"), { code: "UPSTREAM_ABORTED" });
    });
    response.writeHead(state.statusCode, responseHeaders(upstreamResponse));
    state.headerPolicy.response = responseHeaderPolicy(upstreamResponse);
    await emit("response", {
      statusCode: state.statusCode,
      mimeType: state.mimeType,
      headerPolicy: state.headerPolicy.response,
    });

    try {
      for await (const chunk of upstreamResponse) {
        if (state.clientClosed) break;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const upstreamReceivedAt = process.hrtime.bigint();
        state.hash.update(bytes);
        state.bytesReceived += bytes.length;
        state.chunkCount += 1;
        const bodyWrite = await writeChunk(bodyStream, bytes);
        const downstreamWrite = await writeChunk(response, bytes);
        await emit("chunk", {
          chunkIndex: state.chunkCount,
          chunkBytes: bytes.length,
          bytesReceived: state.bytesReceived,
          upstreamReceiptElapsedMs: monotonicElapsedMs(state.startedAt, upstreamReceivedAt),
          diskWriteSubmittedElapsedMs: monotonicElapsedMs(state.startedAt, bodyWrite.submittedAt),
          diskWriteCompletedElapsedMs: monotonicElapsedMs(state.startedAt, bodyWrite.completedAt),
          diskWriteWaitMs: monotonicElapsedMs(bodyWrite.submittedAt, bodyWrite.completedAt),
          diskWriteBackpressure: bodyWrite.backpressure,
          downstreamWriteSubmittedElapsedMs: monotonicElapsedMs(state.startedAt, downstreamWrite.submittedAt),
          downstreamWriteCompletedElapsedMs: monotonicElapsedMs(state.startedAt, downstreamWrite.completedAt),
          downstreamWriteWaitMs: monotonicElapsedMs(downstreamWrite.submittedAt, downstreamWrite.completedAt),
          downstreamWriteBackpressure: downstreamWrite.backpressure,
        });
      }
      state.upstreamEnded = !state.clientClosed && !state.upstreamError;
    } catch (error) {
      state.upstreamError = error;
      if (!state.clientClosed && !response.destroyed) response.destroy(error);
    }
    if (!response.destroyed && !response.writableEnded) response.end();
    await finalize(state.clientClosed ? "client_close" : state.upstreamError ? "upstream_error" : "upstream_exhaustion");
  } catch (error) {
    state.upstreamError = error;
    if (!response.headersSent) response.writeHead(502, { "cache-control": "no-store" });
    if (!response.writableEnded && !response.destroyed) response.end();
    await finalize(state.clientClosed ? "client_close" : "upstream_error");
  }
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const values = {
    upstreamBase: process.env.VOICE_TEE_UPSTREAM,
    host: process.env.VOICE_TEE_HOST || DEFAULT_HOST,
    port: process.env.VOICE_TEE_PORT || DEFAULT_PORT,
    outputDir: process.env.VOICE_TEE_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    const next = argv[index + 1];
    if (arg === "--upstream") values.upstreamBase = next;
    else if (arg === "--host") values.host = next;
    else if (arg === "--port") values.port = next;
    else if (arg === "--output-dir") values.outputDir = next;
    else throw new Error(`unknown option ${arg}`);
    index += 1;
  }
  if (!values.upstreamBase) throw new Error("--upstream is required");
  validateUpstreamBase(values.upstreamBase);
  return values;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const options = parseCliArgs();
    if (options.help) {
      console.log("Usage: voice-stream-tee-proxy.mjs --upstream https://qa.example [--port 8788] [--output-dir DIR]");
      process.exit(0);
    }
    const server = await startTeeProxy(options);
    const address = server.address();
    console.log(`voice tee listening host=${options.host} port=${typeof address === "object" ? address.port : options.port} outputDir=${options.outputDir}`);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
