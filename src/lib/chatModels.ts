export const DEFAULT_CHAT_MODEL = "gpt-5.1-chat-latest";

export type ChatModelOption = {
  description?: string;
  isDefault?: boolean;
  isFallback?: boolean;
  key: string;
  label: string;
  legacyModelId?: string;
  shortLabel?: string;
};

type RawModelCatalogItem = {
  capability?: unknown;
  description?: unknown;
  enabled?: unknown;
  isDefault?: unknown;
  isFallback?: unknown;
  key?: unknown;
  label?: unknown;
  legacyModelId?: unknown;
  providerModelId?: unknown;
  shortLabel?: unknown;
};

type RawModelCatalog = {
  items?: unknown;
};

export const CHAT_MODEL_FLAG_TO_MODEL = [
  ["chat_model_gpt_5_1", "gpt-5.1-chat-latest"],
  ["chat_model_gpt_5_3", "gpt-5.3-chat-latest"],
  ["chat_model_gpt_5_5_reasoning_none", "gpt-5.5"],
] as const;

const LEGACY_MODEL_LABELS: Record<string, string> = {
  "gpt-5.1-chat-latest": "GPT-5.1",
  "gpt-5.3-chat-latest": "GPT-5.3",
  "gpt-5.5": "GPT-5.5",
};

const CHAT_MODEL_ORDER = CHAT_MODEL_FLAG_TO_MODEL.map(([, model]) => model);

export const MODEL_LABELS = LEGACY_MODEL_LABELS;

function fallbackOptionForModel(model: string): ChatModelOption {
  return {
    key: model,
    label: LEGACY_MODEL_LABELS[model] || model,
    legacyModelId: model,
    shortLabel: LEGACY_MODEL_LABELS[model] || model,
  };
}

export function resolveEnabledChatModelOptions(
  values: Record<string, boolean> | null | undefined,
): ChatModelOption[] {
  const enabled = CHAT_MODEL_FLAG_TO_MODEL.filter(
    ([flag]) => values?.[flag] === true,
  ).map(([, model]) => fallbackOptionForModel(model));

  if (enabled.length > 0) {
    return enabled;
  }

  return [fallbackOptionForModel(DEFAULT_CHAT_MODEL)];
}

export function resolveEnabledChatModels(
  values: Record<string, boolean> | null | undefined,
): string[] {
  return resolveEnabledChatModelOptions(values).map((option) => option.key);
}

function modelMatchesOption(value: string, option: ChatModelOption): boolean {
  return value === option.key || value === option.legacyModelId;
}

export function findChatModelOption(
  value: string | null | undefined,
  options: readonly ChatModelOption[],
): ChatModelOption | null {
  if (!value) {
    return null;
  }

  return options.find((option) => modelMatchesOption(value, option)) || null;
}

export function normalizeChatModelKey(
  value: string | null | undefined,
  options: readonly ChatModelOption[],
): string {
  const matchedOption = findChatModelOption(value, options);

  if (matchedOption) {
    return matchedOption.key;
  }

  const defaultOption = findChatModelOption(DEFAULT_CHAT_MODEL, options);

  if (defaultOption) {
    return defaultOption.key;
  }

  return options[0]?.key || CHAT_MODEL_ORDER[0] || DEFAULT_CHAT_MODEL;
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

export function labelForChatModel(
  value: string | null | undefined,
  options: readonly ChatModelOption[],
): string {
  const option = findChatModelOption(value, options);
  if (!option) {
    return value || "";
  }

  return option.shortLabel || option.label || option.key;
}

export function requestModelForChatModel(
  value: string,
  options: readonly ChatModelOption[],
): string {
  const option = findChatModelOption(value, options);
  return option?.legacyModelId || option?.key || value;
}

export function logicalKeyForChatModel(
  value: string,
  options: readonly ChatModelOption[],
): string | undefined {
  const option = findChatModelOption(value, options);
  if (!option || option.key === option.legacyModelId) {
    return undefined;
  }

  return option.key;
}

export function parseChatModelCatalog(payload: unknown): ChatModelOption[] {
  const catalog = payload as RawModelCatalog;

  if (!catalog || !Array.isArray(catalog.items)) {
    return [];
  }

  return catalog.items
    .map((raw): ChatModelOption | null => {
      const item = raw as RawModelCatalogItem;

      if (
        item.capability !== "chat" ||
        item.enabled !== true ||
        typeof item.key !== "string" ||
        typeof item.label !== "string"
      ) {
        return null;
      }

      const legacyModelId =
        typeof item.legacyModelId === "string"
          ? item.legacyModelId
          : typeof item.providerModelId === "string"
            ? item.providerModelId
            : undefined;

      return {
        description:
          typeof item.description === "string" ? item.description : undefined,
        isDefault: item.isDefault === true,
        isFallback: item.isFallback === true,
        key: item.key,
        label: item.label,
        legacyModelId,
        shortLabel: typeof item.shortLabel === "string" ? item.shortLabel : item.label,
      };
    })
    .filter((option): option is ChatModelOption => Boolean(option));
}
