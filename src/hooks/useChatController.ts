import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import type { User } from "firebase/auth";
import {
  API_BASE,
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  resolveStreamingUrl,
} from "../config/env";
import type { ChatMessage, Conversation, ConversationsById } from "../types/chat";

const STREAM_FLUSH_INTERVAL_MS = 120;
const CONVERSATIONS_PAGE_SIZE = 20;
const MIN_LOADING_MORE_VISIBLE_MS = 800;

type ConversationListPage = {
  items: Record<string, unknown>[];
  nextCursor: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeMessage(raw: unknown): ChatMessage | null {
  if (!isRecord(raw)) {
    return null;
  }

  const role = raw.role;
  const content = raw.content;

  if ((role !== "assistant" && role !== "user") || typeof content !== "string") {
    return null;
  }

  return {
    audioSrc: typeof raw.audioSrc === "string" ? raw.audioSrc : undefined,
    content,
    disableVoice:
      typeof raw.disableVoice === "boolean" ? raw.disableVoice : undefined,
    isStreaming:
      typeof raw.isStreaming === "boolean" ? raw.isStreaming : undefined,
    model: typeof raw.model === "string" ? raw.model : undefined,
    role,
  };
}

function normalizeConversationListPayload(payload: unknown): ConversationListPage {
  if (Array.isArray(payload)) {
    return {
      items: payload.filter((item): item is Record<string, unknown> => isRecord(item)),
      nextCursor: null,
    };
  }

  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return { items: [], nextCursor: null };
  }

  return {
    items: payload.items.filter((item): item is Record<string, unknown> => isRecord(item)),
    nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
  };
}

function mergeConversationPage(
  previous: ConversationsById,
  items: Record<string, unknown>[]
): ConversationsById {
  const next: ConversationsById = { ...previous };

  for (const item of items) {
    const id = typeof item.id === "string" ? item.id : "";

    if (!id) {
      continue;
    }

    const existing = previous[id];

    next[id] = {
      ...existing,
      createdAt:
        typeof item.createdAt === "number"
          ? item.createdAt
          : existing?.createdAt,
      currentModel:
        typeof item.currentModel === "string"
          ? item.currentModel
          : existing?.currentModel || DEFAULT_MODEL,
      id,
      messages: existing?.messages || [],
      messagesLoaded: existing?.messagesLoaded ?? false,
      title: typeof item.title === "string" ? item.title : existing?.title || "New Chat",
      updatedAt:
        typeof item.updatedAt === "number"
          ? item.updatedAt
          : existing?.updatedAt,
    };
  }

  return next;
}

function decodeSseChunk(data: string): string {
  if (!data || data === "[DONE]" || data === "[ERROR]") {
    return "";
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
    return data;
  }

  return "";
}

function createSseAccumulator(onChunk: (chunk: string) => void) {
  let buffer = "";
  let fullContent = "";

  const handleFrame = (frame: string) => {
    const lines = frame.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const payload = trimmed.slice(5).trimStart();

      if (payload === "[DONE]" || payload === "[ERROR]") {
        continue;
      }

      const chunk = decodeSseChunk(payload);

      if (!chunk) {
        continue;
      }

      fullContent += chunk;
      onChunk(chunk);
    }
  };

  return {
    append(textChunk: string) {
      if (!textChunk) {
        return;
      }

      buffer += textChunk;

      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";

      for (const frame of frames) {
        handleFrame(frame);
      }
    },
    flush() {
      if (buffer.trim()) {
        handleFrame(buffer);
      }

      buffer = "";
      return fullContent;
    },
  };
}

async function readSseResponse(
  response: Response,
  onChunk: (chunk: string) => void
): Promise<string> {
  const accumulator = createSseAccumulator(onChunk);

  const hasReadableStream =
    response.body && typeof response.body.getReader === "function";

  if (hasReadableStream) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      accumulator.append(buffer);
      buffer = "";
    }

    buffer += decoder.decode();
    accumulator.append(buffer);
    return accumulator.flush();
  }

  accumulator.append(await response.text());
  return accumulator.flush();
}

