export const DEFAULT_CHAT_MODEL = "gpt-5.1-chat-latest";

export const CHAT_MODEL_FLAG_TO_MODEL = [
  ["chat_model_gpt_5_1", "gpt-5.1-chat-latest"],
  ["chat_model_gpt_5_3", "gpt-5.3-chat-latest"],
  ["chat_model_gpt_5_5_reasoning_none", "gpt-5.5"],
] as const;

export const MODEL_LABELS: Record<string, string> = {
  "gpt-5.1-chat-latest": "GPT-5.1",
  "gpt-5.3-chat-latest": "GPT-5.3",
  "gpt-5.5": "GPT-5.5",
};

const CHAT_MODEL_ORDER = CHAT_MODEL_FLAG_TO_MODEL.map(([, model]) => model);

export function resolveEnabledChatModels(
  values: Record<string, boolean> | null | undefined,
): string[] {
  const enabled = CHAT_MODEL_FLAG_TO_MODEL.filter(
    ([flag]) => values?.[flag] === true,
  ).map(([, model]) => model);

  if (enabled.length > 0) {
    return enabled;
  }

  return [DEFAULT_CHAT_MODEL];
}

export function normalizeChatModel(
  value: string | null | undefined,
  enabledModels: readonly string[],
): string {
  if (value && enabledModels.includes(value)) {
    return value;
  }

  if (enabledModels.includes(DEFAULT_CHAT_MODEL)) {
    return DEFAULT_CHAT_MODEL;
  }

  return enabledModels[0] || CHAT_MODEL_ORDER[0] || DEFAULT_CHAT_MODEL;
}
