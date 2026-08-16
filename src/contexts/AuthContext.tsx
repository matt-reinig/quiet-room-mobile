import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { Linking, NativeModules, StyleSheet, View } from "react-native";
import Spinner from "../components/Spinner";
import {
  deleteAccount as firebaseDeleteAccount,
  ensureAuth as firebaseEnsureAuth,
  loginWithCustomToken as firebaseLoginWithCustomToken,
  loginWithApple as firebaseLoginWithApple,
  loginWithEmail as firebaseLoginWithEmail,
  loginWithGoogle as firebaseLoginWithGoogle,
  logout as firebaseLogout,
  sendPasswordReset as firebaseSendPasswordReset,
  signupWithEmail as firebaseSignupWithEmail,
  subscribeAuthUser,
} from "../lib/firebase";
import { APP_VARIANT, RELEASE_ENV } from "../config/env";
import { removeUserQueries } from "../lib/queryClient";

type AuthContextValue = {
  deleteAccount: () => Promise<void>;
  isAnon: boolean;
  loginWithApple: (idToken: string, rawNonce: string) => Promise<unknown>;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<unknown>;
  loginWithGoogle: (idToken: string) => Promise<unknown>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  signUpWithEmail: (email: string, password: string) => Promise<unknown>;
  user: User | null;
};

type AuthProviderProps = {
  children: ReactNode;
};

type AuthState = {
  initializing: boolean;
  isAnon: boolean;
  loading: boolean;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const detoxSettings = NativeModules.SettingsManager?.settings ?? {};
const isDetoxSession = Boolean(
  detoxSettings.detoxServer ||
    detoxSettings.detoxSessionId ||
    detoxSettings.detoxEnableSynchronization !== undefined
);
const allowLocalQaE2ELogin = APP_VARIANT === "qa" && RELEASE_ENV === "local";

type E2ELogin =
  | { customToken: string }
  | { email: string; password: string };

function parseE2ELoginFromUrl(url: string | null): E2ELogin | null {
  if ((!isDetoxSession && !allowLocalQaE2ELogin) || !url) {
    return null;
  }

  const queryIndex = url.indexOf("?");
  if (queryIndex < 0) {
    return null;
  }

  const params = new URLSearchParams(url.slice(queryIndex + 1));
  const customToken = params.get("e2eLoginCustomToken")?.trim();

  if (customToken) {
    return { customToken };
  }

  const email = params.get("e2eLoginEmail")?.trim();
  const password = params.get("e2eLoginPassword") || "";

  if (!email || password.length < 6) {
    return null;
  }

  return { email, password };
}

async function readLaunchE2ELogin() {
  try {
    return parseE2ELoginFromUrl(await Linking.getInitialURL());
  } catch (error) {
    console.warn("Failed to parse launch-url e2e login", error);
    return null;
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    initializing: true,
    isAnon: true,
    loading: false,
    user: null,
  });
  const cachedUserUidRef = useRef<string | null>(null);

  const applyResolvedUser = useCallback((resolvedUser: User | null, loading = false) => {
    setState({
      initializing: false,
      isAnon: Boolean(resolvedUser?.isAnonymous),
      loading,
      user: resolvedUser,
    });
  }, []);

  useEffect(() => {
    return subscribeAuthUser((nextUser) => {
      setState((prev) => {
        const nextIsAnon = Boolean(nextUser?.isAnonymous);

        if (
          prev.initializing ||
          (prev.user?.uid === nextUser?.uid && prev.isAnon === nextIsAnon)
        ) {
          return prev;
        }

        return {
          ...prev,
          isAnon: nextIsAnon,
          loading: false,
          user: nextUser,
        };
      });
    });
  }, []);

  useEffect(() => {
    const previousUid = cachedUserUidRef.current;
    const nextUid = state.user?.uid || null;

    if (previousUid && previousUid !== nextUid) {
      removeUserQueries(previousUid);
    }

    cachedUserUidRef.current = nextUid;
  }, [state.user?.uid]);

  useEffect(() => {
    const initializeAuth = async () => {
      setState((prev) => ({ ...prev, initializing: true }));

      try {
        const initialUser = (await firebaseEnsureAuth()) as User;
        const e2eLogin = await readLaunchE2ELogin();
        const resolvedUser = e2eLogin
          ? ("customToken" in e2eLogin
              ? ((await firebaseLoginWithCustomToken(e2eLogin.customToken)) as { user: User }).user
              : ((await firebaseLoginWithEmail(e2eLogin.email, e2eLogin.password)) as { user: User }).user)
          : initialUser;

        applyResolvedUser(resolvedUser);
      } catch (error) {
        console.error("Auth initialization failed", error);
        setState((prev) => ({ ...prev, initializing: false }));
      }
    };

    void initializeAuth();
  }, [applyResolvedUser]);

  const loginWithGoogle = async (idToken: string) => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const loginUser = (await firebaseLoginWithGoogle(idToken)) as {
        user: User;
      };

      applyResolvedUser(loginUser.user);

      return loginUser;
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  const loginWithApple = async (idToken: string, rawNonce: string) => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const loginUser = (await firebaseLoginWithApple(idToken, rawNonce)) as {
        user: User;
      };

      applyResolvedUser(loginUser.user);

      return loginUser;
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const loginUser = (await firebaseLoginWithEmail(email, password)) as {
        user: User;
      };

      applyResolvedUser(loginUser.user);

      return loginUser;
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  const requestPasswordReset = async (email: string) => {
    try {
      await firebaseSendPasswordReset(email);
      return true;
    } catch (error) {
      console.error("requestPasswordReset failed", error);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const newUser = (await firebaseSignupWithEmail(email, password)) as {
        user: User;
      };

      applyResolvedUser(newUser.user);

      return newUser;
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  const logout = async () => {
    setState((prev) => ({ ...prev, loading: true }));

    const logoutUser = (await firebaseLogout()) as User;

    applyResolvedUser(logoutUser);
  };

  const deleteAccount = async () => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const nextUser = (await firebaseDeleteAccount()) as User;

      applyResolvedUser(nextUser);
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      deleteAccount,
      isAnon: state.isAnon,
      loginWithApple,
      loading: state.loading,
      loginWithEmail,
      loginWithGoogle,
      logout,
      requestPasswordReset,
      signUpWithEmail,
      user: state.user,
    }),
    [state.isAnon, state.loading, state.user]
  );

  if (state.initializing) {
    return (
      <View style={styles.initializing}>
        <Spinner label="Preparing Quiet Room..." size="lg" tone="accent" />
      </View>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return value;
}

const styles = StyleSheet.create({
  initializing: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
});