async function readSseResponseFromXhr(options: {
  body: string;
  headers: Record<string, string>;
  onChunk: (chunk: string) => void;
  url: string;
}): Promise<string> {
  const accumulator = createSseAccumulator(options.onChunk);

  return await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let seenLength = 0;
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    const consumeProgress = () => {
      const responseText = xhr.responseText || "";

      if (responseText.length <= seenLength) {
        return;
      }

      accumulator.append(responseText.slice(seenLength));
      seenLength = responseText.length;
    };

    xhr.open("POST", options.url, true);

    for (const [headerName, headerValue] of Object.entries(options.headers)) {
      xhr.setRequestHeader(headerName, headerValue);
    }

    xhr.onprogress = consumeProgress;

    xhr.onload = () => {
      consumeProgress();

      if (xhr.status >= 200 && xhr.status < 300) {
        settle(() => resolve(accumulator.flush()));
        return;
      }

      const detail = (xhr.responseText || "").trim();
      settle(() => reject(new Error(`Chat failed: ${xhr.status} ${detail}`.trim())));
    };

    xhr.onerror = () => {
      settle(() => reject(new Error("Chat failed: network request failed.")));
    };

    xhr.onabort = () => {
      settle(() => reject(new Error("Chat request was aborted.")));
    };

    xhr.send(options.body);
  });
}

function buildConversationTitle(message: string): string {
  const words = message.split(/\s+/).filter(Boolean).slice(0, 20).join(" ");
  return words.length ? `${words}...` : "New Chat";
}

