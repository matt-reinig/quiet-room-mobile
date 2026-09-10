export const VOICE_PLAYBACK_DIAGNOSTIC_PREFIX = "QR_MOB_021_VOICE_DIAG";
export const TRACK_PLAYER_PACKAGE_NAME = "react-native-track-player";
// Keep this explicit so captured runs identify the native dependency that was
// installed when the diagnostic build was created.
export const TRACK_PLAYER_PACKAGE_VERSION = "4.1.2";

export type DiagnosticAppVariant = "prod" | "qa";
export type DiagnosticReleaseEnv = "local" | "qa" | "prod";
export type DiagnosticVoicePlaybackEngine = "expo-audio" | "track-player";

export type VoicePlaybackDiagnosticRuntime = {
  appVariant: DiagnosticAppVariant;
  releaseEnv: DiagnosticReleaseEnv;
  voicePlaybackEngine: DiagnosticVoicePlaybackEngine;
  trackPlayerPackage?: string;
  trackPlayerVersion?: string;
};

export type VoicePlaybackFixtureSourceClass =
  | "missing"
  | "allowed-local"
  | "allowed-url"
  | "disallowed";

export type VoicePlaybackFixtureSource = {
  classification: VoicePlaybackFixtureSourceClass;
  baseUrl?: string;
};

export type VoicePlaybackDiagnosticMode = "fixture" | "live-trace" | "live-proxy";

export type VoicePlaybackProxySourceClass = "missing" | "allowed-url" | "disallowed";

export type VoicePlaybackProxySource = {
  classification: VoicePlaybackProxySourceClass;
  baseUrl?: string;
};

export type VoicePlaybackDiagnosticDeepLink = {
  enabled: boolean;
  mode: VoicePlaybackDiagnosticMode;
  fixtureSource?: VoicePlaybackFixtureSourceClass;
  fixtureBaseUrl?: string;
  fixtureCase?: string;
  proxyBaseUrl?: string;
};

export type VoicePlaybackDiagnosticValue = string | number | boolean | null;
export type VoicePlaybackDiagnosticFields = Record<string, unknown>;

export type VoicePlaybackDiagnosticEvent = {
  prefix: typeof VOICE_PLAYBACK_DIAGNOSTIC_PREFIX;
  event: string;
  runId: string;
  attemptId: string | null;
  elapsedMs: number;
  wallTime: string;
  appVariant: DiagnosticAppVariant;
  releaseEnv: DiagnosticReleaseEnv;
  voicePlaybackEngine: DiagnosticVoicePlaybackEngine;
  trackPlayerPackage: string;
  trackPlayerVersion: string;
  fields?: Record<string, VoicePlaybackDiagnosticValue | Record<string, VoicePlaybackDiagnosticValue>>;
};

export type VoicePlaybackDiagnosticEmitterOptions = {
  enabled: boolean;
  runtime?: VoicePlaybackDiagnosticRuntime;
  runId?: string;
  now?: () => number;
  wallNow?: () => Date;
  idFactory?: (kind: "run" | "attempt") => string;
  sink?: (line: string, event: VoicePlaybackDiagnosticEvent) => void;
};

export type VoicePlaybackDiagnosticEmitter = {
  enabled: boolean;
  runId: string;
  startAttempt: (fields?: VoicePlaybackDiagnosticFields) => string;
  emit: (
    event: string,
    fields?: VoicePlaybackDiagnosticFields,
    attemptId?: string | null,
  ) => VoicePlaybackDiagnosticEvent | null;
  finishAttempt: (attemptId: string, fields?: VoicePlaybackDiagnosticFields) => void;
  subscribe: (listener: (event: VoicePlaybackDiagnosticEvent) => void) => () => void;
};

type DiagnosticClock = () => number;

const DEFAULT_RUNTIME: VoicePlaybackDiagnosticRuntime = {
  appVariant: process.env.EXPO_PUBLIC_APP_VARIANT?.toLowerCase() === "qa" ? "qa" : "prod",
  releaseEnv:
    process.env.EXPO_PUBLIC_RELEASE_ENV?.toLowerCase() === "local"
      ? "local"
      : process.env.EXPO_PUBLIC_RELEASE_ENV?.toLowerCase() === "prod"
        ? "prod"
        : "qa",
  voicePlaybackEngine:
    process.env.EXPO_PUBLIC_VOICE_PLAYBACK_ENGINE?.toLowerCase() === "track-player"
      ? "track-player"
      : process.env.EXPO_PUBLIC_VOICE_PLAYBACK_ENGINE?.toLowerCase() === "expo-audio"
        ? "expo-audio"
        : process.env.EXPO_PUBLIC_APP_VARIANT?.toLowerCase() === "qa"
          ? "track-player"
          : "expo-audio",
};

const SENSITIVE_FIELD_PATTERN =
  /authorization|token|cookie|password|secret|api[_-]?key|message|content|prompt|transcript|text|body|url/i;
