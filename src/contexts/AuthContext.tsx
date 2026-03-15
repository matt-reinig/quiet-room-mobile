import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { StyleSheet, View } from "react-native";
import Spinner from "../components/Spinner";
import {
  ensureAuth as firebaseEnsureAuth,
  loginWithEmail as firebaseLoginWithEmail,
  loginWithGoogle as firebaseLoginWithGoogle,
  logout as firebaseLogout,
  sendPasswordReset as firebaseSendPasswordReset,
  signupWithEmail as firebaseSignupWithEmail,
} from "../lib/firebase";

type AuthContextValue = {
  isAnon: boolean;
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

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    initializing: true,
    isAnon: true,
    loading: false,
    user: null,
  });

  useEffect(() => {
    const initializeAuth = async () => {
      setState((prev) => ({ ...prev, initializing: true }));

      try {
        const initialUser = (await firebaseEnsureAuth()) as User;

        setState({
          initializing: false,
          isAnon: Boolean(initialUser?.isAnonymous),
          loading: false,
          user: initialUser,
        });
      } catch (error) {
        console.error("Auth initialization failed", error);
        setState((prev) => ({ ...prev, initializing: false }));
      }
    };

    void initializeAuth();
  }, []);

  const loginWithGoogle = async (idToken: string) => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const loginUser = (await firebaseLoginWithGoogle(idToken)) as {
        user: User;
      };

      setState({
        initializing: false,
        isAnon: Boolean(loginUser.user?.isAnonymous),
        loading: false,
        user: loginUser.user,
      });

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

      setState({
        initializing: false,
        isAnon: Boolean(loginUser.user?.isAnonymous),
        loading: false,
        user: loginUser.user,
      });

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

      setState({
        initializing: false,
        isAnon: Boolean(newUser.user?.isAnonymous),
        loading: false,
        user: newUser.user,
      });

      return newUser;
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false }));
      throw error;
    }
  };

  const logout = async () => {
    setState((prev) => ({ ...prev, loading: true }));

    const logoutUser = (await firebaseLogout()) as { user: User };

    setState({
      initializing: false,
      isAnon: Boolean(logoutUser.user?.isAnonymous),
      loading: false,
      user: logoutUser.user,
    });
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      isAnon: state.isAnon,
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





