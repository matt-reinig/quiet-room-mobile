import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "firebase/auth";
import {
  API_BASE,
  DEFAULT_MODEL,
  resolveStreamingUrl,
} from "../config/env";
import { useFeatureFlags } from "../contexts/FeatureFlagsContext";
import {
  logicalKeyForChatModel,
  normalizeChatModelKey,
  parseChatModelCatalog,
  requestModelForChatModel,
  resolveEnabledChatModelOptions,
  type ChatModelOption,
} from "../lib/chatModels";
import { getIdTokenWithAnonymousRecovery } from "../lib/firebase";
import {
  invalidateConversationQueries,
  queryClient,
  queryKeys,
  removeConversationQuery,
} from "../lib/queryClient";
import { sendClientEvent } from "../lib/clientEvents";
import {
  createSseAccumulator,
  type SseAccumulatorResult,
} from "../lib/sseAccumulator";
import type {
  ChatMessage,
  Conversation,
  ConversationSearchResult,
  ConversationsById,
} from "../types/chat";

const STREAM_FLUSH_INTERVAL_MS = 120;
const CONVERSATIONS_PAGE_SIZE = 20;
const MIN_LOADING_MORE_VISIBLE_MS = 800;
const ACTIVE_CONVERSATION_STORAGE_PREFIX = "quiet-room.active-conversation";
const CANONICAL_READBACK_DELAYS_MS = [0, 250, 750] as const;

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
    logicalModelKey:
      typeof raw.logicalModelKey === "string" ? raw.logicalModelKey : undefined,
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
  items: Record<string, unknown>[],
  modelOptions: readonly ChatModelOption[],
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
      currentModel: normalizeChatModelKey(
        typeof item.logicalModelKey === "string"
          ? item.logicalModelKey
          : typeof item.currentModel === "string"
            ? item.currentModel
            : existing?.currentModel || DEFAULT_MODEL,
        modelOptions,
      ),
      id,
      logicalModelKey:
        typeof item.logicalModelKey === "string"
          ? item.logicalModelKey
          : existing?.logicalModelKey,
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

function activeConversationStorageKey(uid: string): string {
  return `${ACTIVE_CONVERSATION_STORAGE_PREFIX}.${uid}`;
}

function compareConversations(a: Conversation, b: Conversation): number {
  const updatedAtDifference = (b.updatedAt || 0) - (a.updatedAt || 0);

  if (updatedAtDifference !== 0) {
    return updatedAtDifference;
  }

  const createdAtDifference = (b.createdAt || 0) - (a.createdAt || 0);

  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return b.id.localeCompare(a.id);
}

async function fetchChatModelCatalog(
  user: User,
  isCancelled: () => boolean,
): Promise<ChatModelOption[]> {
  let tokenResult = await getIdTokenWithAnonymousRecovery(user);

  if (isCancelled()) {
    return [];
  }

  return queryClient.fetchQuery({
    queryKey: queryKeys.modelCatalog(tokenResult.user.uid),
    queryFn: async ({ signal }) => {
      let response = await fetch(`${API_BASE}/api/model_catalog`, {
        headers: { Authorization: `Bearer ${tokenResult.idToken}` },
        signal,
      });

      if (response.status === 401) {
        tokenResult = await getIdTokenWithAnonymousRecovery(tokenResult.user, true);
        response = await fetch(`${API_BASE}/api/model_catalog`, {
          headers: { Authorization: `Bearer ${tokenResult.idToken}` },
          signal,
        });
      }

      if (!response.ok) {
        throw new Error(`Failed to load model catalog: ${response.status}`);
      }

      return parseChatModelCatalog((await response.json()) as unknown);
    },
  });
}

type ChatStreamFailureReason =
  | "aborted"
  | "explicit_error"
  | "missing_done"
  | "network_error";

class ChatStreamIntegrityError extends Error {
  readonly reason: ChatStreamFailureReason;
  readonly receivedCharacterCount: number;
  readonly receivedChunkCount: number;

  constructor(
    reason: ChatStreamFailureReason,
    result: Pick<SseAccumulatorResult, "receivedCharacterCount" | "receivedChunkCount">,
  ) {
    super("The response was interrupted. Please try again.");
    this.name = "ChatStreamIntegrityError";
    this.reason = reason;
    this.receivedCharacterCount = result.receivedCharacterCount;
    this.receivedChunkCount = result.receivedChunkCount;
  }
}

