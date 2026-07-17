import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { API_BASE } from "../config/env";
import { getIdTokenWithAnonymousRecovery } from "../lib/firebase";
import { normalizeSearchMessageIndexes } from "../lib/conversationSearchNavigation";
import {
  CONVERSATION_SEARCH_STALE_TIME_MS,
  hasFreshQueryData,
  normalizeServerSearchQuery,
  queryClient,
  queryKeys,
} from "../lib/queryClient";
import type { ConversationSearchResult } from "../types/chat";

type UseConversationSearchArgs = {
  enabled: boolean;
  user: User | null;
};

type UseConversationSearchResult = {
  clearSearch: () => void;
  error: string | null;
  hasSearched: boolean;
  loading: boolean;
  query: string;
  results: ConversationSearchResult[];
  search: () => Promise<void>;
  setQuery: (value: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeResult(value: unknown): ConversationSearchResult | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) {
    return null;
  }

  const result: ConversationSearchResult = {
    createdAt: typeof value.createdAt === "number" ? value.createdAt : undefined,
    id: value.id,
    matchCount:
      typeof value.matchCount === "number" && Number.isFinite(value.matchCount)
        ? Math.max(1, Math.floor(value.matchCount))
        : 1,
    snippet: typeof value.snippet === "string" ? value.snippet : "",
    title: typeof value.title === "string" ? value.title : undefined,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : undefined,
  };

  const messageIndexes = normalizeSearchMessageIndexes(
    value.messageIndexes,
    value.messageIndex,
  );

  if (messageIndexes) {
    result.messageIndexes = messageIndexes;
    result.messageIndex = value.messageIndex as number;
    result.matchCount = messageIndexes.length;
  }

  return result;
}

export function normalizeConversationSearchPayload(
  payload: unknown,
): ConversationSearchResult[] {
  const items: unknown[] = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];

  return items
    .map((item) => normalizeResult(item))
    .filter((item): item is ConversationSearchResult => Boolean(item));
}

export function useConversationSearch({
  enabled,
  user,
}: UseConversationSearchArgs): UseConversationSearchResult {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<ConversationSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const clearSearch = useCallback(() => {
    requestIdRef.current += 1;
    setQueryState("");
    setResults([]);
    setError(null);
    setHasSearched(false);
    setLoading(false);
  }, []);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setResults([]);
    setError(null);
    setHasSearched(false);
  }, []);

  useEffect(() => {
    if (!enabled || !user) {
      clearSearch();
    }
  }, [clearSearch, enabled, user?.uid]);

  const search = useCallback(async () => {
    const trimmedQuery = normalizeServerSearchQuery(query);

    if (!enabled || !user) {
      return;
    }

    if (!trimmedQuery) {
      clearSearch();
      return;
    }

    const requestId = (requestIdRef.current += 1);
    const startedAt = Date.now();
    setHasSearched(true);
    setLoading(true);
    setError(null);

    let status: number | null = null;
    let resultCount = 0;
    let cacheHit = false;

    try {
      const tokenResult = await getIdTokenWithAnonymousRecovery(user, true);

      if (requestId !== requestIdRef.current) {
        return;
      }

      const searchQueryKey = queryKeys.conversationSearch(
        tokenResult.user.uid,
        trimmedQuery,
      );
      cacheHit = hasFreshQueryData(
        searchQueryKey,
        CONVERSATION_SEARCH_STALE_TIME_MS,
      );
      const nextResults = await queryClient.fetchQuery({
        queryKey: searchQueryKey,
        staleTime: CONVERSATION_SEARCH_STALE_TIME_MS,
        gcTime: 15 * 60_000,
        retry: false,
        queryFn: async ({ signal }) => {
          const response = await fetch(
            `${API_BASE}/api/conversations/search?q=${encodeURIComponent(trimmedQuery)}`,
            {
              headers: { Authorization: `Bearer ${tokenResult.idToken}` },
              signal,
            },
          );
          status = response.status;

          if (!response.ok) {
            throw new Error(
              response.status === 404
                ? "Conversation search is not available for this account."
                : `Search failed: ${response.status}`,
            );
          }

          return normalizeConversationSearchPayload((await response.json()) as unknown);
        },
      });
      resultCount = nextResults.length;

      if (requestId === requestIdRef.current) {
        setResults(nextResults);
      }
    } catch (searchError) {
      if (requestId === requestIdRef.current) {
        setResults([]);
        setError(
          searchError instanceof Error && searchError.message
            ? searchError.message
            : "Unable to search conversations right now.",
        );
      }
    } finally {
      const durationMs = Date.now() - startedAt;

      if (__DEV__) {
        console.info("conversation_search", {
          durationMs,
          cacheHit,
          resultCount,
          status,
        });
      }

      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [clearSearch, enabled, query, user]);

  return {
    clearSearch,
    error,
    hasSearched,
    loading,
    query,
    results,
    search,
    setQuery,
  };
}
