import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { Linking } from "react-native";
import { API_BASE } from "../config/env";
import {
  filterSupportedFlagReasons,
  filterSupportedFlagValues,
} from "../lib/featureFlags";
import { getIdTokenWithAnonymousRecovery } from "../lib/firebase";
import { useAuth } from "./AuthContext";

type FeatureFlagReasons = Record<string, string>;
type FeatureFlagValues = Record<string, boolean>;
type E2EFeatureFlagsPayload = {
  env?: string;
  values?: Record<string, unknown>;
};

type FeatureFlagsContextValue = {
  env: string | null;
  error: unknown;
  initialized: boolean;
  isEnabled: (flag: string, defaultValue?: boolean) => boolean;
  loading: boolean;
  reasons: FeatureFlagReasons;
  refresh: () => Promise<void>;
  values: FeatureFlagValues;
};

type FeatureFlagsProviderProps = {
  children: ReactNode;
};

type FeatureFlagsState = {
  env: string | null;
  error: unknown;
  initialized: boolean;
  loading: boolean;
  reasons: FeatureFlagReasons;
  values: FeatureFlagValues;
};

type FeatureFlagsOverride = {
  env: string;
  values: FeatureFlagValues;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  env: null,
  error: null,
  initialized: false,
  isEnabled: (_flag, defaultValue = false) => defaultValue,
  loading: false,
  reasons: {},
  refresh: async () => {},
  values: {},
});

const E2E_MOCK_FEATURE_FLAGS = String(
  process.env.EXPO_PUBLIC_E2E_MOCK_FEATURE_FLAGS || "",
).toLowerCase();
const E2E_FEATURE_FLAGS_RAW = String(process.env.EXPO_PUBLIC_E2E_FEATURE_FLAGS || "");
const FEATURE_FLAGS_TIMEOUT_MS = 8_000;

function parseFeatureFlagPayload(
  raw: string,
  source: string,
): FeatureFlagsOverride | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return {
      env: source,
      values: filterSupportedFlagValues(parsed),
    };
  } catch (error) {
    console.warn(`Failed to parse ${source} feature flags`, error);
    return { env: source, values: {} };
  }
}

function parseFeatureFlagsFromUrl(url: string, source: string): FeatureFlagsOverride | null {
  const queryIndex = url.indexOf("?");

  if (queryIndex < 0) {
    return null;
  }

  const params = new URLSearchParams(url.slice(queryIndex + 1));
  const raw = params.get("ff");

  return raw ? parseFeatureFlagPayload(raw, source) : null;
}

function buildOverrideState(
  override: FeatureFlagsOverride,
  reason: string,
): FeatureFlagsState {
  const reasons: FeatureFlagReasons = {};

  for (const key of Object.keys(override.values)) {
    reasons[key] = reason;
  }

  return {
    env: override.env,
    error: null,
    initialized: true,
    loading: false,
    reasons,
    values: override.values,
  };
}

function parseE2EFeatureFlags(): FeatureFlagsOverride | null {
  if (
    !E2E_MOCK_FEATURE_FLAGS ||
    E2E_MOCK_FEATURE_FLAGS === "0" ||
    E2E_MOCK_FEATURE_FLAGS === "false"
  ) {
    return null;
  }

  if (!E2E_FEATURE_FLAGS_RAW) {
    return { env: "e2e", values: {} };
  }

  try {
    const parsed = JSON.parse(E2E_FEATURE_FLAGS_RAW) as
      | E2EFeatureFlagsPayload
      | Record<string, unknown>;

    if (parsed && typeof parsed === "object" && "values" in parsed) {
      const payload = parsed as E2EFeatureFlagsPayload;

      return {
        env: typeof payload.env === "string" ? payload.env : "e2e",
        values: filterSupportedFlagValues(payload.values),
      };
    }

    return {
      env: "e2e",
      values: filterSupportedFlagValues(parsed as Record<string, unknown>),
    };
  } catch (error) {
    console.warn("Failed to parse EXPO_PUBLIC_E2E_FEATURE_FLAGS", error);
    return { env: "e2e", values: {} };
  }
}

