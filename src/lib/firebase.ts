import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { Platform } from "react-native";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { FIREBASE_CONFIG, GOOGLE_AUTH_CONFIG } from "../config/env";

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

export const auth = getAuth(app);

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

export function ensureAuth(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        unsubscribe();

        if (user) {
          resolve(user);
          return;
        }

        try {
          const restoredGoogleUser = await restoreNativeGoogleUser();

          if (restoredGoogleUser) {
            resolve(restoredGoogleUser);
            return;
          }

          const credential = await signInAnonymously(auth);
          resolve(credential.user);
        } catch (error) {
          console.error("ensureAuth: anon sign-in failed", error);
          reject(error);
        }
      },
      (error) => {
        unsubscribe();
        console.error("ensureAuth: onAuthStateChanged error", error);
        reject(error);
      }
    );
  });
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
