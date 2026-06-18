import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as Crypto from "expo-crypto";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import * as WebBrowser from "expo-web-browser";
import {
  Alert,
  Keyboard,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { APP_SCHEME, GOOGLE_AUTH_CONFIG } from "../config/env";
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

const ANDROID_KEYBOARD_CLEARANCE = 36;
const IOS_KEYBOARD_CLEARANCE = 12;

function mapGoogleNativeError(rawError: unknown) {
  if (isErrorWithCode(rawError)) {
    switch (rawError.code) {
      case statusCodes.IN_PROGRESS:
        return "Google sign-in is already in progress.";
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return "Google Play Services is unavailable on this device.";
      case statusCodes.SIGN_IN_REQUIRED:
        return "Google sign-in could not be completed. Please try again.";
      default:
        return rawError.message || "Google sign-in failed.";
    }
  }

  return rawError instanceof Error ? rawError.message : "Google sign-in failed.";
}

function mapAppleError(rawError: unknown) {
  const code =
    typeof rawError === "object" && rawError !== null && "code" in rawError
      ? String(rawError.code || "")
      : "";
  const message = rawError instanceof Error ? rawError.message : "";

  if (code === "ERR_REQUEST_CANCELED") {
    return null;
  }

  if (code === "ERR_INVALID_OPERATION") {
    return "Apple sign-in is already in progress.";
  }

  if (
    code === "ERR_REQUEST_FAILED" ||
    /authorization attempt failed/i.test(message) ||
    /unknown reason/i.test(message)
  ) {
    return "Apple sign-in could not be started on this device. Please try again, or use email and password.";
  }

  return message || "Apple sign-in failed.";
}

function createAppleNonce() {
  return Array.from(Crypto.getRandomBytes(32), (value) => value.toString(16).padStart(2, "0")).join(
    ""
  );
}

export default function LoginModal({ onClose, visible }: LoginModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const {
    loading,
    loginWithApple,
    loginWithEmail,
    loginWithGoogle,
    requestPasswordReset,
    signUpWithEmail,
  } = useAuth();

  const [appleBusy, setAppleBusy] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<LoginMode>("signin");
  const [password, setPassword] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const keyboardInsetRef = useRef(0);
  const isDetox =
    Boolean(NativeModules.SettingsManager?.settings?.detoxServer) ||
    Boolean(NativeModules.SettingsManager?.settings?.detoxSessionId) ||
    Boolean(NativeModules.SettingsManager?.settings?.detoxEnableSynchronization);

  const nativeGoogleWebClientId =
    GOOGLE_AUTH_CONFIG.webClientId || GOOGLE_AUTH_CONFIG.clientId || "";
  const iosGoogleClientId = GOOGLE_AUTH_CONFIG.iosClientId || "";
  const browserGoogleRedirectUri = useMemo(
    () =>
      makeRedirectUri({
        native: `${APP_SCHEME}:/oauthredirect`,
      }),
    []
  );

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: GOOGLE_AUTH_CONFIG.androidClientId || undefined,
    clientId: GOOGLE_AUTH_CONFIG.clientId || undefined,
    iosClientId: GOOGLE_AUTH_CONFIG.iosClientId || undefined,
    redirectUri: Platform.OS === "android" ? browserGoogleRedirectUri : undefined,
    selectAccount: true,
    webClientId: GOOGLE_AUTH_CONFIG.webClientId || undefined,
  });

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    GoogleSignin.configure({
      webClientId: nativeGoogleWebClientId || undefined,
    });
  }, [nativeGoogleWebClientId]);

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      return;
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      const nextInset = event.endCoordinates.height;

      if (Platform.OS === "ios" && keyboardInsetRef.current > 0) {
        return;
      }

      keyboardInsetRef.current = nextInset;
      setKeyboardInset(nextInset);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardInsetRef.current = 0;
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [visible]);

  const googleAvailable = useMemo(() => {
    if (Platform.OS === "android") {
      return Boolean(nativeGoogleWebClientId);
    }

    return Boolean(iosGoogleClientId) && Boolean(request);
  }, [iosGoogleClientId, nativeGoogleWebClientId, request]);
  const showAppleSignIn = Platform.OS === "ios";
  const socialLoginBusy = loading || appleBusy || googleBusy;
  const modalTopPadding = Math.max(20, insets.top + 12);
  const modalBottomPadding =
    keyboardInset > 0
      ? keyboardInset +
        (Platform.OS === "ios" ? IOS_KEYBOARD_CLEARANCE : ANDROID_KEYBOARD_CLEARANCE)
      : Math.max(20, insets.bottom + 20);
  const modalMaxHeight = Math.max(280, windowHeight - modalTopPadding - modalBottomPadding);

  const resetAll = () => {
    setAppleBusy(false);
    setAppleError(null);
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
    if (Platform.OS === "android" || !response) {
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
        const message = rawError instanceof Error ? rawError.message : "Google sign-in failed.";
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

  const doNativeGoogleSignIn = async () => {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      if (GoogleSignin.hasPreviousSignIn()) {
        await GoogleSignin.signOut().catch(() => null);
      }

      const result = await GoogleSignin.signIn();

      if (!isSuccessResponse(result)) {
        return;
      }

      const idToken = result.data.idToken || (await GoogleSignin.getTokens()).idToken;

      if (!idToken) {
        throw new Error("Google sign-in did not return an id token.");
      }

      await loginWithGoogle(idToken);
      onClose?.();
    } catch (rawError) {
      setGoogleError(mapGoogleNativeError(rawError));
    } finally {
      setGoogleBusy(false);
    }
  };

  const doBrowserGoogleSignIn = async () => {
    try {
      const result = await promptAsync();

      if (result.type === "cancel" || result.type === "dismiss") {
        setGoogleBusy(false);
      }
    } catch (rawError) {
      const message = rawError instanceof Error ? rawError.message : "Google sign-in failed.";
      setGoogleError(message);
      setGoogleBusy(false);
    }
  };

  const doGoogleSignIn = async () => {
    if (!googleAvailable) {
      const configHint =
        Platform.OS === "android"
          ? "Google sign-in is not configured yet. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID or EXPO_PUBLIC_GOOGLE_CLIENT_ID first."
          : "Google sign-in is not configured yet. Add EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and rebuild the iOS app.";

      Alert.alert("Google Sign-In", configHint);
      return;
    }

    setGoogleBusy(true);
    setAppleError(null);
    setGoogleError(null);

    if (Platform.OS === "android") {
      await doNativeGoogleSignIn();
      return;
    }

    await doBrowserGoogleSignIn();
  };

  const doAppleSignIn = async () => {
    if (Platform.OS !== "ios") {
      return;
    }

    setAppleBusy(true);
    setAppleError(null);
    setGoogleError(null);

    try {
      const isAppleAuthAvailable = await AppleAuthentication.isAvailableAsync();

      if (!isAppleAuthAvailable) {
        throw new Error("Apple sign-in is not available on this device.");
      }

      const rawNonce = createAppleNonce();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );
      const credential = await AppleAuthentication.signInAsync({
        nonce: hashedNonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!credential.identityToken) {
        throw new Error("Apple sign-in did not return an identity token.");
      }

      await loginWithApple(credential.identityToken, rawNonce);
      onClose?.();
    } catch (rawError) {
      const message = mapAppleError(rawError);

      if (message) {
        console.warn("Apple sign-in failed", rawError);
        setAppleError(message);
      }
    } finally {
      setAppleBusy(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={closeModal} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable onPress={closeModal} style={StyleSheet.absoluteFill} />

        <View
          pointerEvents="box-none"
          style={[
            styles.keyboardFrame,
            {
              paddingBottom: modalBottomPadding,
              paddingTop: modalTopPadding,
            },
            keyboardInset > 0
              ? {
                  justifyContent: "flex-end",
                }
              : null,
          ]}
        >
          <View
            style={[
              styles.sheet,
              { maxHeight: modalMaxHeight },
              Platform.OS === "android" && keyboardInset > 0 ? styles.sheetLifted : null,
            ]}
            testID={testIds.loginModal}
          >
            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
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
                  {showAppleSignIn ? (
                    <View
                      pointerEvents={socialLoginBusy ? "none" : "auto"}
                      style={socialLoginBusy ? styles.disabledButton : null}
                    >
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        cornerRadius={12}
                        onPress={() => {
                          void doAppleSignIn();
                        }}
                        style={styles.appleButton}
                        testID={testIds.loginAppleButton}
                      />
                    </View>
                  ) : null}
                  <Pressable
                    disabled={socialLoginBusy || !googleAvailable}
                    onPress={() => {
                      void doGoogleSignIn();
                    }}
                    style={[
                      styles.googleButton,
                      (socialLoginBusy || !googleAvailable) && styles.disabledButton,
                    ]}
                    testID={testIds.loginGoogleButton}
                  >
                    <View style={styles.socialButtonContent}>
                      <Ionicons name="logo-google" size={20} color="#4285F4" />
                      <Text style={styles.googleButtonLabel}>
                        {googleBusy
                          ? Platform.OS === "android"
                            ? "Opening Google..."
                            : "Opening Google..."
                          : "Sign in with Google"}
                      </Text>
                    </View>
                  </Pressable>

                  <Text style={styles.helperCopy}>
                    {!googleAvailable
                      ? Platform.OS === "android"
                        ? "Google sign-in is disabled until EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is set."
                        : "Google sign-in is disabled until EXPO_PUBLIC_GOOGLE client IDs are set. You can still continue with Apple or email and password."
                      : showAppleSignIn
                        ? "Continue with Apple, Google, or email and password."
                        : "or use email and password"}
                  </Text>

                  {appleError ? <Text style={styles.error}>{appleError}</Text> : null}
                  {googleError ? <Text style={styles.error}>{googleError}</Text> : null}
                </>
              ) : null}

              {(mode === "signin" || mode === "signup") && (
                <>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete={isDetox ? "off" : "email"}
                    importantForAutofill={isDetox ? "no" : "auto"}
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="Email"
                    placeholderTextColor={mobileWeb.colors.gray500}
                    selectionColor={mobileWeb.colors.blue600}
                    style={styles.input}
                    testID={testIds.loginEmailInput}
                    textContentType={isDetox ? "none" : "username"}
                    value={email}
                  />

                  <TextInput
                    autoCapitalize="none"
                    autoComplete={isDetox ? "off" : "password"}
                    importantForAutofill={isDetox ? "no" : "auto"}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor={mobileWeb.colors.gray500}
                    secureTextEntry
                    selectionColor={mobileWeb.colors.blue600}
                    style={styles.input}
                    testID={testIds.loginPasswordInput}
                    textContentType={isDetox ? "oneTimeCode" : "password"}
                    value={password}
                  />
                </>
              )}

              {mode === "signin" ? (
                <>
                  {error ? (
                    <Text style={styles.error} testID={testIds.loginError}>
                      {error}
                    </Text>
                  ) : null}
                  <Pressable
                    disabled={loading}
                    onPress={() => void doSignin()}
                    style={styles.primaryButton}
                    testID={testIds.loginSigninButton}
                  >
                    <Text style={styles.primaryButtonLabel}>Sign in</Text>
                  </Pressable>
                </>
              ) : null}

              {mode === "signup" ? (
                <>
                  {signupError ? <Text style={styles.error}>{signupError}</Text> : null}
                  <Pressable
                    disabled={loading}
                    onPress={() => void doSignup()}
                    style={styles.successButton}
                    testID={testIds.loginSignupButton}
                  >
                    <Text style={styles.successButtonLabel}>Create account</Text>
                  </Pressable>
                </>
              ) : null}

              {mode === "reset" ? (
                <>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete={isDetox ? "off" : "email"}
                    importantForAutofill={isDetox ? "no" : "auto"}
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="Email"
                    placeholderTextColor={mobileWeb.colors.gray500}
                    selectionColor={mobileWeb.colors.blue600}
                    style={styles.input}
                    testID={testIds.loginEmailInput}
                    textContentType={isDetox ? "none" : "username"}
                    value={email}
                  />
                  {resetMsg ? <Text style={styles.successText}>{resetMsg}</Text> : null}
                  <Pressable
                    disabled={loading}
                    onPress={() => void doReset()}
                    style={styles.primaryButton}
                    testID={testIds.loginResetButton}
                  >
                    <Text style={styles.primaryButtonLabel}>Send reset link</Text>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(17, 24, 39, 0.35)",
    flex: 1,
  },
  keyboardFrame: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
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
  appleButton: {
    height: 46,
    width: "100%",
  },
  disabledButton: {
    opacity: 0.6,
  },
  error: {
    color: mobileWeb.colors.red600,
    fontSize: 13,
  },
  googleButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray300,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16,
  },
  googleButtonLabel: {
    color: mobileWeb.colors.gray900,
    fontSize: 15,
    fontWeight: "700",
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
    maxWidth: 420,
    overflow: "hidden",
    width: "100%",
  },
  sheetContent: {
    gap: 12,
    padding: 18,
  },
  sheetLifted: {
    marginBottom: 12,
  },
  socialButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
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
