import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chooseCorrelation,
  parseDiagnosticEvents,
  parseServerEvents,
  summarizeServerEvents,
} from "../scripts/collect-voice-stream-run.mjs";

test("collector parses bounded server and device-log JSON events", () => {
  const serverLog = [
    '{"contentType":"audio/mpeg","fixtureBytes":254581}',
    '[voice-fixture] {"event":"request","method":"GET","case":"steady","runId":"run-1","attemptId":"attempt-1","wallTime":"2026-09-09T21:18:33.257Z"}',
    '[voice-fixture] {"event":"chunk","runId":"run-1","attemptId":"attempt-1","chunkBytes":8192,"bytesWritten":8192,"chunksWritten":1,"elapsedMs":4,"wallTime":"2026-09-09T21:18:33.261Z"}',
    '[voice-fixture] {"event":"terminal","runId":"run-1","attemptId":"attempt-1","status":"normal_eof","bytesWritten":254581,"chunksWritten":26,"elapsedMs":6318,"wallTime":"2026-09-09T21:18:39.576Z"}',
  ].join("\n");
  const deviceLog = [
    '09-09 16:18:32.324 I ReactNativeJS: QR_MOB_021_VOICE_DIAG {"prefix":"QR_MOB_021_VOICE_DIAG","event":"attempt.started","runId":"run-1","attemptId":"attempt-1","fields":{"fixtureCase":"steady"}}',
  ].join("\n");

  const serverEvents = parseServerEvents(serverLog);
  const diagnosticEvents = parseDiagnosticEvents(deviceLog);
  const correlation = chooseCorrelation(diagnosticEvents, "steady");
  const summary = summarizeServerEvents(serverEvents, correlation);

  assert.deepEqual(correlation, { runId: "run-1", attemptId: "attempt-1" });
  assert.equal(summary.request.method, "GET");
  assert.equal(summary.request.case, "steady");
  assert.equal(summary.chunks.count, 1);
  assert.equal(summary.chunks.first.wallTime, "2026-09-09T21:18:33.261Z");
  assert.equal(summary.terminal.status, "normal_eof");
  assert.equal(summary.terminal.bytesWritten, 254581);
  assert.equal(summary.requestCount, 1);
});

test("collector does not select readiness HEAD requests over the real GET", () => {
  const events = parseServerEvents([
    '[voice-fixture] {"event":"request","method":"HEAD","case":"complete-file","runId":"run-unknown","attemptId":"head-1"}',
    '[voice-fixture] {"event":"terminal","status":"normal_eof","runId":"run-unknown","attemptId":"head-1","bytesWritten":0,"chunksWritten":0}',
    '[voice-fixture] {"event":"request","method":"GET","case":"delayed-tail-750","runId":"run-2","attemptId":"attempt-2"}',
    '[voice-fixture] {"event":"chunk","runId":"run-2","attemptId":"attempt-2","chunkBytes":12,"bytesWritten":12,"chunksWritten":1}',
    '[voice-fixture] {"event":"terminal","status":"cancelled","runId":"run-2","attemptId":"attempt-2","bytesWritten":12,"chunksWritten":1}',
  ].join("\n"));
  const summary = summarizeServerEvents(events, { runId: "run-2", attemptId: "attempt-2" });

  assert.equal(summary.request.method, "GET");
  assert.equal(summary.request.case, "delayed-tail-750");
  assert.equal(summary.terminal.status, "cancelled");
});

test("collector keeps retry request chunks and terminals separate", () => {
  const events = parseServerEvents([
    '[voice-fixture] {"event":"request","method":"GET","case":"near-buffer-exhaustion-8000","runId":"run-3","attemptId":"attempt-3"}',
    '[voice-fixture] {"event":"chunk","runId":"run-3","attemptId":"attempt-3","chunkBytes":65536,"bytesWritten":65536,"chunksWritten":1}',
    '[voice-fixture] {"event":"terminal","status":"cancelled","runId":"run-3","attemptId":"attempt-3","bytesWritten":65536,"chunksWritten":1}',
    '[voice-fixture] {"event":"request","method":"GET","case":"near-buffer-exhaustion-8000","runId":"run-3","attemptId":"attempt-3"}',
    '[voice-fixture] {"event":"chunk","runId":"run-3","attemptId":"attempt-3","chunkBytes":32768,"bytesWritten":32768,"chunksWritten":1}',
    '[voice-fixture] {"event":"terminal","status":"cancelled","runId":"run-3","attemptId":"attempt-3","bytesWritten":32768,"chunksWritten":1}',
  ].join("\n"));
  const summary = summarizeServerEvents(events, { runId: "run-3", attemptId: "attempt-3" });

  assert.equal(summary.requestCount, 2);
  assert.equal(summary.chunks.count, 1);
  assert.equal(summary.chunks.bytes, 65536);
  assert.equal(summary.terminal.bytesWritten, 65536);
  assert.equal(summary.requests[1].chunks.bytes, 32768);
  assert.equal(summary.requests[1].terminal.status, "cancelled");
});
