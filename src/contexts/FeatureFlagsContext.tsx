import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { API_BASE } from "../config/env";
import { useAuth } from "./AuthContext";

type FeatureFlagReasons = Record<string, string>;
type FeatureFlagValues = Record<string, boolean>;

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

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  env: null,
  error: null,
  isEnabled: (_flag, defaultValue = false) => defaultValue,
  loading: false,
  reasons: {},
  refresh: async () => {},
  values: {},
});

async function fetchFeatureFlags(userToken: string): Promise<Response> {
  return fetch(`${API_BASE}/api/feature_flags`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
}

export function FeatureFlagsProvider({ children }: FeatureFlagsProviderProps) {
  const { user } = useAuth();

  const [state, setState] = useState<FeatureFlagsState>(() => ({
    env: null,
    error: null,
    loading: Boolean(user),
    reasons: {},
    values: {},
  }));

  const refresh = useCallback(async () => {
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
        reasons:
          data.reasons && typeof data.reasons === "object" ? data.reasons : {},
        values: data.values && typeof data.values === "object" ? data.values : {},
      });
    } catch (error) {
      console.error("Failed to load feature flags", error);
      setState((prev) => ({ ...prev, loading: false, error }));
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
