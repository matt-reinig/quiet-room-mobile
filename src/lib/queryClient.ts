import { QueryClient } from "@tanstack/react-query";

const DEFAULT_STALE_TIME_MS = 30_000;
const DEFAULT_GC_TIME_MS = 15 * 60_000;
export const CONVERSATION_SEARCH_STALE_TIME_MS = 2 * 60_000;

export const queryKeys = {
  user: (uid: string) => ["user", uid] as const,
  aiConsent: (uid: string) => ["user", uid, "ai-consent"] as const,
  featureFlags: (uid: string) => ["user", uid, "feature-flags"] as const,
  modelCatalog: (uid: string) => ["user", uid, "model-catalog"] as const,
  conversations: (uid: string) => ["user", uid, "conversations"] as const,
  conversationPage: (uid: string, cursor: string | null) =>
    ["user", uid, "conversations", "page", cursor || "first"] as const,
  conversation: (uid: string, conversationId: string) =>
    ["user", uid, "conversation", conversationId] as const,
  conversationSearches: (uid: string) =>
    ["user", uid, "conversation-search"] as const,
  conversationSearch: (uid: string, searchQuery: string) =>
    [
      "user",
      uid,
      "conversation-search",
      normalizeServerSearchQuery(searchQuery).toLowerCase(),
    ] as const,
};

export function normalizeServerSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function hasFreshQueryData(
  queryKey: readonly unknown[],
  staleTimeMs: number,
): boolean {
  const state = queryClient.getQueryState(queryKey);

  return Boolean(
    state?.data !== undefined &&
      state.dataUpdatedAt > 0 &&
      Date.now() - state.dataUpdatedAt < staleTimeMs,
  );
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: DEFAULT_GC_TIME_MS,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: DEFAULT_STALE_TIME_MS,
    },
    mutations: {
      retry: false,
    },
  },
});

export function removeUserQueries(uid: string | null | undefined): void {
  if (!uid) {
    return;
  }

  queryClient.removeQueries({ queryKey: queryKeys.user(uid) });
}

export async function invalidateConversationQueries(
  uid: string,
  conversationId?: string,
): Promise<void> {
  const invalidations: Promise<void>[] = [
    queryClient.invalidateQueries({ queryKey: queryKeys.conversations(uid) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.conversationSearches(uid) }),
  ];

  if (conversationId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(uid, conversationId) }),
    );
  }

  await Promise.all(invalidations);
}

export function removeConversationQuery(uid: string, conversationId: string): void {
  queryClient.removeQueries({ queryKey: queryKeys.conversation(uid, conversationId) });
}