function generateConversationId(): string {
  const maybeCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;

  if (maybeCrypto && typeof maybeCrypto.randomUUID === "function") {
    return maybeCrypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type UseChatControllerArgs = {
  isAnon: boolean;
  user: User | null;
};

type UseChatControllerResult = {
  chatLoading: boolean;
  conversationList: Conversation[];
  createNewChat: () => void;
  currentId: string | null;
  currentModel: string;
  deleteConversation: (conversationId: string) => Promise<void>;
  hasMoreConversations: boolean;
  input: string;
  isNewChat: boolean;
  loadMoreConversations: () => Promise<void>;
  loading: boolean;
  loadingMoreConversations: boolean;
  messages: ChatMessage[];
  modelOptions: string[];
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  sendMessage: (overrideText?: string) => Promise<void>;
  setCurrentId: (id: string | null) => void;
  setCurrentModel: (model: string) => void;
  setInput: (value: string) => void;
  shouldBlockForConversations: boolean;
  showThinking: boolean;
  sidebarLoading: boolean;
};

export function useChatController({
  isAnon,
  user,
}: UseChatControllerArgs): UseChatControllerResult {
  const [conversations, setConversations] = useState<ConversationsById>({});
  const [conversationsHydrated, setConversationsHydrated] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState("");
  const [streamingModel, setStreamingModel] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [nextConversationCursor, setNextConversationCursor] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState(DEFAULT_MODEL);

  const chatLoadRequestIdRef = useRef(0);

  useEffect(() => {
    if (!user) {
      setConversations({});
      setCurrentId(null);
      setCurrentModel(DEFAULT_MODEL);
      setSidebarLoading(false);
      setLoadingMoreConversations(false);
      setNextConversationCursor(null);
      setConversationsHydrated(false);
      return;
    }

    if (isAnon) {
      setConversations({});
      setCurrentId(null);
      setCurrentModel(DEFAULT_MODEL);
      setSidebarLoading(false);
      setLoadingMoreConversations(false);
      setNextConversationCursor(null);
      setConversationsHydrated(true);
      return;
    }

    let cancelled = false;

    setConversationsHydrated(false);
    setSidebarLoading(true);

    const loadConversations = async () => {
      try {
        const idToken = await user.getIdToken(true);

        const response = await fetch(`${API_BASE}/api/conversations`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!response.ok) {
          console.error("Failed to load conversations:", response.status);
          return;
        }

        if (cancelled) {
          return;
        }

        const payload = normalizeConversationListPayload((await response.json()) as unknown);
        const mapped = mergeConversationPage({}, payload.items);
        const sorted = Object.values(mapped).sort(
          (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
        );

        setConversations(mapped);
        setNextConversationCursor(payload.nextCursor);
        setCurrentId((previous) => {
          if (previous && mapped[previous]) {
            return previous;
          }

          return sorted[0]?.id || null;
        });
      } catch (error) {
        console.error("Failed to load conversations", error);
      } finally {
        if (!cancelled) {
          setSidebarLoading(false);
          setConversationsHydrated(true);
        }
      }
    };

    void loadConversations();

    return () => {
      cancelled = true;
    };
  }, [isAnon, user]);

  useEffect(() => {
    if (!user || isAnon || !currentId) {
      return;
    }

    const conversation = conversations[currentId];

    if (!conversation || conversation.messagesLoaded) {
      return;
    }

    const requestId = (chatLoadRequestIdRef.current += 1);
    const abortController = new AbortController();

    setChatLoading(true);

    const loadConversation = async () => {
      try {
        const idToken = await user.getIdToken(true);

        const response = await fetch(`${API_BASE}/api/conversations/${currentId}`, {
          headers: { Authorization: `Bearer ${idToken}` },
          signal: abortController.signal,
        });

        if (!response.ok) {
          console.error("Failed to load conversation:", currentId, response.status);

          if (requestId === chatLoadRequestIdRef.current) {
            setConversations((previous) => {
              const previousConversation = previous[currentId];

              if (!previousConversation) {
                return previous;
              }

              return {
                ...previous,
                [currentId]: {
                  ...previousConversation,
                  messagesLoaded: true,
                },
              };
            });
          }

          return;
        }

        if (requestId !== chatLoadRequestIdRef.current) {
          return;
        }

        const dataRaw = (await response.json()) as unknown;
        const data = isRecord(dataRaw) ? dataRaw : {};

        const fetchedMessagesRaw = Array.isArray(data.messages) ? data.messages : [];
        const fetchedMessages = fetchedMessagesRaw
          .map((message) => normalizeMessage(message))
          .filter((message): message is ChatMessage => Boolean(message));

        const latestModelFromMessages = [...fetchedMessages]
          .reverse()
          .find((message) => typeof message.model === "string")?.model;

        const resolvedModel =
          typeof data.currentModel === "string"
            ? data.currentModel
            : latestModelFromMessages || DEFAULT_MODEL;

        setConversations((previous) => {
          const previousConversation = previous[currentId] || {
            id: currentId,
            messages: [],
          };

          return {
            ...previous,
            [currentId]: {
              ...previousConversation,
              currentModel: resolvedModel,
              id: currentId,
              messages: fetchedMessages,
              messagesLoaded: true,
              title:
                typeof data.title === "string"
                  ? data.title
                  : previousConversation.title || "New Chat",
              updatedAt:
                typeof data.updatedAt === "number"
                  ? data.updatedAt
                  : previousConversation.updatedAt,
            },
          };
        });
      } catch (error) {
        if ((error as Error | null)?.name === "AbortError") {
          return;
        }

        console.error("Failed to load messages", error);

        if (requestId === chatLoadRequestIdRef.current) {
          setConversations((previous) => {
            const previousConversation = previous[currentId];

            if (!previousConversation) {
              return previous;
            }

            return {
              ...previous,
              [currentId]: {
                ...previousConversation,
                messagesLoaded: true,
              },
            };
          });
        }
      } finally {
        if (requestId === chatLoadRequestIdRef.current) {
          setChatLoading(false);
        }
      }
    };

    void loadConversation();

    return () => {
      abortController.abort();
    };
  }, [conversations, currentId, isAnon, user]);

  useEffect(() => {
    if (!currentId) {
      return;
    }

    const conversation = conversations[currentId];

    if (!conversation) {
      return;
    }

    const latestModel =
      conversation.currentModel ||
      [...(conversation.messages || [])]
        .reverse()
        .find((message) => typeof message.model === "string")?.model;

    if (latestModel && latestModel !== currentModel) {
      setCurrentModel(latestModel);
    }
  }, [conversations, currentId, currentModel]);

  const createNewChat = useCallback(() => {
    setCurrentId(null);
    setInput("");
    setPartial("");
    setShowThinking(false);
    setStreamingModel(null);
  }, []);

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (typeof overrideText === "string" ? overrideText : input).trim();

      if (!text || !user) {
        return;
      }

      const now = Date.now();
      const conversationId = currentId || generateConversationId();

      const previousMessages = conversations[conversationId]?.messages || [];
      const userMessage: ChatMessage = {
        content: text,
        model: currentModel,
        role: "user",
      };

      const outgoingMessages = [...previousMessages, userMessage];
      const existingConversation = conversations[conversationId];

      const shouldRename =
        (!existingConversation || existingConversation.title === "New Chat") &&
        outgoingMessages.length === 1;

      const title = shouldRename
        ? buildConversationTitle(text)
        : existingConversation?.title || "New Chat";

      setConversations((previous) => {
        const previousConversation = previous[conversationId];

        return {
          ...previous,
          [conversationId]: {
            createdAt: previousConversation?.createdAt || now,
            currentModel,
            id: conversationId,
            messages: outgoingMessages,
            messagesLoaded: true,
            title,
            updatedAt: now,
          },
        };
      });

      setCurrentId(conversationId);
      setInput("");
      setLoading(true);
      setPartial("");
      setStreamingModel(currentModel);
      setShowThinking(true);

      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      try {
        const idToken = await user.getIdToken();

        const payload = {
          conversation_id: conversationId,
          messages: outgoingMessages,
          model: currentModel,
          tz_offset_minutes: new Date().getTimezoneOffset(),
        };

        const requestBody = JSON.stringify(payload);
        const requestHeaders = {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        };

        let renderedContent = "";
        let pendingForRender = "";

        const flushPartial = () => {
          if (!pendingForRender) {
            return;
          }

          setPartial(renderedContent);
          pendingForRender = "";
          flushTimer = null;
        };

        const handleChunk = (chunk: string) => {
          renderedContent += chunk;
          pendingForRender += chunk;

          if (!flushTimer) {
            flushTimer = setTimeout(flushPartial, STREAM_FLUSH_INTERVAL_MS);
          }

          if (chunk.trim()) {
            setShowThinking(false);
          }
        };

        const streamContent =
          Platform.OS === "web"
            ? await (async () => {
                const response = await fetch(resolveStreamingUrl(), {
                  body: requestBody,
                  headers: requestHeaders,
                  method: "POST",
                });

                if (!response.ok) {
                  const detail = await response.text().catch(() => "");
                  throw new Error(`Chat failed: ${response.status} ${detail}`);
                }

                return readSseResponse(response, handleChunk);
              })()
            : await readSseResponseFromXhr({
                body: requestBody,
                headers: requestHeaders,
                onChunk: handleChunk,
                url: resolveStreamingUrl(),
              });

        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }

        if (pendingForRender) {
          setPartial(renderedContent);
          pendingForRender = "";
        }

        const finalContent = (streamContent || renderedContent).trim();

        if (!finalContent) {
          throw new Error("No assistant content returned.");
        }

        const assistantMessage: ChatMessage = {
          content: finalContent,
          model: currentModel,
          role: "assistant",
        };

        setConversations((previous) => {
          const previousConversation = previous[conversationId];
          const baselineMessages = previousConversation?.messages || outgoingMessages;

          const shouldAppendUserMessage =
            !baselineMessages.length ||
            baselineMessages[baselineMessages.length - 1].role !== "user" ||
            baselineMessages[baselineMessages.length - 1].content !== userMessage.content;

          const messagesWithUser = shouldAppendUserMessage
            ? [...baselineMessages, userMessage]
            : baselineMessages;

          return {
            ...previous,
            [conversationId]: {
              createdAt: previousConversation?.createdAt || now,
              currentModel,
              id: conversationId,
              messages: [...messagesWithUser, assistantMessage],
              messagesLoaded: true,
              title,
              updatedAt: Date.now(),
            },
          };
        });

        setPartial("");
      } catch (error) {
        console.error(error);

        const message =
          error instanceof Error
            ? error.message
            : "Something went wrong talking to Quiet Room.";

        Alert.alert("Quiet Room", message);
      } finally {
        if (flushTimer) {
          clearTimeout(flushTimer);
        }

        setShowThinking(false);
        setStreamingModel(null);
        setLoading(false);
      }
    },
    [conversations, currentId, currentModel, input, user]
  );

  const loadMoreConversations = useCallback(async () => {
    if (
      !user ||
      isAnon ||
      !nextConversationCursor ||
      sidebarLoading ||
      loadingMoreConversations
    ) {
      return;
    }

    const startedAt = Date.now();
    setLoadingMoreConversations(true);

    try {
      const idToken = await user.getIdToken(true);
      const query = `limit=${CONVERSATIONS_PAGE_SIZE}&cursor=${encodeURIComponent(nextConversationCursor)}`;
      const response = await fetch(`${API_BASE}/api/conversations?${query}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!response.ok) {
        console.error("Failed to load more conversations:", response.status);
        return;
      }

      const payload = normalizeConversationListPayload((await response.json()) as unknown);

      setConversations((previous) => mergeConversationPage(previous, payload.items));
      setNextConversationCursor(payload.nextCursor);
    } catch (error) {
      console.error("Failed to load more conversations", error);
    } finally {
      const elapsed = Date.now() - startedAt;
      const remaining = MIN_LOADING_MORE_VISIBLE_MS - elapsed;

      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      setLoadingMoreConversations(false);
    }
  }, [isAnon, loadingMoreConversations, nextConversationCursor, sidebarLoading, user]);

  const renameConversation = useCallback(
    async (conversationId: string, title: string) => {
      if (!user || !conversationId) {
        return;
      }

      const trimmed = typeof title === "string" ? title.trim() : "";

      if (!trimmed) {
        throw new Error("Title cannot be empty");
      }

      const idToken = await user.getIdToken(true);

      const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
        body: JSON.stringify({ title: trimmed }),
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Rename failed: ${response.status} ${detail}`);
      }

      const payload = (await response.json().catch(() => ({}))) as Partial<{
        title: string;
      }>;

      const updatedTitle = payload.title || trimmed;

      setConversations((previous) => {
        if (!previous[conversationId]) {
          return previous;
        }

        return {
          ...previous,
          [conversationId]: {
            ...previous[conversationId],
            title: updatedTitle,
          },
        };
      });
    },
    [user]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!user || !conversationId) {
        return;
      }

      const idToken = await user.getIdToken(true);

      const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
        method: "DELETE",
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Delete failed: ${response.status} ${detail}`);
      }

      setConversations((previous) => {
        if (!previous[conversationId]) {
          return previous;
        }

        const { [conversationId]: removedConversation, ...rest } = previous;

        void removedConversation;

        setCurrentId((previousCurrent) => {
          if (previousCurrent !== conversationId) {
            return previousCurrent;
          }

          const nextConversation = Object.values(rest).sort(
            (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
          )[0];

          return nextConversation?.id || null;
        });

        return rest;
      });
    },
    [user]
  );

  const conversationList = useMemo(() => {
    return Object.values(conversations).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );
  }, [conversations]);

  const activeConversation = currentId ? conversations[currentId] : null;

  const activeConversationLoaded =
    currentId == null ? true : Boolean(activeConversation?.messagesLoaded);

  const resolvedChatLoading =
    sidebarLoading ||
    chatLoading ||
    (Boolean(user) && !isAnon && Boolean(currentId) && !activeConversationLoaded);

  const shouldBlockForConversations = Boolean(user) && !isAnon && !conversationsHydrated;

  const baseMessages = activeConversation?.messages || [];

  const messages = useMemo<ChatMessage[]>(() => {
    if (!partial) {
      return baseMessages;
    }

    return [
      ...baseMessages,
      {
        content: partial,
        isStreaming: true,
        model: streamingModel || currentModel,
        role: "assistant",
      },
    ];
  }, [baseMessages, currentModel, partial, streamingModel]);

  return {
    chatLoading: resolvedChatLoading,
    conversationList,
    createNewChat,
    currentId,
    currentModel,
    deleteConversation,
    hasMoreConversations: Boolean(nextConversationCursor),
    input,
    isNewChat: currentId == null,
    loadMoreConversations,
    loading,
    loadingMoreConversations,
    messages,
    modelOptions: MODEL_OPTIONS,
    renameConversation,
    sendMessage,
    setCurrentId,
    setCurrentModel,
    setInput,
    shouldBlockForConversations,
    showThinking,
    sidebarLoading,
  };
}

