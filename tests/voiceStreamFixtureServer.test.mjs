import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

import { startVoiceFixtureServer } from "../scripts/voice-stream-fixture-server.mjs";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((fixtureServer) => fixtureServer.close()));
});

async function createServer() {
  const fixtureServer = await startVoiceFixtureServer({ logger: { info() {} } });
  servers.push(fixtureServer);
  return fixtureServer;
}

function voiceUrl(fixtureServer, search = "") {
  return `${fixtureServer.baseUrl}/api/voice_stream?conversation_id=fixture&message_index=1${search}`;
}

function terminalEvent(fixtureServer, attemptId) {
  return fixtureServer.events.find(
    (event) => event.event === "terminal" && event.attemptId === attemptId,
  );
}

test("complete and progressive cases preserve the exact fixture bytes", async () => {
  const fixtureServer = await createServer();
  const cases = [
    "complete-file",
    "steady",
    "delayed-tail",
    "chunk-schedule",
    "normal-eof",
  ];

  for (const [index, fixtureCase] of cases.entries()) {
    const attemptId = `same-bytes-${fixtureCase}`;
    const response = await fetch(
      voiceUrl(fixtureServer, `&fixture_case=${fixtureCase}&chunk_delay_ms=0&run_id=bytes&attempt_id=${attemptId}`),
    );
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200);
    assert.deepEqual(body, fixtureServer.fixture.bytes, `${fixtureCase} changed fixture bytes`);
    assert.equal(response.headers.get("x-fixture-sha256"), fixtureServer.fixture.sha256);
    assert.equal(
      response.headers.get("content-length") === null,
      fixtureCase !== "complete-file",
      `${fixtureCase} Content-Length did not match delivery mode`,
    );
    if (fixtureCase === "complete-file") {
      assert.equal(response.headers.get("content-length"), String(fixtureServer.fixture.bytes.length));
    } else {
      assert.equal(response.headers.get("content-length"), null);
    }
    assert.equal(terminalEvent(fixtureServer, attemptId)?.status, "normal_eof");
    assert.equal(terminalEvent(fixtureServer, attemptId)?.bytesWritten, fixtureServer.fixture.bytes.length);
    assert.equal(index >= 0, true);
  }
});

test("delayed-tail cases hold the closing phrase for the requested delay", async () => {
  const fixtureServer = await createServer();

  for (const delayMs of [250, 750, 1500]) {
    const attemptId = `tail-${delayMs}`;
    const start = Date.now();
    const response = await fetch(
      voiceUrl(
        fixtureServer,
        `&fixture_case=delayed-tail-${delayMs}&chunk_delay_ms=0&run_id=tail&attempt_id=${attemptId}`,
      ),
    );
    const body = Buffer.from(await response.arrayBuffer());
    const elapsed = Date.now() - start;
    assert.equal(response.status, 200);
    assert.deepEqual(body, fixtureServer.fixture.bytes);
    assert.ok(elapsed >= delayMs - 50, `${delayMs} ms delay only took ${elapsed} ms`);
    assert.equal(terminalEvent(fixtureServer, attemptId)?.status, "normal_eof");
  }
});

test("chunk schedules are repeatable and use different final chunk sizes", async () => {
  const fixtureServer = await createServer();
  const finalChunks = [];

  for (const schedule of ["schedule-a", "schedule-b", "schedule-a", "schedule-b"]) {
    const attemptId = `schedule-${schedule}-${finalChunks.length}`;
    const response = await fetch(
      voiceUrl(
        fixtureServer,
        `&fixture_case=chunk-schedule&chunk_delay_ms=0&schedule=${schedule}&run_id=schedules&attempt_id=${attemptId}`,
      ),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixtureServer.fixture.bytes);
    const chunks = fixtureServer.events.filter(
      (event) => event.event === "chunk" && event.attemptId === attemptId,
    );
    finalChunks.push(chunks.at(-1).chunkBytes);
  }

  assert.deepEqual(finalChunks, [4096, 12288, 4096, 12288]);
});

