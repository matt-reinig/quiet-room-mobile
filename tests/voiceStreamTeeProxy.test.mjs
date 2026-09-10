import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import http from "node:http";

import { startTeeProxy } from "../scripts/voice-stream-tee-proxy.mjs";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path, headers }, resolve);
    req.once("error", reject);
  });
}

async function readResponse(response, { cancelAfterFirstChunk = false } = {}) {
  const chunks = [];
  let firstChunkAt;
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    response.on("data", (chunk) => {
      if (!firstChunkAt) firstChunkAt = Date.now();
      chunks.push(chunk);
      if (cancelAfterFirstChunk) response.destroy();
    });
    response.on("end", () => resolve({ body: Buffer.concat(chunks), firstChunkMs: firstChunkAt - startedAt, ended: true }));
    response.on("close", () => {
      if (!response.complete) resolve({ body: Buffer.concat(chunks), firstChunkMs: firstChunkAt - startedAt, ended: false });
    });
    response.on("error", reject);
  });
}

async function waitForManifest(dir) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const names = await readdir(dir);
    const manifest = names.find((name) => name.endsWith(".manifest.jsonl"));
    if (manifest) {
      const text = (await readFile(join(dir, manifest), "utf8")).trim();
      if (text) return JSON.parse(text);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for proxy manifest");
}

test("tee preserves exact bytes, forwards progressively, and excludes query/token from JSONL", async () => {
  const payload = Buffer.from("first-mp3-bytes\0second-mp3-bytes\0final");
  let upstreamFinished = false;
  const upstream = http.createServer((request, response) => {
    assert.equal(request.url, "/api/voice_stream?conversation_id=secret-conversation&message_index=9");
    assert.equal(request.headers.authorization, "Bearer secret-token-value");
    assert.equal(request.headers["x-qr-mob-021-run-id"], undefined);
    assert.equal(request.headers["x-qr-mob-021-attempt-id"], undefined);
    response.writeHead(200, {
      "content-type": "audio/mpeg",
      "cache-control": "no-store",
      "content-length": payload.length,
    });
    response.write(payload.subarray(0, 8));
    setTimeout(() => response.write(payload.subarray(8, 19)), 80);
    setTimeout(() => {
      response.end(payload.subarray(19));
      upstreamFinished = true;
    }, 160);
  });
  const upstreamPort = await listen(upstream);
  const outputDir = await mkdtemp(join(tmpdir(), "qr-mob-021-tee-"));
  const proxy = await startTeeProxy({ upstreamBase: `http://127.0.0.1:${upstreamPort}`, outputDir, host: "127.0.0.1", port: 0 });
  const proxyPort = proxy.address().port;
  try {
    const response = await request(proxyPort, "/api/voice_stream?conversation_id=secret-conversation&message_index=9", {
      authorization: "Bearer secret-token-value",
      "x-qr-mob-021-run-id": "run-123",
      "x-qr-mob-021-attempt-id": "attempt-456",
    });
    const received = await readResponse(response);
    assert.deepEqual(received.body, payload);
    assert.equal(received.ended, true);
    assert.equal(response.headers["content-type"], "audio/mpeg");
    assert.equal(response.headers["content-length"], undefined);
    assert.equal(received.firstChunkMs < 140, true, `first byte was delayed ${received.firstChunkMs}ms`);
    assert.equal(upstreamFinished, true);

    const manifest = await waitForManifest(outputDir);
    assert.equal(manifest.terminal, "upstream_exhaustion");
    assert.equal(manifest.bytesReceived, payload.length);
    assert.equal(manifest.chunkCount, 3);
    assert.equal(manifest.sha256, createHash("sha256").update(payload).digest("hex"));
    const names = await readdir(outputDir);
    const eventFile = names.find((name) => name.endsWith(".events.jsonl"));
    const eventText = await readFile(join(outputDir, eventFile), "utf8");
    assert.equal(eventText.includes("secret-token-value"), false);
    assert.equal(eventText.includes("secret-conversation"), false);
    assert.equal(eventText.includes("/api/voice_stream"), false);
    assert.equal(eventText.includes('"runId":"run-123"'), true);
    assert.equal(eventText.includes('"attemptId":"attempt-456"'), true);
    const body = await readFile(join(outputDir, manifest.bodyFile));
    assert.deepEqual(body, payload);
  } finally {
    await close(proxy);
    await close(upstream);
  }
});

test("tee classifies a client cancellation separately from upstream exhaustion", async () => {
  const upstream = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "audio/mpeg" });
    response.write(Buffer.from("prefix"));
    setTimeout(() => response.end(Buffer.from("tail")), 500);
  });
  const upstreamPort = await listen(upstream);
  const outputDir = await mkdtemp(join(tmpdir(), "qr-mob-021-tee-cancel-"));
  const proxy = await startTeeProxy({ upstreamBase: `http://127.0.0.1:${upstreamPort}`, outputDir, host: "127.0.0.1", port: 0 });
  const proxyPort = proxy.address().port;
  try {
    const response = await request(proxyPort, "/api/voice_stream?conversation_id=cancel-test&message_index=1");
    const received = await readResponse(response, { cancelAfterFirstChunk: true });
    assert.equal(received.body.toString(), "prefix");
    const manifest = await waitForManifest(outputDir);
    assert.equal(manifest.terminal, "client_close");
    assert.equal(manifest.bytesReceived, 6);
    assert.equal(manifest.chunkCount, 1);
  } finally {
    await close(proxy);
    await close(upstream);
  }
});
