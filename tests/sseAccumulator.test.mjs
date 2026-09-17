import assert from "node:assert/strict";
import test from "node:test";

import { createSseAccumulator } from "../src/lib/sseAccumulator.ts";

test("accumulates exact decoded chunks and requires the done marker", () => {
  const chunks = [];
  const accumulator = createSseAccumulator((chunk) => chunks.push(chunk));

  accumulator.append('data: {"chunk":"What do you make "}\n\n');
  accumulator.append('data: {"chunk":"of the fact that your brothers "}\n\n');
  accumulator.append('data: {"chunk":"ran you down and came to you?"}\n\n');
  accumulator.append("data: [DONE]\n\n");

  assert.deepEqual(accumulator.flush(), {
    content: "What do you make of the fact that your brothers ran you down and came to you?",
    receivedCharacterCount: 77,
    receivedChunkCount: 3,
    terminal: "done",
  });
  assert.deepEqual(chunks, [
    "What do you make ",
    "of the fact that your brothers ",
    "ran you down and came to you?",
  ]);
});

test("handles boundaries split across fetch or XHR progress chunks", () => {
  const chunks = [];
  const accumulator = createSseAccumulator((chunk) => chunks.push(chunk));
  const response = 'data: {"delta":"first"}\r\n\r\ndata: {"delta":" second"}\r\n\r\ndata: [DONE]\r\n\r\n';

  for (const part of [response.slice(0, 4), response.slice(4, 29), response.slice(29, 54), response.slice(54)]) {
    accumulator.append(part);
  }

  assert.deepEqual(accumulator.flush(), {
    content: "first second",
    receivedCharacterCount: 12,
    receivedChunkCount: 2,
    terminal: "done",
  });
  assert.deepEqual(chunks, ["first", " second"]);
});

test("flushes a final unterminated data frame but reports missing terminal", () => {
  const chunks = [];
  const accumulator = createSseAccumulator((chunk) => chunks.push(chunk));

  accumulator.append('data: {"chunk":"came to"}');

  assert.deepEqual(accumulator.flush(), {
    content: "came to",
    receivedCharacterCount: 7,
    receivedChunkCount: 1,
    terminal: "missing",
  });
  assert.deepEqual(chunks, ["came to"]);
});

test("reports an explicit error and keeps content received before it", () => {
  const accumulator = createSseAccumulator();

  accumulator.append('data: "before error"\n\n');
  accumulator.append("data: [ERROR]");

  assert.deepEqual(accumulator.flush(), {
    content: "before error",
    receivedCharacterCount: 12,
    receivedChunkCount: 1,
    terminal: "error",
  });
});

test("preserves data whitespace and multiline SSE payloads", () => {
  const accumulator = createSseAccumulator();

  accumulator.append("data:   leading\ndata: trailing  \n\n");
  accumulator.append("data: [DONE]");

  assert.deepEqual(accumulator.flush(), {
    content: "  leading\ntrailing  ",
    receivedCharacterCount: 20,
    receivedChunkCount: 1,
    terminal: "done",
  });
});
