import { useEffect, useMemo, useState } from "react";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { GOOGLE_AUTH_CONFIG, GOOGLE_AUTH_ENABLED } from "../config/env";
import { useAuth } from "../contexts/AuthContext";
import { mobileWeb } from "../theme/mobileWeb";
import { testIds } from "../testIds";

type AuthError = {
  code?: string;
};

type LoginMode = "reset" | "signin" | "signup";

type LoginModalProps = {
  onClose?: () => void;
  visible: boolean;
};

WebBrowser.maybeCompleteAuthSession();

function mapAuthError(code: string | undefined, kind: "login" | "signup") {
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/email-already-in-use":
      return "Email is already in use. Try signing in.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return kind === "login"
        ? "Incorrect email or password."
        : "Unable to continue. Try a different email.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    default:
      return kind === "login"
        ? "Login failed. Please try again."
        : "Sign up failed.";
  }
}

export default function LoginModal({ onClose, visible }: LoginModalProps) {
  const { loading, loginWithEmail, loginWithGoogle, requestPasswordReset, signUpWithEmail } =
    useAuth();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<LoginMode>("signin");
  const [password, setPassword] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: GOOGLE_AUTH_CONFIG.androidClientId || undefined,
    clientId: GOOGLE_AUTH_CONFIG.clientId || undefined,
    iosClientId: GOOGLE_AUTH_CONFIG.iosClientId || undefined,
    selectAccount: true,
    webClientId: GOOGLE_AUTH_CONFIG.webClientId || undefined,
  });

  const googleAvailable = useMemo(
    () => GOOGLE_AUTH_ENABLED && Boolean(request),
    [request]
  );

  const resetAll = () => {
    setEmail("");
    setError(null);
    setMode("signin");
    setPassword("");
    setResetMsg(null);
    setSignupError(null);
    setGoogleBusy(false);
    setGoogleError(null);
  };

  useEffect(() => {
    if (!visible) {
      resetAll();
    }
  }, [visible]);

  useEffect(() => {
    if (!response) {
      return;
    }

    if (response.type !== "success") {
      if (googleBusy) {
        setGoogleBusy(false);
      }

      if (response.type === "error") {
        setGoogleError("Google sign-in failed. Please try again.");
      }

      return;
    }

    const idToken = response.params?.id_token;

    if (!idToken) {
      setGoogleBusy(false);
      setGoogleError("Google sign-in did not return an id token.");
      return;
    }

    const completeGoogleLogin = async () => {
      try {
        await loginWithGoogle(idToken);
        onClose?.();
      } catch (rawError) {
        const message =
          rawError instanceof Error ? rawError.message : "Google sign-in failed.";
        setGoogleError(message);
      } finally {
        setGoogleBusy(false);
      }
    };

    void completeGoogleLogin();
  }, [googleBusy, loginWithGoogle, onClose, response]);

  const closeModal = () => {
    resetAll();
    onClose?.();
  };

  const doReset = async () => {
    setResetMsg(null);

    try {
      await requestPasswordReset(email);
      setResetMsg("If an account exists, a reset link was sent.");
    } catch {
      setResetMsg("Could not send reset email");
    }
  };

  const doSignin = async () => {
    setError(null);

    try {
      await loginWithEmail(email, password);
      closeModal();
    } catch (rawError) {
      const message = mapAuthError((rawError as AuthError)?.code, "login");
      setError(message);
    }
  };

  const doSignup = async () => {
    setSignupError(null);

    try {
      await signUpWithEmail(email, password);
      closeModal();
    } catch (rawError) {
      const message = mapAuthError((rawError as AuthError)?.code, "signup");
      setSignupError(message);
    }
  };

  const doGoogleSignIn = async () => {
    if (!googleAvailable) {
      Alert.alert(
        "Google Sign-In",
        "Google OAuth is not configured yet. Add EXPO_PUBLIC_GOOGLE_* client IDs first."
      );
      return;
    }

    setGoogleBusy(true);
    setGoogleError(null);

    try {
      const result = await promptAsync();

      if (result.type === "cancel" || result.type === "dismiss") {
        setGoogleBusy(false);
      }
    } catch (rawError) {
      const message =
        rawError instanceof Error ? rawError.message : "Google sign-in failed.";
      setGoogleError(message);
      setGoogleBusy(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={closeModal} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable onPress={closeModal} style={StyleSheet.absoluteFill} />

        <View style={styles.sheet} testID={testIds.loginModal}>
          <View style={styles.headerRow}>
            <View style={styles.tabs}>
              <Pressable onPress={() => setMode("signin")} testID={testIds.loginTabSignin}>
                <Text style={[styles.tab, mode === "signin" && styles.tabActive]}>Sign in</Text>
              </Pressable>
              <Pressable onPress={() => setMode("signup")} testID={testIds.loginTabSignup}>
                <Text style={[styles.tab, mode === "signup" && styles.tabActive]}>
                  Create account
                </Text>
              </Pressable>
              <Pressable onPress={() => setMode("reset")} testID={testIds.loginTabReset}>
                <Text style={[styles.tab, mode === "reset" && styles.tabActive]}>
                  Reset password
                </Text>
              </Pressable>
            </View>
            <Pressable onPress={closeModal} style={styles.closeButton} testID={testIds.loginClose}>
              <Text style={styles.closeLabel}>X</Text>
            </Pressable>
          </View>

          {mode === "signin" ? (
            <>
              <Pressable
                disabled={loading || googleBusy || !googleAvailable}
                onPress={() => {
                  void doGoogleSignIn();
                }}
                style={[
                  styles.primaryOutlineButton,
                  (loading || googleBusy || !googleAvailable) && styles.disabledButton,
                ]}
                testID={testIds.loginGoogleButton}
              >
                <Text style={styles.primaryOutlineButtonLabel}>
                  {googleBusy ? "Opening Google..." : "Sign in with Google"}
                </Text>
              </Pressable>

              {!googleAvailable ? (
                <Text style={styles.helperCopy}>
                  Google sign-in is disabled until EXPO_PUBLIC_GOOGLE client IDs are set.
                </Text>
              ) : (
                <Text style={styles.helperCopy}>or use email and password</Text>
              )}

              {googleError ? <Text style={styles.error}>{googleError}</Text> : null}
            </>
          ) : null}

          {(mode === "signin" || mode === "signup") && (
            <>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="Email"
                style={styles.input}
                testID={testIds.loginEmailInput}
                value={email}
              />

              <TextInput
                autoCapitalize="none"
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
                style={styles.input}
                testID={testIds.loginPasswordInput}
                value={password}
              />
            </>
          )}

          {mode === "signin" ? (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable disabled={loading} onPress={() => void doSignin()} style={styles.primaryButton} testID={testIds.loginSigninButton}>
                <Text style={styles.primaryButtonLabel}>Sign in</Text>
              </Pressable>
            </>
          ) : null}

          {mode === "signup" ? (
            <>
              {signupError ? <Text style={styles.error}>{signupError}</Text> : null}
              <Pressable disabled={loading} onPress={() => void doSignup()} style={styles.successButton} testID={testIds.loginSignupButton}>
                <Text style={styles.successButtonLabel}>Create account</Text>
              </Pressable>
            </>
          ) : null}

          {mode === "reset" ? (
            <>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="Email"
                style={styles.input}
                testID={testIds.loginEmailInput}
                value={email}
              />
              {resetMsg ? <Text style={styles.successText}>{resetMsg}</Text> : null}
              <Pressable disabled={loading} onPress={() => void doReset()} style={styles.primaryButton} testID={testIds.loginResetButton}>
                <Text style={styles.primaryButtonLabel}>Send reset link</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.35)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  closeButton: {
    alignItems: "center",
    borderColor: mobileWeb.colors.gray300,
    borderRadius: 10,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  closeLabel: {
    color: mobileWeb.colors.gray500,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  error: {
    color: mobileWeb.colors.red600,
    fontSize: 13,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  helperCopy: {
    color: mobileWeb.colors.gray500,
    fontSize: 12,
    marginBottom: 12,
    marginTop: 10,
    textAlign: "center",
  },
  input: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray300,
    borderRadius: 12,
    borderWidth: 1,
    color: mobileWeb.colors.gray900,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue600,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16,
  },
  primaryButtonLabel: {
    color: mobileWeb.colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  primaryOutlineButton: {
    alignItems: "center",
    borderColor: mobileWeb.colors.blue200,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16,
  },
  primaryOutlineButtonLabel: {
    color: mobileWeb.colors.blue600,
    fontSize: 15,
    fontWeight: "700",
  },
  sheet: {
    backgroundColor: mobileWeb.colors.white,
    borderRadius: 20,
    gap: 12,
    maxWidth: 420,
    padding: 18,
    width: "100%",
  },
  successButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue600,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16,
  },
  successButtonLabel: {
    color: mobileWeb.colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  successText: {
    color: mobileWeb.colors.gray600,
    fontSize: 13,
  },
  tab: {
    color: mobileWeb.colors.gray500,
    fontSize: 13,
    fontWeight: "600",
  },
  tabActive: {
    color: mobileWeb.colors.gray900,
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingRight: 12,
  },
});

