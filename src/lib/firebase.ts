import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import type { Persistence, User } from "@firebase/auth";
import { Platform } from "react-native";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  API_BASE,
  FIREBASE_AUTH_EMULATOR_HOST,
  FIREBASE_CONFIG,
  GOOGLE_AUTH_CONFIG,
} from "../config/env";

const firebaseAuth = require("@firebase/auth") as typeof import("@firebase/auth") & {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
};

const {
  createUserWithEmailAndPassword,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  OAuthProvider,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
} = firebaseAuth;

const getReactNativePersistence = firebaseAuth.getReactNativePersistence;

const hasFirebaseConfig = Object.values(FIREBASE_CONFIG).every(Boolean);

if (!hasFirebaseConfig) {
  console.warn(
    "Firebase config is incomplete. Set EXPO_PUBLIC_FB_API_KEY, EXPO_PUBLIC_FB_AUTH_DOMAIN, and EXPO_PUBLIC_FB_PROJECT_ID."
  );
}

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const nativeGoogleWebClientId = GOOGLE_AUTH_CONFIG.webClientId || GOOGLE_AUTH_CONFIG.clientId || "";

if (Platform.OS === "android" && nativeGoogleWebClientId) {
  GoogleSignin.configure({
    webClientId: nativeGoogleWebClientId,
  });
}

function createAuth() {
  if (!getReactNativePersistence) {
    return getAuth(app);
  }

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";

    if (code === "auth/already-initialized") {
      return getAuth(app);
    }

    throw error;
  }
}

export const auth = createAuth();
let authEmulatorConfigured = false;

function maybeConnectAuthEmulator() {
  if (authEmulatorConfigured || !FIREBASE_AUTH_EMULATOR_HOST) {
    return;
  }

  connectAuthEmulator(auth, `http://${FIREBASE_AUTH_EMULATOR_HOST}`, {
    disableWarnings: true,
  });
  authEmulatorConfigured = true;
}

maybeConnectAuthEmulator();

const STALE_ANONYMOUS_SESSION_ERROR_CODES = new Set([
  "auth/id-token-expired",
  "auth/invalid-refresh-token",
  "auth/invalid-user-token",
  "auth/token-expired",
  "auth/user-not-found",
  "auth/user-token-expired",
]);

type IdTokenResult = {
  idToken: string;
  recovered: boolean;
  user: User;
};

type AnonymousRecoveryResult = {
  idToken: string;
  user: User;
};

let anonymousRecoveryPromise: Promise<AnonymousRecoveryResult> | null = null;
let anonymousTokenRequest: { promise: Promise<string>; uid: string } | null = null;

function getAuthErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

export function isStaleAnonymousSessionError(error: unknown): boolean {
  const code = getAuthErrorCode(error);
  return STALE_ANONYMOUS_SESSION_ERROR_CODES.has(code);
}

async function getAnonymousIdToken(user: User, forceRefresh: boolean): Promise<string> {
  if (anonymousTokenRequest?.uid === user.uid) {
    return anonymousTokenRequest.promise;
  }

  const promise = user.getIdToken(forceRefresh);
  const request = { promise, uid: user.uid };
  anonymousTokenRequest = request;

  try {
    return await promise;
  } finally {
    if (anonymousTokenRequest === request) {
      anonymousTokenRequest = null;
    }
  }
}

async function resetToAnonymousSession(options: { forceSignOut?: boolean } = {}) {
  const currentUser = auth.currentUser;

  if (currentUser && (options.forceSignOut || !currentUser.isAnonymous)) {
    try {
      await signOut(auth);
    } catch (error) {
      console.warn("signOut during session reset failed", error);
    }

    if (!currentUser.isAnonymous && Platform.OS === "android") {
      await GoogleSignin.signOut().catch(() => null);
    }
  }

  const credential = await signInAnonymously(auth);
  return credential.user;
}

async function recoverAnonymousUser(staleUser: User): Promise<AnonymousRecoveryResult> {
  if (anonymousRecoveryPromise) {
    return anonymousRecoveryPromise;
  }

  const activeUser = auth.currentUser;

  if (activeUser && activeUser.uid !== staleUser.uid) {
    if (!activeUser.isAnonymous) {
      throw new Error("The authenticated user changed during anonymous session recovery.");
    }

    try {
      return {
        idToken: await getAnonymousIdToken(activeUser, true),
        user: activeUser,
      };
    } catch (error) {
      if (!isStaleAnonymousSessionError(error)) {
        throw error;
      }
    }
  }

  const recovery = (async () => {
    const user = await resetToAnonymousSession({ forceSignOut: true });
    return {
      idToken: await getAnonymousIdToken(user, false),
      user,
    };
  })();
  anonymousRecoveryPromise = recovery;

  try {
    return await recovery;
  } finally {
    if (anonymousRecoveryPromise === recovery) {
      anonymousRecoveryPromise = null;
    }
  }
}

