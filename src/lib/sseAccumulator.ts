/**
 * Small, platform-neutral SSE reader state machine.
 *
 * Both fetch ReadableStreams and native XHR progress events can feed arbitrary
 * pieces of response text to `append`.  A response is only complete when the
 * server sends the explicit `[DONE]` event; an HTTP 2xx response by itself is
 * not enough to establish that the assistant response was persisted fully.
 */

export type SseTerminal = "done" | "error" | "missing";

export type SseAccumulatorResult = {
  content: string;
  receivedCharacterCount: number;
  receivedChunkCount: number;
  terminal: SseTerminal;
};

export type SseAccumulator = {
  append: (text: string) => void;
  flush: () => SseAccumulatorResult;
};

type DecodedChunk = string | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeDataPayload(data: string): DecodedChunk {
  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;

    if (typeof parsed === "string") {
      return parsed;
    }

    if (isRecord(parsed)) {
      if (typeof parsed.chunk === "string") {
        return parsed.chunk;
      }

      if (typeof parsed.delta === "string") {
        return parsed.delta;
      }
    }
  } catch {
    // Plain-text SSE data is supported for simple fixtures and older servers.
    return data;
  }

  return null;
}

function firstEventBoundary(text: string): { index: number; length: number } | null {
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === "\n" && text[index + 1] === "\n") {
      return { index, length: 2 };
    }

    if (character === "\r" && text[index + 1] === "\r") {
      return { index, length: 2 };
    }

    if (
      character === "\r" &&
      text[index + 1] === "\n" &&
      text[index + 2] === "\r" &&
      text[index + 3] === "\n"
    ) {
      return { index, length: 4 };
    }
  }

  return null;
}

function splitSseLines(frame: string): string[] {
  return frame.split(/\r\n|\n|\r/);
}

/**
 * Creates an accumulator that can be shared by fetch and XHR response
 * readers. `onChunk` receives decoded content exactly as supplied by each
 * SSE data event (including intentional whitespace and newlines).
 */
export function createSseAccumulator(
  onChunk: (chunk: string) => void = () => undefined,
): SseAccumulator {
  let buffer = "";
  let content = "";
  let receivedCharacterCount = 0;
  let receivedChunkCount = 0;
  let terminal: Exclude<SseTerminal, "missing"> | null = null;
  let flushed = false;

  const handleFrame = (frame: string): void => {
    if (flushed || terminal) {
      return;
    }

    const dataLines: string[] = [];

    for (const line of splitSseLines(frame)) {
      // Comments, event/id/retry fields, and unknown fields are intentionally
      // ignored. SSE permits a single optional space after the field colon.
      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
      dataLines.push(payload);
    }

    if (dataLines.length === 0) {
      return;
    }

    const data = dataLines.join("\n");

    if (data === "[DONE]") {
      terminal = "done";
      return;
    }

    if (data === "[ERROR]") {
      terminal = "error";
      return;
    }

    const chunk = decodeDataPayload(data);

    if (chunk === null) {
      return;
    }

    content += chunk;
    receivedCharacterCount += chunk.length;
    receivedChunkCount += 1;
    onChunk(chunk);
  };

  return {
    append(text: string): void {
      if (flushed || !text) {
        return;
      }

      buffer += text;

      let boundary = firstEventBoundary(buffer);

      while (boundary) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        handleFrame(frame);
        boundary = firstEventBoundary(buffer);
      }
    },

    flush(): SseAccumulatorResult {
      if (!flushed) {
        if (buffer.trim()) {
          handleFrame(buffer);
        }

        buffer = "";
        flushed = true;
      }

      return {
        content,
        receivedCharacterCount,
        receivedChunkCount,
        terminal: terminal || "missing",
      };
    },
  };
}
