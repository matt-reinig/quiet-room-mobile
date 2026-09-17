#!/usr/bin/env node

import http from "node:http";

const host = process.env.STREAM_INTEGRITY_FIXTURE_HOST || "127.0.0.1";
const port = Number(process.env.STREAM_INTEGRITY_FIXTURE_PORT || 8765);

const COMPLETE_PROMPT = "stream-integrity-complete";
const INCOMPLETE_PROMPT = "stream-integrity-incomplete";
const COMPLETE_CONTENT =
  "A complete native stream preserves its final punctuation.";
const INCOMPLETE_PREFIX =
  "This is a deterministic native stream fixture. What do you make of the fact that your brothers were the ones who ran you down and came to";
const INCOMPLETE_CONTENT = `${INCOMPLETE_PREFIX} you?`;

const conversations = new Map();
const requests = [];
const clientEvents = [];

function recordRequest(request, extra = {}) {
  const entry = {
    method: request.method,
    path: new URL(request.url || "/", `http://${host}:${port}`).pathname,
    at: Date.now(),
    ...extra,
  };
  requests.push(entry);
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function sendJson(response, payload, status = 200) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "Cache-Control": "no-store",
    Connection: "close",
    "Content-Length": body.length,
    "Content-Type": "application/json",
  });
  response.end(body);
}

function sendSse(response, body) {
  const bytes = Buffer.from(body);
  response.writeHead(200, {
    "Cache-Control": "no-cache",
    Connection: "close",
    "Content-Length": bytes.length,
    "Content-Type": "text/event-stream",
  });
  response.end(bytes);
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function latestPrompt(payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const userMessage = [...messages]
    .reverse()
    .find((message) => message && message.role === "user");
  return typeof userMessage?.content === "string" ? userMessage.content : "";
}

function contentForPrompt(prompt) {
  return prompt === INCOMPLETE_PROMPT ? INCOMPLETE_CONTENT : COMPLETE_CONTENT;
}

function conversationMetadata(conversationId, conversation) {
  return {
    id: conversationId,
    title: conversation.prompt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    currentModel: "gpt-5.1-chat-latest",
  };
}

function conversationDetail(conversationId, conversation) {
  return {
    ...conversationMetadata(conversationId, conversation),
    messages: [
      {
        role: "user",
        content: conversation.prompt,
      },
      {
        role: "assistant",
        content: conversation.content,
        model: "gpt-5.1-chat-latest",
      },
    ],
  };
}

function fixtureState() {
  return {
    completePrompt: COMPLETE_PROMPT,
    incompletePrompt: INCOMPLETE_PROMPT,
    incompletePrefix: INCOMPLETE_PREFIX,
    incompleteContent: INCOMPLETE_CONTENT,
    requests,
    clientEvents,
    streamModes: [...conversations.entries()].map(([id, conversation]) => ({
      id,
      mode: conversation.mode,
    })),
    conversations: [...conversations.entries()].map(([id, conversation]) =>
      conversationDetail(id, conversation),
    ),
  };
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
  const pathname = requestUrl.pathname;
  let payload = null;

  if (request.method === "POST" || request.method === "PUT") {
    try {
      payload = await parseBody(request);
    } catch {
      recordRequest(request, { status: 400 });
      sendJson(response, { error: "Invalid JSON" }, 400);
      return;
    }
  }

  recordRequest(request);

  if (pathname === "/__fixture/reset" && request.method === "POST") {
    conversations.clear();
    requests.length = 0;
    clientEvents.length = 0;
    sendJson(response, { ok: true });
    return;
  }

  if (pathname === "/__fixture/state" && request.method === "GET") {
    sendJson(response, fixtureState());
    return;
  }

  if (pathname === "/health" && request.method === "GET") {
    sendJson(response, { status: "ok" });
    return;
  }

  if (pathname === "/api/feature_flags" && request.method === "GET") {
    sendJson(response, { env: "qa", values: {}, reasons: {} });
    return;
  }

  if (pathname === "/api/model_catalog" && request.method === "GET") {
    sendJson(response, { items: [] });
    return;
  }

  if (pathname === "/api/account/ai-consent" && request.method === "GET") {
    sendJson(response, { aiSharingAccepted: true });
    return;
  }

  if (pathname === "/api/account/ai-consent" && request.method === "PUT") {
    sendJson(response, { aiSharingAccepted: true });
    return;
  }

  if (pathname === "/api/account" && request.method === "GET") {
    sendJson(response, { aiSharingAccepted: true });
    return;
  }

  if (pathname === "/api/conversations" && request.method === "GET") {
    const items = [...conversations.entries()]
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .map(([id, conversation]) => conversationMetadata(id, conversation));
    sendJson(response, { items, nextCursor: null });
    return;
  }

  if (pathname.startsWith("/api/conversations/") && request.method === "GET") {
    const conversationId = decodeURIComponent(pathname.slice("/api/conversations/".length));
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      sendJson(response, { error: "not found" }, 404);
      return;
    }
    sendJson(response, conversationDetail(conversationId, conversation));
    return;
  }

  if (pathname === "/api/chat/stream" && request.method === "POST") {
    const conversationId = typeof payload?.conversation_id === "string"
      ? payload.conversation_id
      : "fixture-conversation";
    const prompt = latestPrompt(payload);
    const content = contentForPrompt(prompt);
    const now = Date.now();
    conversations.set(conversationId, {
      content,
      createdAt: now,
      mode: prompt === INCOMPLETE_PROMPT ? "missing_done" : "done",
      prompt,
      updatedAt: now,
    });

    if (prompt === INCOMPLETE_PROMPT) {
      // Deliberately successful HTTP with a complete SSE data frame but no
      // terminal marker. This is the native XHR tail-loss fixture.
      sendSse(
        response,
        `data: ${JSON.stringify({ chunk: INCOMPLETE_PREFIX })}\n\n`,
      );
      return;
    }

    const firstChunk = content.slice(0, Math.ceil(content.length / 2));
    const secondChunk = content.slice(firstChunk.length);
    sendSse(
      response,
      `data: ${JSON.stringify({ chunk: firstChunk })}\n\n` +
        `data: ${JSON.stringify({ chunk: secondChunk })}\n\n` +
        "data: [DONE]\n\n",
    );
    return;
  }

  if (pathname === "/api/client-events" && request.method === "POST") {
    clientEvents.push(payload || {});
    sendJson(response, { ok: true });
    return;
  }

  sendJson(response, { error: "not found" }, 404);
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    if (!response.headersSent) {
      sendJson(response, { error: "fixture failure" }, 500);
    } else {
      response.destroy();
    }
  });
});

server.listen(port, host, () => {
  process.stdout.write(
    `${JSON.stringify({ host, port, incompletePrefix: INCOMPLETE_PREFIX, incompleteContent: INCOMPLETE_CONTENT })}\n`,
  );
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