export function subscribeAuthUser(listener: (user: User | null) => void): () => void {
  return onIdTokenChanged(auth, listener);
}

export async function recoverStaleAnonymousSession(error?: unknown): Promise<User | null> {
  if (error && !isStaleAnonymousSessionError(error)) {
    return null;
  }

  if (anonymousRecoveryPromise) {
    return (await anonymousRecoveryPromise).user;
  }

  const currentUser = auth.currentUser;

  if (!currentUser?.isAnonymous) {
    return null;
  }

  console.warn("Recovering stale anonymous Firebase session.");
  return (await recoverAnonymousUser(currentUser)).user;
}

export async function getIdTokenWithAnonymousRecovery(
  user: User,
  forceRefresh = false
): Promise<IdTokenResult> {
  const shouldForceRefresh = forceRefresh || user.isAnonymous;

  try {
    return {
      idToken: user.isAnonymous
        ? await getAnonymousIdToken(user, shouldForceRefresh)
        : await user.getIdToken(shouldForceRefresh),
      recovered: false,
      user,
    };
  } catch (error) {
    if (!user.isAnonymous || !isStaleAnonymousSessionError(error)) {
      throw error;
    }

    const recovered = await recoverAnonymousUser(user);

    return {
      idToken: recovered.idToken,
      recovered: true,
      user: recovered.user,
    };
  }
}

async function restoreNativeGoogleUser(): Promise<User | null> {
  if (Platform.OS !== "android" || !nativeGoogleWebClientId || !GoogleSignin.hasPreviousSignIn()) {
    return null;
  }

  try {
    const response = await GoogleSignin.signInSilently();

    if (response.type !== "success") {
      return null;
    }

    const idToken = response.data.idToken || (await GoogleSignin.getTokens()).idToken;

    if (!idToken) {
      return null;
    }

    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    return result.user;
  } catch (error) {
    console.warn("restoreNativeGoogleUser failed", error);
    return null;
  }
}

export async function ensureAuth(): Promise<User> {
  await auth.authStateReady();

  if (auth.currentUser) {
    const currentUser = auth.currentUser;

    if (!currentUser.isAnonymous) {
      return currentUser;
    }

    try {
      await getAnonymousIdToken(currentUser, true);
      return auth.currentUser || currentUser;
    } catch (error) {
      const recoveredUser = await recoverStaleAnonymousSession(error);

      if (recoveredUser) {
        return recoveredUser;
      }

      console.warn("ensureAuth: anonymous token refresh failed; keeping existing session", error);
      return currentUser;
    }
  }

  const restoredGoogleUser = await restoreNativeGoogleUser();

  if (restoredGoogleUser) {
    return restoredGoogleUser;
  }

  try {
    const credential = await signInAnonymously(auth);
    return credential.user;
  } catch (error) {
    console.error("ensureAuth: anon sign-in failed", error);
    throw error;
  }
}

export async function loginWithGoogle(idToken: string) {
  const trimmedToken = typeof idToken === "string" ? idToken.trim() : "";

  if (!trimmedToken) {
    throw new Error("Google sign-in token is missing.");
  }

  const credential = GoogleAuthProvider.credential(trimmedToken);
  return signInWithCredential(auth, credential);
}

export async function loginWithApple(idToken: string, rawNonce: string) {
  const trimmedToken = typeof idToken === "string" ? idToken.trim() : "";
  const trimmedNonce = typeof rawNonce === "string" ? rawNonce.trim() : "";

  if (!trimmedToken) {
    throw new Error("Apple sign-in token is missing.");
  }

  if (!trimmedNonce) {
    throw new Error("Apple sign-in nonce is missing.");
  }

  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({
    idToken: trimmedToken,
    rawNonce: trimmedNonce,
  });

  return signInWithCredential(auth, credential);
}

export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithCustomToken(token: string) {
  const trimmedToken = typeof token === "string" ? token.trim() : "";

  if (!trimmedToken) {
    throw new Error("Custom sign-in token is missing.");
  }

  return signInWithCustomToken(auth, trimmedToken);
}

export async function signupWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return resetToAnonymousSession();
}

export async function deleteAccount() {
  const currentUser = auth.currentUser;

  if (!currentUser || currentUser.isAnonymous) {
    throw new Error("Delete account requires a signed-in account.");
  }

  const idToken = await currentUser.getIdToken(true);
  const response = await fetch(`${API_BASE}/api/account`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    let message = "Unable to delete account.";

    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload?.error === "string" && payload.error.trim()) {
        message = payload.error.trim();
      }
    } catch {
      // Fall back to the default message if the response body is not JSON.
    }

    throw new Error(message);
  }

  return resetToAnonymousSession();
}

export async function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email);
}
