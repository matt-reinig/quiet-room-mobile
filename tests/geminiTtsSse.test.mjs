import assert from "node:assert/strict";
import test from "node:test";

import { readInteractionsSse } from "../scripts/gemini-tts-sse-lib.mjs";

function bodyFrom(chunks, failure = null) {
  return { async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield Buffer.from(chunk); if (failure) throw failure; } };
}

test("parses split CRLF chunks and a final event without a trailing blank line", async () => {
  const pcm = Buffer.from([1, 0, 2, 0]).toString("base64");
  const raw = `event: step.delta\r\ndata: ${JSON.stringify({ event_type: "step.delta", delta: { type: "audio", mime_type: "audio/l16", data: pcm } })}\r\n\r\nevent: interaction.completed\r\ndata: ${JSON.stringify({ event_type: "interaction.completed", interaction: { status: "completed" } })}`;
  const cuts = [raw.slice(0, 7), raw.slice(7, 31), raw.slice(31, 79), raw.slice(79)];
  const parsed = await readInteractionsSse({ body: bodyFrom(cuts) });
  assert.equal(parsed.events.length, 2);
  assert.deepEqual(parsed.audio, Buffer.from([1, 0, 2, 0]));
  assert.equal(parsed.events[1].data.event_type, "interaction.completed");
  assert.equal(parsed.readError, null);
});

test("retains parsed audio and events when the reader fails", async () => {
  const pcm = Buffer.from([3, 0, 4, 0]).toString("base64");
  const parsed = await readInteractionsSse({
    body: bodyFrom([`event: step.delta\ndata: ${JSON.stringify({ event_type: "step.delta", delta: { type: "audio", data: pcm } })}\n\n`], new Error("private transport detail")),
  });
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.audio.length, 4);
  assert.equal(parsed.readError, "stream_read_error");
  assert.equal(JSON.stringify(parsed).includes("private transport detail"), false);
});