function requireCompletedStream(result: SseAccumulatorResult): string {
  if (result.terminal === "done") {
    return result.content;
  }

  throw new ChatStreamIntegrityError(
    result.terminal === "error" ? "explicit_error" : "missing_done",
    result,
  );
}

async function readSseResponse(
  response: Response,
  onChunk: (chunk: string) => void
): Promise<string> {
  const accumulator = createSseAccumulator(onChunk);

  try {
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
      return requireCompletedStream(accumulator.flush());
    }

    accumulator.append(await response.text());
    return requireCompletedStream(accumulator.flush());
  } catch (error) {
    if (error instanceof ChatStreamIntegrityError) {
      throw error;
    }

    throw new ChatStreamIntegrityError("network_error", accumulator.flush());
  }
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
        settle(() => {
          try {
            resolve(requireCompletedStream(accumulator.flush()));
          } catch (error) {
            reject(error);
          }
        });
        return;
      }

      const detail = (xhr.responseText || "").trim();
      settle(() => reject(new Error(`Chat failed: ${xhr.status} ${detail}`.trim())));
    };

    xhr.onerror = () => {
      settle(() => {
        const result = accumulator.flush();
        reject(new ChatStreamIntegrityError("network_error", result));
      });
    };

    xhr.onabort = () => {
      settle(() => {
        const result = accumulator.flush();
        reject(new ChatStreamIntegrityError("aborted", result));
      });
    };

    xhr.send(options.body);
  });
}

async function fetchConversationDetail(options: {
  conversationId: string;
  idToken: string;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${API_BASE}/api/conversations/${options.conversationId}`,
    {
      headers: { Authorization: `Bearer ${options.idToken}` },
      signal: options.signal,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load conversation ${options.conversationId}: ${response.status}`,
    );
  }

  const payload = (await response.json()) as unknown;
  return isRecord(payload) ? payload : {};
}

function normalizedMessagesFromConversation(
  data: Record<string, unknown>,
): ChatMessage[] {
  const messages = Array.isArray(data.messages) ? data.messages : [];
  return messages
    .map((message) => normalizeMessage(message))
    .filter((message): message is ChatMessage => Boolean(message));
}

function hasCanonicalAssistantForUser(
  messages: readonly ChatMessage[],
  userMessage: ChatMessage,
): boolean {
  const assistantMessage = messages[messages.length - 1];
  const precedingMessage = messages[messages.length - 2];

  return (
    assistantMessage?.role === "assistant" &&
    precedingMessage?.role === "user" &&
    precedingMessage.content === userMessage.content
  );
}

async function fetchCanonicalConversationForTurn(options: {
  conversationId: string;
  idToken: string;
  userMessage: ChatMessage;
}): Promise<Record<string, unknown> | null> {
  for (const delayMs of CANONICAL_READBACK_DELAYS_MS) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      const data = await fetchConversationDetail(options);
      const messages = normalizedMessagesFromConversation(data);

      if (hasCanonicalAssistantForUser(messages, options.userMessage)) {
        return data;
      }
    } catch (error) {
      console.warn("Canonical conversation readback failed", error);
    }
  }

  return null;
}