async function readLaunchFeatureFlags(): Promise<FeatureFlagsOverride | null> {
  try {
    const initialUrl = await Linking.getInitialURL();

    if (!initialUrl) {
      return null;
    }

    return parseFeatureFlagsFromUrl(initialUrl, "launch_url");
  } catch (error) {
    console.warn("Failed to parse launch-url feature flags", error);
    return null;
  }
}

function createTimeoutError(label: string): Error {
  const error = new Error(`${label} timed out`);
  error.name = "TimeoutError";
  return error;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(createTimeoutError(label));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function fetchFeatureFlags(userToken: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FEATURE_FLAGS_TIMEOUT_MS);

  try {
    return await fetch(`${API_BASE}/api/feature_flags`, {
      headers: { Authorization: `Bearer ${userToken}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw createTimeoutError("Feature flags request");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getIdTokenWithTimeout(user: User, forceRefresh = false): Promise<string> {
  return withTimeout(
    getIdTokenWithAnonymousRecovery(user, forceRefresh).then((result) => result.idToken),
    FEATURE_FLAGS_TIMEOUT_MS,
    forceRefresh ? "Firebase ID token refresh" : "Firebase ID token",
  );
}

export function FeatureFlagsProvider({ children }: FeatureFlagsProviderProps) {
  const { user } = useAuth();
  const e2eOverrides = parseE2EFeatureFlags();

  const [state, setState] = useState<FeatureFlagsState>(() => ({
    env: null,
    error: null,
    initialized: Boolean(e2eOverrides) || !user,
    loading: Boolean(user) && !e2eOverrides,
    reasons: {},
    values: {},
  }));

  const refresh = useCallback(async () => {
    const launchUrlOverrides = await readLaunchFeatureFlags();

    if (launchUrlOverrides) {
      setState(buildOverrideState(launchUrlOverrides, "launch_url_override"));
      return;
    }

    const overrides = parseE2EFeatureFlags();

    if (overrides) {
      setState(buildOverrideState(overrides, "e2e_override"));
      return;
    }

    if (!user) {
      setState({
        env: null,
        error: null,
        initialized: true,
        loading: false,
        reasons: {},
        values: {},
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      let idToken: string;

      try {
        idToken = await getIdTokenWithTimeout(user);
      } catch {
        idToken = await getIdTokenWithTimeout(user, true);
      }

      let response = await fetchFeatureFlags(idToken);

      if (response.status === 401) {
        const refreshedToken = await getIdTokenWithTimeout(user, true);
        response = await fetchFeatureFlags(refreshedToken);
      }

      if (!response.ok) {
        throw new Error(`Failed to load feature flags: ${response.status}`);
      }

      const data = (await response.json()) as Partial<{
        env: string;
        reasons: FeatureFlagReasons;
        values: FeatureFlagValues;
      }>;

      setState({
        env: typeof data.env === "string" ? data.env : null,
        error: null,
        initialized: true,
        loading: false,
        reasons: filterSupportedFlagReasons(data.reasons),
        values: filterSupportedFlagValues(data.values),
      });
    } catch (error) {
      console.warn("Failed to load feature flags", error);
      setState((prev) => ({ ...prev, initialized: true, loading: false, error }));
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const overrides = parseFeatureFlagsFromUrl(url, "url_event");

      if (!overrides) {
        return;
      }

      setState(buildOverrideState(overrides, "url_event_override"));
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const isEnabled = useCallback(
    (flag: string, defaultValue = false) => {
      if (!flag) {
        return defaultValue;
      }

      const value = state.values[flag];
      return typeof value === "boolean" ? value : defaultValue;
    },
    [state.values]
  );

  const value = useMemo<FeatureFlagsContextValue>(
    () => ({
      env: state.env,
      error: state.error,
      initialized: state.initialized,
      isEnabled,
      loading: state.loading,
      reasons: state.reasons,
      refresh,
      values: state.values,
    }),
    [
      isEnabled,
      refresh,
      state.env,
      state.error,
      state.initialized,
      state.loading,
      state.reasons,
      state.values,
    ]
  );

  return (
    <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagsContextValue {
  return useContext(FeatureFlagsContext);
}

export function useFeatureFlag(flag: string, defaultValue = false): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(flag, defaultValue);
}
