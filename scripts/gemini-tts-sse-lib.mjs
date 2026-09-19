/* Shared, incremental Interactions SSE parsing with partial-evidence retention. */

function asAsyncIterable(body) {
  if (!body) throw new Error("provider response has no body");
  if (body[Symbol.asyncIterator]) return body;
  if (body.getReader) {
    const reader = body.getReader();
    return { async *[Symbol.asyncIterator]() { while (true) { const item = await reader.read(); if (item.done) return; yield item.value; } } };
  }
  throw new Error("provider response body is not an async iterable");
}

function eventType(value) {
  return String(value?.event_type || value?.type || value?.event || "").toLowerCase();
}

function audioFromEvent(value, defaultMimeType) {
  if (!value || typeof value !== "object") return null;
  const likelyAudio = /audio|pcm|delta|content/.test(eventType(value)) || value.delta?.type === "audio";
  const seen = new Set();
  const walk = (node, key = "") => {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    if (typeof node.data === "string" && (likelyAudio || /audio|pcm|inline|data/i.test(key))) {
      const bytes = Buffer.from(node.data, "base64");
      if (bytes.length) return { bytes, mimeType: node.mimeType || node.mime_type || node.contentType || defaultMimeType };
    }
    for (const [childKey, child] of Object.entries(node)) {
      const found = walk(child, childKey);
      if (found) return found;
    }
    return null;
  };
  return walk(value);
}

function stableReadError(error) {
  if (error?.name === "AbortError" || error?.code === "ABORT_ERR") return "aborted";
  return "stream_read_error";
}

export async function readInteractionsSse(response, {
  elapsedMs = () => 0,
  sanitize = (value) => value,
  defaultMimeType = "audio/pcm",
} = {}) {
  const decoder = new TextDecoder();
  let carry = "";
  let eventName = "message";
  let dataLines = [];
  let eventIndex = 0;
  let totalBytes = 0;
  let readError = null;
  const events = [];
  const audioParts = [];
  const audioDeltas = [];

  const dispatch = () => {
    if (!dataLines.length) { eventName = "message"; return; }
    const raw = dataLines.join("\n");
    let data = raw;
    try { data = JSON.parse(raw); } catch { /* retain sanitized malformed payload */ }
    const at = elapsedMs();
    const audio = audioFromEvent(data, defaultMimeType);
    const event = { index: eventIndex++, name: eventName, elapsedMs: at, data: sanitize(data) };
    if (audio) {
      totalBytes += audio.bytes.length;
      audioParts.push(audio.bytes);
      audioDeltas.push({ bytes: audio.bytes, mimeType: String(audio.mimeType || defaultMimeType) });
      event.audioDelta = { bytes: audio.bytes.length, totalBytes, mimeType: String(audio.mimeType || defaultMimeType), elapsedMs: at };
    }
    events.push(event);
    eventName = "message";
    dataLines = [];
  };

  const consumeLine = (line) => {
    if (line === "") { dispatch(); return; }
    if (line.startsWith(":")) return;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
  };

  try {
    for await (const chunk of asAsyncIterable(response.body)) {
      carry += decoder.decode(typeof chunk === "string" ? Buffer.from(chunk) : chunk, { stream: true });
      const lines = carry.split(/\r?\n/);
      carry = lines.pop() || "";
      for (const line of lines) consumeLine(line);
    }
    carry += decoder.decode();
  } catch (error) {
    readError = stableReadError(error);
    try { carry += decoder.decode(); } catch { /* retain already parsed evidence */ }
  }
  if (carry.length) {
    for (const line of carry.split(/\r?\n/)) consumeLine(line);
  }
  if (dataLines.length) dispatch();
  return {
    events,
    audio: Buffer.concat(audioParts),
    totalBytes,
    mimeType: events.filter((event) => event.audioDelta).at(-1)?.audioDelta.mimeType || null,
    deltas: events.filter((event) => event.audioDelta).map((event) => event.audioDelta),
    audioDeltas,
    readError,
  };
}
