import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Linking } from "react-native";
import { API_BASE } from "../config/env";
import {
  filterSupportedFlagReasons,
  filterSupportedFlagValues,
} from "../lib/featureFlags";
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

async function fetchFeatureFlags(userToken: string): Promise<Response> {
  return fetch(`${API_BASE}/api/feature_flags`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
}

export function FeatureFlagsProvider({ children }: FeatureFlagsProviderProps) {
  const { user } = useAuth();
  const e2eOverrides = parseE2EFeatureFlags();

  const [state, setState] = useState<FeatureFlagsState>(() => ({
    env: null,
    error: null,
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
        idToken = await user.getIdToken();
      } catch {
        idToken = await user.getIdToken(true);
      }

      let response = await fetchFeatureFlags(idToken);

      if (response.status === 401) {
        const refreshedToken = await user.getIdToken(true);
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
        loading: false,
        reasons: filterSupportedFlagReasons(data.reasons),
        values: filterSupportedFlagValues(data.values),
      });
    } catch (error) {
      console.error("Failed to load feature flags", error);
      setState((prev) => ({ ...prev, loading: false, error }));
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
      isEnabled,
      loading: state.loading,
      reasons: state.reasons,
      refresh,
      values: state.values,
    }),
    [isEnabled, refresh, state.env, state.error, state.loading, state.reasons, state.values]
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
