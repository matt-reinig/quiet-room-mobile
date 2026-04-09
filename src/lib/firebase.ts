import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import type { Persistence, User } from "@firebase/auth";
import { Platform } from "react-native";
import { getApp, getApps, initializeApp } from "firebase/app";
import { FIREBASE_CONFIG, GOOGLE_AUTH_CONFIG } from "../config/env";

const firebaseAuth = require("@firebase/auth") as typeof import("@firebase/auth") & {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
};

const {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
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
    return auth.currentUser;
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

export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signupWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    await signOut(auth);

    if (Platform.OS === "android") {
      await GoogleSignin.signOut().catch(() => null);
    }
  }

  return signInAnonymously(auth);
}

export async function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email);
}
