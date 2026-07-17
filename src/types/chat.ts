export type ChatMessage = {
  audioSrc?: string;
  content: string;
  disableVoice?: boolean;
  isStreaming?: boolean;
  logicalModelKey?: string;
  model?: string;
  role: "assistant" | "user";
};

export type Conversation = {
  createdAt?: number;
  currentModel?: string;
  id: string;
  logicalModelKey?: string;
  messages: ChatMessage[];
  messagesLoaded?: boolean;
  title?: string;
  updatedAt?: number;
};

export type ConversationsById = Record<string, Conversation>;

export type ConversationSearchResult = {
  createdAt?: number;
  id: string;
  matchCount: number;
  messageIndex?: number;
  messageIndexes?: number[];
  snippet: string;
  title?: string;
  updatedAt?: number;
};

export type ConversationSearchNavigationTarget = {
  conversationId: string;
  messageIndexes: number[];
  query: string;
  selectedPosition: number;
};