const SAFE_FIXTURE_CASE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const SAFE_EVENT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/;
const ALLOWED_LOCAL_FIXTURE_HOSTS = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);

function defaultClock(): number {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return Date.now();
}

function defaultIdFactory(kind: "run" | "attempt"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${kind}-${timestamp}-${random}`;
}

function normalizeRuntime(runtime?: VoicePlaybackDiagnosticRuntime): Required<VoicePlaybackDiagnosticRuntime> {
  return {
    ...(runtime || DEFAULT_RUNTIME),
    trackPlayerPackage: runtime?.trackPlayerPackage || TRACK_PLAYER_PACKAGE_NAME,
    trackPlayerVersion: runtime?.trackPlayerVersion || TRACK_PLAYER_PACKAGE_VERSION,
  };
}

export function isVoicePlaybackDiagnosticsAllowed(runtime: VoicePlaybackDiagnosticRuntime): boolean {
  return runtime.appVariant === "qa" && (runtime.releaseEnv === "qa" || runtime.releaseEnv === "local");
}

function isSafeFixtureUrl(rawValue: string): boolean {
  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    if (parsed.username || parsed.password || parsed.hash) {
      return false;
    }

    if (!ALLOWED_LOCAL_FIXTURE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return false;
    }

    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_FIELD_PATTERN.test(key)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function classifyAllowedFixtureSource(value: unknown): VoicePlaybackFixtureSource {
  if (value === "local" || value === "local-fixture" || value === "emulator") {
    return { classification: "allowed-local" };
  }

  if (typeof value !== "string" || !value.trim()) {
    return { classification: "missing" };
  }

  const baseUrl = value.trim();
  if (!isSafeFixtureUrl(baseUrl)) {
    return { classification: "disallowed" };
  }

  return { classification: "allowed-url", baseUrl };
}

export function classifyAllowedProxySource(value: unknown): VoicePlaybackProxySource {
  if (typeof value !== "string" || !value.trim()) {
    return { classification: "missing" };
  }

  const baseUrl = value.trim();
  let hasQuery = false;
  try {
    hasQuery = Boolean(new URL(baseUrl).search);
  } catch {
    return { classification: "disallowed" };
  }

  if (hasQuery || !isSafeFixtureUrl(baseUrl)) {
    return { classification: "disallowed" };
  }

  return { classification: "allowed-url", baseUrl };
}

function readDiagnosticPayload(rawValue: string): Record<string, unknown> | null {
  const trimmed = rawValue.trim();
  if (trimmed === "1" || trimmed.toLowerCase() === "true") {
    return { enabled: true };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseVoicePlaybackDiagnosticDeepLink(
  url: string | null | undefined,
  runtime: VoicePlaybackDiagnosticRuntime = DEFAULT_RUNTIME,
): VoicePlaybackDiagnosticDeepLink | null {
  if (!url || !isVoicePlaybackDiagnosticsAllowed(runtime)) {
    return null;
  }

  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    const queryIndex = url.indexOf("?");
    if (queryIndex < 0) {
      return null;
    }

    try {
      params = new URLSearchParams(url.slice(queryIndex + 1));
    } catch {
      return null;
    }
  }

  const rawPayload = params.get("voiceDiag") || params.get("voiceDiagnostics");
  if (!rawPayload) {
    return null;
  }

  const payload = readDiagnosticPayload(rawPayload);
  if (!payload || payload.enabled !== true) {
    return null;
  }

  const requestedMode = payload.mode;
  const hasFixtureSource = payload.fixtureBaseUrl !== undefined || payload.fixtureSource !== undefined;
  const hasProxySource = payload.proxyBaseUrl !== undefined;
  const source = classifyAllowedFixtureSource(payload.fixtureBaseUrl ?? payload.fixtureSource);
  const proxy = classifyAllowedProxySource(payload.proxyBaseUrl);
  const mode: VoicePlaybackDiagnosticMode | null =
    requestedMode === undefined
      ? hasFixtureSource
        ? "fixture"
        : null
      : requestedMode === "fixture"
        ? "fixture"
        : requestedMode === "live-trace"
          ? "live-trace"
          : requestedMode === "live-proxy"
            ? "live-proxy"
            : null;

  if (
    !mode ||
    (mode === "fixture" &&
      ((source.classification !== "allowed-local" && source.classification !== "allowed-url") ||
        hasProxySource)) ||
    (mode === "live-proxy" && (proxy.classification !== "allowed-url" || hasFixtureSource))
  ) {
    return null;
  }

  // Direct live tracing must use the normal saved-message endpoint. Proxy
  // tracing may replace only the local base URL; neither mode may be mixed
  // with fixture routing or fixture-only fields.
  if (
    mode === "live-trace" &&
    (hasFixtureSource || hasProxySource || payload.fixtureCase !== undefined)
  ) {
    return null;
  }
  if (mode === "live-proxy" && payload.fixtureCase !== undefined) {
    return null;
  }

  const fixtureCase =
    typeof payload.fixtureCase === "string" && SAFE_FIXTURE_CASE_PATTERN.test(payload.fixtureCase)
      ? payload.fixtureCase
      : undefined;

  return {
    enabled: true,
    mode,
    ...(mode === "fixture" ? { fixtureSource: source.classification } : {}),
    ...(mode === "fixture" && source.baseUrl ? { fixtureBaseUrl: source.baseUrl } : {}),
    ...(mode === "fixture" && fixtureCase ? { fixtureCase } : {}),
    ...(mode === "live-proxy" && proxy.baseUrl ? { proxyBaseUrl: proxy.baseUrl } : {}),
  };
}

function sanitizeDiagnosticValue(value: unknown, depth = 0): VoicePlaybackDiagnosticValue | Record<string, VoicePlaybackDiagnosticValue> | undefined {
  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      return undefined;
    }

    return value.length <= 120 ? value : value.slice(0, 120);
  }

  if (!value || typeof value !== "object" || Array.isArray(value) || depth >= 1) {
    return undefined;
  }

  const sanitized: Record<string, VoicePlaybackDiagnosticValue> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_FIELD_PATTERN.test(key)) {
      continue;
    }

    const cleanValue = sanitizeDiagnosticValue(nestedValue, depth + 1);
    if (cleanValue !== undefined && (typeof cleanValue !== "object" || cleanValue === null)) {
      sanitized[key] = cleanValue;
    }
  }

  return sanitized;
}

export function sanitizeVoicePlaybackDiagnosticFields(
  fields: VoicePlaybackDiagnosticFields | undefined,
): Record<string, VoicePlaybackDiagnosticValue | Record<string, VoicePlaybackDiagnosticValue>> {
  if (!fields) {
    return {};
  }

  const sanitized: Record<string, VoicePlaybackDiagnosticValue | Record<string, VoicePlaybackDiagnosticValue>> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_FIELD_PATTERN.test(key)) {
      continue;
    }

    const cleanValue = sanitizeDiagnosticValue(value);
    if (cleanValue !== undefined) {
      sanitized[key] = cleanValue;
    }
  }

  return sanitized;
}

export function formatVoicePlaybackDiagnosticEvent(event: VoicePlaybackDiagnosticEvent): string {
  return `${VOICE_PLAYBACK_DIAGNOSTIC_PREFIX} ${JSON.stringify(event)}`;
}

export function createVoicePlaybackDiagnosticEmitter(
  options: VoicePlaybackDiagnosticEmitterOptions,
): VoicePlaybackDiagnosticEmitter {
  const runtime = normalizeRuntime(options.runtime);
  const now: DiagnosticClock = options.now || defaultClock;
  const idFactory = options.idFactory || defaultIdFactory;
  const wallNow = options.wallNow || (() => new Date());
  const runId = options.runId || idFactory("run");
  const startedAt = now();
  const enabled = options.enabled && isVoicePlaybackDiagnosticsAllowed(runtime);
  const listeners = new Set<(event: VoicePlaybackDiagnosticEvent) => void>();
  const finishedAttemptIds = new Set<string>();
  let lastElapsedMs = 0;

  const emit = (
    eventName: string,
    fields?: VoicePlaybackDiagnosticFields,
    attemptId: string | null = null,
  ): VoicePlaybackDiagnosticEvent | null => {
    if (!enabled || !SAFE_EVENT_NAME_PATTERN.test(eventName)) {
      return null;
    }

    lastElapsedMs = Math.max(lastElapsedMs, Math.round(now() - startedAt));
    const event: VoicePlaybackDiagnosticEvent = {
      prefix: VOICE_PLAYBACK_DIAGNOSTIC_PREFIX,
      event: eventName,
      runId,
      attemptId,
      elapsedMs: lastElapsedMs,
      wallTime: wallNow().toISOString(),
      appVariant: runtime.appVariant,
      releaseEnv: runtime.releaseEnv,
      voicePlaybackEngine: runtime.voicePlaybackEngine,
      trackPlayerPackage: runtime.trackPlayerPackage,
      trackPlayerVersion: runtime.trackPlayerVersion,
    };
    const cleanFields = sanitizeVoicePlaybackDiagnosticFields(fields);
    if (Object.keys(cleanFields).length > 0) {
      event.fields = cleanFields;
    }

    const line = formatVoicePlaybackDiagnosticEvent(event);
    options.sink?.(line, event);
    for (const listener of listeners) {
      listener(event);
    }

    return event;
  };

  return {
    enabled,
    runId,
    startAttempt(fields) {
      const attemptId = idFactory("attempt");
      finishedAttemptIds.delete(attemptId);
      emit("attempt.started", fields, attemptId);
      return attemptId;
    },
    emit,
    finishAttempt(attemptId, fields) {
      if (finishedAttemptIds.has(attemptId)) {
        return;
      }
      finishedAttemptIds.add(attemptId);
      emit("attempt.finished", fields, attemptId);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
