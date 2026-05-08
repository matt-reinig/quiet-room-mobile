export const SUPPORTED_FEATURE_FLAGS = new Set([
  "chat_model_gpt_5_1",
  "chat_model_gpt_5_3",
  "chat_model_gpt_5_5_reasoning_none",
  "voice_mode",
]);

export function filterSupportedFlagValues(
  values: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  if (!values || typeof values !== "object") {
    return {};
  }

  const filtered: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(values)) {
    if (!SUPPORTED_FEATURE_FLAGS.has(key) || typeof value !== "boolean") {
      continue;
    }

    filtered[key] = value;
  }

  return filtered;
}

export function filterSupportedFlagReasons(
  reasons: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!reasons || typeof reasons !== "object") {
    return {};
  }

  const filtered: Record<string, string> = {};

  for (const [key, value] of Object.entries(reasons)) {
    if (!SUPPORTED_FEATURE_FLAGS.has(key) || typeof value !== "string") {
      continue;
    }

    filtered[key] = value;
  }

  return filtered;
}