test("normal EOF can be immediate or delayed without changing bytes", async () => {
  const fixtureServer = await createServer();
  const immediate = await fetch(
    voiceUrl(fixtureServer, "&fixture_case=normal-eof-immediate&chunk_delay_ms=0&run_id=eof&attempt_id=immediate"),
  );
  const delayedStart = Date.now();
  const delayed = await fetch(
    voiceUrl(
      fixtureServer,
      "&fixture_case=normal-eof-delayed&chunk_delay_ms=0&eof_delay_ms=40&run_id=eof&attempt_id=delayed",
    ),
  );
  const delayedBody = Buffer.from(await delayed.arrayBuffer());
  assert.deepEqual(Buffer.from(await immediate.arrayBuffer()), fixtureServer.fixture.bytes);
  assert.deepEqual(delayedBody, fixtureServer.fixture.bytes);
  assert.ok(Date.now() - delayedStart >= 30);
  assert.equal(terminalEvent(fixtureServer, "immediate")?.status, "normal_eof");
  assert.equal(terminalEvent(fixtureServer, "delayed")?.status, "normal_eof");
});

test("deliberate truncation is marked and removes the known closing tail", async () => {
  const fixtureServer = await createServer();
  const attemptId = "truncated-negative-control";
  const response = await fetch(
    voiceUrl(fixtureServer, "&fixture_case=truncated&chunk_delay_ms=0&run_id=negative&attempt_id=truncated-negative-control"),
  );
  const body = Buffer.from(await response.arrayBuffer());
  const tailBytes = fixtureServer.fixture.tailBytes;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-fixture-truncated"), String(tailBytes));
  assert.deepEqual(body, fixtureServer.fixture.bytes.subarray(0, -tailBytes));
  assert.equal(terminalEvent(fixtureServer, attemptId)?.status, "normal_eof");
});

test("single byte ranges are explicit and invalid ranges are rejected", async () => {
  const fixtureServer = await createServer();
  const ranged = await fetch(
    voiceUrl(fixtureServer, "&fixture_case=complete-file&run_id=range&attempt_id=range-ok"),
    { headers: { Range: "bytes=4-15" } },
  );
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get("accept-ranges"), "bytes");
  assert.equal(ranged.headers.get("content-range"), `bytes 4-15/${fixtureServer.fixture.bytes.length}`);
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), fixtureServer.fixture.bytes.subarray(4, 16));

  const invalid = await fetch(
    voiceUrl(fixtureServer, "&fixture_case=complete-file&run_id=range&attempt_id=range-bad"),
    { headers: { Range: "bytes=0-2,4-6" } },
  );
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("content-range"), `bytes */${fixtureServer.fixture.bytes.length}`);
  assert.equal(terminalEvent(fixtureServer, "range-bad")?.status, "error");
});

test("terminal events include run and attempt correlation and distinguish cancellation", async () => {
  const fixtureServer = await createServer();
  const request = fetch(
    voiceUrl(
      fixtureServer,
      "&fixture_case=delayed-tail&delay_ms=1500&run_id=cancel-run&attempt_id=cancel-attempt",
    ),
  );
  const response = await request;
  await response.body.cancel();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const terminal = terminalEvent(fixtureServer, "cancel-attempt");
  assert.equal(terminal?.runId, "cancel-run");
  assert.equal(terminal?.attemptId, "cancel-attempt");
  assert.equal(terminal?.status, "cancelled");
});

test("default progressive delivery spans multiple timed chunks", async () => {
  const fixtureServer = await createServer();
  const attemptId = "paced-default";
  const response = await fetch(
    voiceUrl(fixtureServer, `&fixture_case=steady&run_id=pacing&attempt_id=${attemptId}`),
  );
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixtureServer.fixture.bytes);
  const terminal = terminalEvent(fixtureServer, attemptId);
  assert.ok(terminal?.chunksWritten > 1);
  assert.ok(terminal?.elapsedMs >= 1000, `progressive delivery only took ${terminal?.elapsedMs} ms`);
  assert.match(terminal?.wallTime || "", /^\d{4}-\d{2}-\d{2}T/);
});

test("request telemetry records auth and range presence without recording their values", async () => {
  const fixtureServer = await createServer();
  const response = await fetch(
    voiceUrl(fixtureServer, "&fixture_case=complete-file&run_id=privacy&attempt_id=headers"),
    { headers: { Authorization: "Bearer should-never-be-logged" } },
  );
  await response.arrayBuffer();
  const requestEvent = fixtureServer.events.find(
    (event) => event.event === "request" && event.attemptId === "headers",
  );
  assert.equal(requestEvent?.authorizationPresent, true);
  assert.equal(requestEvent?.rangePresent, false);
  assert.equal(JSON.stringify(requestEvent).includes("should-never-be-logged"), false);
});
