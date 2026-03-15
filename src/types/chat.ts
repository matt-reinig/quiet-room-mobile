export type ChatMessage = {
  audioSrc?: string;
  content: string;
  disableVoice?: boolean;
  isStreaming?: boolean;
  model?: string;
  role: "assistant" | "user";
};

export type Conversation = {
  createdAt?: number;
  currentModel?: string;
  id: string;
  messages: ChatMessage[];
  messagesLoaded?: boolean;
  title?: string;
  updatedAt?: number;
};

export type ConversationsById = Record<string, Conversation>;
