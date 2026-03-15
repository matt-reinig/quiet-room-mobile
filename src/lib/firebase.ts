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
import { FIREBASE_CONFIG } from "../config/env";

const hasFirebaseConfig = Object.values(FIREBASE_CONFIG).every(Boolean);

if (!hasFirebaseConfig) {
  console.warn(
    "Firebase config is incomplete. Set EXPO_PUBLIC_FB_API_KEY, EXPO_PUBLIC_FB_AUTH_DOMAIN, and EXPO_PUBLIC_FB_PROJECT_ID."
  );
}

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);

export const auth = getAuth(app);

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
  }

  return signInAnonymously(auth);
}

export async function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email);
}