function mergeCanonicalConversation(options: {
  conversationId: string;
  data: Record<string, unknown>;
  modelOptions: readonly ChatModelOption[];
  previous?: Conversation;
}): Conversation {
  const { conversationId, data, modelOptions, previous } = options;
  const messages = normalizedMessagesFromConversation(data);
  const latestModelFromMessages = [...messages]
    .reverse()
    .find((message) => typeof message.model === "string")?.model;
  const currentModel = normalizeChatModelKey(
    typeof data.logicalModelKey === "string"
      ? data.logicalModelKey
      : typeof data.currentModel === "string"
        ? data.currentModel
        : latestModelFromMessages || previous?.currentModel || DEFAULT_MODEL,
    modelOptions,
  );

  return {
    ...previous,
    currentModel,
    id: conversationId,
    logicalModelKey:
      typeof data.logicalModelKey === "string"
        ? data.logicalModelKey
        : previous?.logicalModelKey,
    messages,
    messagesLoaded: true,
    title:
      typeof data.title === "string"
        ? data.title
        : previous?.title || "New Chat",
    updatedAt:
      typeof data.updatedAt === "number" ? data.updatedAt : previous?.updatedAt,
  };
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
  onOptimisticUserMessage?: (payload: {
    content: string;
    messageIndex: number;
  }) => void;
  onSendAborted?: () => void;
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
  modelOptions: ChatModelOption[];
  openConversation: (conversation: Conversation | ConversationSearchResult | string) => void;
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
  onOptimisticUserMessage,
  onSendAborted,
  user,
}: UseChatControllerArgs): UseChatControllerResult {
  const { values: featureFlagValues } = useFeatureFlags();
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
  const fallbackModelOptions = useMemo(
    () => resolveEnabledChatModelOptions(featureFlagValues),
    [featureFlagValues],
  );
  const [catalogModelOptions, setCatalogModelOptions] = useState<ChatModelOption[] | null>(null);
  const modelOptions = catalogModelOptions || fallbackModelOptions;
  const [currentModel, setCurrentModelState] = useState(() =>
    normalizeChatModelKey(DEFAULT_MODEL, modelOptions),
  );

  const chatLoadRequestIdRef = useRef(0);
  const currentIdRef = useRef<string | null>(null);
  const anonymousConversationUidRef = useRef<string | null>(null);
  const optimisticUserMessageCallbackRef = useRef(onOptimisticUserMessage);
  const sendAbortedCallbackRef = useRef(onSendAborted);
  currentIdRef.current = currentId;
  optimisticUserMessageCallbackRef.current = onOptimisticUserMessage;
  sendAbortedCallbackRef.current = onSendAborted;

  useEffect(() => {
    if (!user) {
      setCatalogModelOptions(null);
      return;
    }

    let cancelled = false;

    const loadCatalog = async () => {
      try {
        const nextOptions = await fetchChatModelCatalog(user, () => cancelled);

        if (!cancelled) {
          setCatalogModelOptions(nextOptions.length > 0 ? nextOptions : null);
        }
      } catch (error) {
        console.warn("Failed to load model catalog", error);

        if (!cancelled) {
          setCatalogModelOptions(null);
        }
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [user, featureFlagValues]);

  useEffect(() => {
    setCurrentModelState((previous) => normalizeChatModelKey(previous, modelOptions));
  }, [modelOptions]);

  useEffect(() => {
    setConversations((previous) => {
      let changed = false;
      const next: ConversationsById = {};

      for (const [conversationId, conversation] of Object.entries(previous)) {
        const normalizedModel = normalizeChatModelKey(
          conversation?.logicalModelKey || conversation?.currentModel,
          modelOptions,
        );

        if (normalizedModel !== conversation?.currentModel) {
          next[conversationId] = {
            ...conversation,
            currentModel: normalizedModel,
            logicalModelKey:
              logicalKeyForChatModel(normalizedModel, modelOptions) ||
              conversation.logicalModelKey,
          };
          changed = true;
          continue;
        }

        next[conversationId] = conversation;
      }

      return changed ? next : previous;
    });
  }, [modelOptions]);

  useEffect(() => {
    if (!user) {
      setConversations({});
      setCurrentId(null);
      setCurrentModelState(normalizeChatModelKey(DEFAULT_MODEL, modelOptions));
      setSidebarLoading(false);
      setLoadingMoreConversations(false);
      setNextConversationCursor(null);
      setConversationsHydrated(false);
      return;
    }

    // A recovered anonymous UID already has the triggering conversation in
    // local state. Let the send complete before a UID-change render reloads
    // the list; ordinary anonymous startup still loads persisted history.
    if (isAnon && anonymousConversationUidRef.current === user.uid) {
      anonymousConversationUidRef.current = null;
      setConversationsHydrated(true);
      return;
    }

    anonymousConversationUidRef.current = null;
    let cancelled = false;

    setConversationsHydrated(false);
    setSidebarLoading(true);

    const loadConversations = async () => {
      try {
        const tokenResult = await getIdTokenWithAnonymousRecovery(user, true);

        if (cancelled) {
          return;
        }

        const result = await queryClient.fetchQuery({
          queryKey: queryKeys.conversationPage(tokenResult.user.uid, null),
          queryFn: async ({ signal }) => {
            const response = await fetch(`${API_BASE}/api/conversations`, {
              headers: { Authorization: `Bearer ${tokenResult.idToken}` },
              signal,
            });

            if (!response.ok) {
              throw new Error(`Failed to load conversations: ${response.status}`);
            }

            return {
              payload: normalizeConversationListPayload((await response.json()) as unknown),
            };
          },
        });

        if (cancelled) {
          return;
        }

        const payload = result.payload;
        const mapped = mergeConversationPage({}, payload.items, modelOptions);
        const sorted = Object.values(mapped).sort(compareConversations);
        const rememberedConversationId = isAnon
          ? await AsyncStorage.getItem(activeConversationStorageKey(tokenResult.user.uid)).catch(() => null)
          : null;

        setConversations(mapped);
        setNextConversationCursor(payload.nextCursor);
        setCurrentId((previous) => {
          if (rememberedConversationId && mapped[rememberedConversationId]) {
            return rememberedConversationId;
          }

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
  }, [isAnon, modelOptions, user]);

  useEffect(() => {
    if (!user?.isAnonymous) {
      return;
    }

    const storageKey = activeConversationStorageKey(user.uid);

    if (!currentId) {
      return;
    }

    void AsyncStorage.setItem(storageKey, currentId).catch(() => null);
  }, [currentId, user]);

  const setCurrentModel = useCallback(
    (model: string) => {
      const nextModel = normalizeChatModelKey(model, modelOptions);
      const nextLogicalModelKey = logicalKeyForChatModel(nextModel, modelOptions);

      setCurrentModelState((previous: string) => {
        if (previous === nextModel) {
          return previous;
        }
        return nextModel;
      });

      setConversations((previous: ConversationsById) => {
        const conversationId = currentIdRef.current;

        if (!conversationId) {
          return previous;
        }

        const conversation = previous[conversationId];

        if (
          !conversation ||
          (conversation.currentModel === nextModel &&
            conversation.logicalModelKey === nextLogicalModelKey)
        ) {
          return previous;
        }

        return {
          ...previous,
          [conversationId]: {
            ...conversation,
            currentModel: nextModel,
            logicalModelKey: nextLogicalModelKey,
          },
        };
      });
    },
    [modelOptions]
  );

  useEffect(() => {
    if (!user || !currentId) {
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
        const tokenResult = await getIdTokenWithAnonymousRecovery(user, true);

        if (tokenResult.recovered) {
          setConversations({});
          setCurrentId(null);
          return;
        }

        if (requestId !== chatLoadRequestIdRef.current) {
          return;
        }

        const data = await fetchConversationDetail({
          conversationId: currentId,
          idToken: tokenResult.idToken,
          signal: abortController.signal,
        });
        queryClient.setQueryData(
          queryKeys.conversation(tokenResult.user.uid, currentId),
          data,
        );

        if (requestId !== chatLoadRequestIdRef.current) {
          return;
        }

        setConversations((previous) => {
          return {
            ...previous,
            [currentId]: mergeCanonicalConversation({
              conversationId: currentId,
              data,
              modelOptions,
              previous: previous[currentId],
            }),
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
  }, [conversations, currentId, modelOptions, user]);

  useEffect(() => {
    if (!currentId) {
      return;
    }

    const conversation = conversations[currentId];

    if (!conversation) {
      return;
    }

    const latestModel = normalizeChatModelKey(
      conversation.logicalModelKey ||
        conversation.currentModel ||
        [...(conversation.messages || [])]
          .reverse()
          .find(
            (message) =>
              typeof message.logicalModelKey === "string" ||
              typeof message.model === "string",
          )?.logicalModelKey ||
        [...(conversation.messages || [])]
          .reverse()
          .find((message) => typeof message.model === "string")?.model,
      modelOptions,
    );

    if (latestModel && latestModel !== currentModel) {
      setCurrentModel(latestModel);
    }
  }, [conversations, currentId, currentModel, modelOptions, setCurrentModel]);

  const createNewChat = useCallback(() => {
    setCurrentId(null);
    setInput("");
    setPartial("");
    setShowThinking(false);
    setStreamingModel(null);
  }, []);

  const openConversation = useCallback(
    (selection: Conversation | ConversationSearchResult | string) => {
      const conversationId = typeof selection === "string" ? selection : selection.id;

      if (!conversationId) {
        return;
      }

      setConversations((previous) => {
        const existing = previous[conversationId];
        const selectedConversation =
          typeof selection === "string" ? null : selection;

        return {
          ...previous,
          [conversationId]: {
            ...existing,
            createdAt: selectedConversation?.createdAt ?? existing?.createdAt,
            currentModel:
              existing?.currentModel ||
              (selectedConversation && "messages" in selectedConversation
                ? selectedConversation.currentModel
                : DEFAULT_MODEL),
            id: conversationId,
            logicalModelKey:
              existing?.logicalModelKey ||
              (selectedConversation && "messages" in selectedConversation
                ? selectedConversation.logicalModelKey
                : undefined),
            messages:
              existing?.messages ||
              (selectedConversation && "messages" in selectedConversation
                ? selectedConversation.messages
                : []),
            messagesLoaded: false,
            title: selectedConversation?.title || existing?.title || "New Chat",
            updatedAt: selectedConversation?.updatedAt ?? existing?.updatedAt,
          },
        };
      });

      setPartial("");
      setShowThinking(false);
      setStreamingModel(null);
      setCurrentId(conversationId);
    },
    [],
  );

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (typeof overrideText === "string" ? overrideText : input).trim();

      if (!text || !user) {
        return;
      }

      let tokenResult: Awaited<ReturnType<typeof getIdTokenWithAnonymousRecovery>>;

      try {
        tokenResult = await getIdTokenWithAnonymousRecovery(user);
      } catch (error) {
        console.error(error);
        sendAbortedCallbackRef.current?.();

        const message =
          error instanceof Error
            ? error.message
            : "Something went wrong talking to Quiet Room.";

        Alert.alert("Quiet Room", message);
        return;
      }

      if (tokenResult.user.isAnonymous) {
        // Claim the recovered UID before AuthContext's token-change render so
        // the identity reset does not erase the fresh recovery conversation.
        anonymousConversationUidRef.current = tokenResult.user.uid;
      }

      const now = Date.now();
      const conversationId = tokenResult.recovered ? generateConversationId() : currentId || generateConversationId();
      const requestModel = requestModelForChatModel(currentModel, modelOptions);
      const requestLogicalKey = logicalKeyForChatModel(currentModel, modelOptions);

      const previousMessages = tokenResult.recovered ? [] : conversations[conversationId]?.messages || [];
      const userMessage: ChatMessage = {
        content: text,
        logicalModelKey: requestLogicalKey,
        model: requestModel,
        role: "user",
      };

      const outgoingMessages = [...previousMessages, userMessage];
      const existingConversation = tokenResult.recovered ? null : conversations[conversationId];

      const shouldRename =
        (!existingConversation || existingConversation.title === "New Chat") &&
        outgoingMessages.length === 1;

      const title = shouldRename
        ? buildConversationTitle(text)
        : existingConversation?.title || "New Chat";

      optimisticUserMessageCallbackRef.current?.({
        content: text,
        messageIndex: outgoingMessages.length - 1,
      });

      setConversations((previous) => {
        const previousConversation = previous[conversationId];

        const nextConversation = {
          createdAt: previousConversation?.createdAt || now,
          currentModel,
          id: conversationId,
          logicalModelKey: requestLogicalKey,
          messages: outgoingMessages,
          messagesLoaded: true,
          title,
          updatedAt: now,
        };

        if (tokenResult.recovered) {
          return { [conversationId]: nextConversation };
        }

        return {
          ...previous,
          [conversationId]: nextConversation,
        };
      });

      setCurrentId(conversationId);
      setInput("");
      setLoading(true);
      setPartial("");
      setStreamingModel(currentModel);
      setShowThinking(true);

      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let renderedContent = "";
      let pendingForRender = "";
      const streamStartedAt = Date.now();

      const applyCanonicalData = (data: Record<string, unknown>) => {
        queryClient.setQueryData(
          queryKeys.conversation(tokenResult.user.uid, conversationId),
          data,
        );
        setConversations((previous) => ({
          ...previous,
          [conversationId]: mergeCanonicalConversation({
            conversationId,
            data,
            modelOptions,
            previous: previous[conversationId],
          }),
        }));
      };

      try {
        const payload: Record<string, unknown> = {
          conversation_id: conversationId,
          messages: outgoingMessages,
          model: requestModel,
          tz_offset_minutes: new Date().getTimezoneOffset(),
        };
        if (requestLogicalKey) {
          payload.logicalModelKey = requestLogicalKey;
        }

        const requestBody = JSON.stringify(payload);
        const requestHeaders = {
          Authorization: `Bearer ${tokenResult.idToken}`,
          "Content-Type": "application/json",
        };

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
          logicalModelKey: requestLogicalKey,
          model: requestModel,
          role: "assistant",
        };

        const canonicalData = await fetchCanonicalConversationForTurn({
          conversationId,
          idToken: tokenResult.idToken,
          userMessage,
        });

        if (canonicalData) {
          applyCanonicalData(canonicalData);
        } else {
          // A verified [DONE] stream is safe to retain if the defensive
          // canonical readback is temporarily unavailable.
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
                logicalModelKey: requestLogicalKey,
                messages: [...messagesWithUser, assistantMessage],
                messagesLoaded: true,
                title,
                updatedAt: Date.now(),
              },
            };
          });
        }

        setPartial("");
        await invalidateConversationQueries(tokenResult.user.uid, conversationId);
      } catch (error) {
        console.error(error);

        setPartial("");

        if (error instanceof ChatStreamIntegrityError) {
          const [canonicalData] = await Promise.all([
            fetchCanonicalConversationForTurn({
              conversationId,
              idToken: tokenResult.idToken,
              userMessage,
            }),
            sendClientEvent({
              event: "chat_stream.incomplete",
              payload: {
                conversationId,
                elapsedMs: Date.now() - streamStartedAt,
                model: requestModel,
                platform: Platform.OS,
                reason: error.reason,
                receivedCharacterCount: error.receivedCharacterCount,
                receivedChunkCount: error.receivedChunkCount,
                renderedPartial: renderedContent.length > 0,
              },
              user: tokenResult.user,
            }).catch((telemetryError) => {
              console.warn("Failed to report incomplete chat stream", telemetryError);
            }),
          ]);

          if (canonicalData) {
            applyCanonicalData(canonicalData);
            await invalidateConversationQueries(tokenResult.user.uid, conversationId);
            return;
          }
        }

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
    [conversations, currentId, currentModel, input, modelOptions, user]
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
      const tokenResult = await getIdTokenWithAnonymousRecovery(user, true);

      if (tokenResult.recovered) {
        setConversations({});
        setCurrentId(null);
        setNextConversationCursor(null);
        return;
      }

      const cursor = nextConversationCursor;
      const payload = await queryClient.fetchQuery({
        queryKey: queryKeys.conversationPage(tokenResult.user.uid, cursor),
        queryFn: async ({ signal }) => {
          const query = `limit=${CONVERSATIONS_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`;
          const response = await fetch(`${API_BASE}/api/conversations?${query}`, {
            headers: { Authorization: `Bearer ${tokenResult.idToken}` },
            signal,
          });

          if (!response.ok) {
            throw new Error(`Failed to load more conversations: ${response.status}`);
          }

          return normalizeConversationListPayload((await response.json()) as unknown);
        },
      });

      setConversations((previous) => mergeConversationPage(previous, payload.items, modelOptions));
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
  }, [isAnon, loadingMoreConversations, modelOptions, nextConversationCursor, sidebarLoading, user]);

  const renameConversation = useCallback(
    async (conversationId: string, title: string) => {
      if (!user || !conversationId) {
        return;
      }

      const trimmed = typeof title === "string" ? title.trim() : "";

      if (!trimmed) {
        throw new Error("Title cannot be empty");
      }

      const tokenResult = await getIdTokenWithAnonymousRecovery(user, true);

      if (tokenResult.recovered) {
        setConversations({});
        setCurrentId(null);
        setNextConversationCursor(null);
        return;
      }

      const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
        body: JSON.stringify({ title: trimmed }),
        headers: {
          Authorization: `Bearer ${tokenResult.idToken}`,
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
      await invalidateConversationQueries(tokenResult.user.uid, conversationId);
    },
    [user]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!user || !conversationId) {
        return;
      }

      const tokenResult = await getIdTokenWithAnonymousRecovery(user, true);

      if (tokenResult.recovered) {
        setConversations({});
        setCurrentId(null);
        setNextConversationCursor(null);
        return;
      }

      const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
        headers: { Authorization: `Bearer ${tokenResult.idToken}` },
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

          const nextConversation = Object.values(rest).sort(compareConversations)[0];

          return nextConversation?.id || null;
        });

        return rest;
      });
      removeConversationQuery(tokenResult.user.uid, conversationId);
      await invalidateConversationQueries(tokenResult.user.uid);
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
    (Boolean(user) && Boolean(currentId) && !activeConversationLoaded);

  const shouldBlockForConversations = Boolean(user) && !conversationsHydrated;

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
    modelOptions,
    openConversation,
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
