import { Platform } from "react-native";

export type AppVariant = "prod" | "qa";
export type ReleaseEnv = "local" | "qa" | "prod";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
};

type GoogleAuthConfig = {
  androidClientId: string;
  clientId: string;
  iosClientId: string;
  webClientId: string;
};

type RenderMode = "native" | "webview";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeAndroidHostAliasForPlatform(value: string): string {
  if (Platform.OS === "android") {
    return value;
  }

  return value
    .replace("://10.0.2.2", "://localhost")
    .replace(/^10\.0\.2\.2(?=:|$)/, "localhost");
}

function resolveAppVariant(value: string | undefined): AppVariant {
  return value?.toLowerCase() === "qa" ? "qa" : "prod";
}

function resolveReleaseEnv(value: string | undefined): ReleaseEnv {
  const normalizedValue = value?.toLowerCase();

  if (normalizedValue === "local" || normalizedValue === "qa" || normalizedValue === "prod") {
    return normalizedValue;
  }

  return "qa";
}

function resolveAppScheme(appVariant: AppVariant): string {
  return appVariant === "qa" ? "quietroommobileqa" : "quietroommobile";
}

const devApiBase =
  Platform.OS === "android" ? "http://10.0.2.2:5000" : "http://localhost:5000";

const apiBaseRaw =
  process.env.EXPO_PUBLIC_API_BASE ||
  (__DEV__ ? devApiBase : "https://your-prod-api.com");

const appVariantRaw = process.env.EXPO_PUBLIC_APP_VARIANT;
const modelOptionsRaw = process.env.EXPO_PUBLIC_MODEL_OPTIONS;
const releaseEnvRaw = process.env.EXPO_PUBLIC_RELEASE_ENV;
const renderModeRaw =
  process.env.EXPO_PUBLIC_RENDER_MODE ||
  process.env.EXPO_PUBLIC_WEB_PARITY_MODE ||
  "native";
const webAppUrlRaw =
  process.env.EXPO_PUBLIC_WEB_APP_URL || "https://quiet-room-qa.vercel.app";

export const APP_VARIANT = resolveAppVariant(appVariantRaw);
export const RELEASE_ENV = resolveReleaseEnv(releaseEnvRaw);
export const APP_SCHEME = resolveAppScheme(APP_VARIANT);
export const API_BASE = trimTrailingSlashes(normalizeAndroidHostAliasForPlatform(apiBaseRaw));

export const STREAMING_BASE = trimTrailingSlashes(
  process.env.EXPO_PUBLIC_STREAMING_BASE || ""
);

export const CONTACT_EMAIL =
  process.env.EXPO_PUBLIC_CONTACT_EMAIL || "Quietroomapp@gmail.com";

export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ||
  "https://quiet-room-privacy-policy.vercel.app/privacy";

export const SUPPORT_URL =
  process.env.EXPO_PUBLIC_SUPPORT_URL ||
  "https://quiet-room-privacy-policy.vercel.app/support";

export const ACCOUNT_DELETION_URL =
  process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL ||
  "https://quiet-room-privacy-policy.vercel.app/account-deletion";

export const DEFAULT_MODEL =
  process.env.EXPO_PUBLIC_DEFAULT_MODEL || "claude-sonnet-4-6";

export const MODEL_OPTIONS =
  modelOptionsRaw
    ?.split(",")
    .map((value: string) => value.trim())
    .filter(Boolean) || ["claude-sonnet-4-6"];

export const RENDER_MODE: RenderMode =
  renderModeRaw.toLowerCase() === "webview" ? "webview" : "native";

export const WEB_APP_URL = trimTrailingSlashes(webAppUrlRaw.trim());

export const FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FB_API_KEY || "",
  authDomain: process.env.EXPO_PUBLIC_FB_AUTH_DOMAIN || "",
  projectId: process.env.EXPO_PUBLIC_FB_PROJECT_ID || "",
};

export const FIREBASE_AUTH_EMULATOR_HOST = (
  normalizeAndroidHostAliasForPlatform(process.env.EXPO_PUBLIC_FB_AUTH_EMULATOR_HOST || "")
).trim();

export const GOOGLE_AUTH_CONFIG: GoogleAuthConfig = {
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "",
  clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "",
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "",
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
};

export const GOOGLE_AUTH_ENABLED = Object.values(GOOGLE_AUTH_CONFIG).some(Boolean);

export function resolveStreamingUrl(): string {
  if (STREAMING_BASE.length > 0) {
    return `${STREAMING_BASE}/api/chat/stream`;
  }

  return `${API_BASE}/api/chat/stream`;
}

export function resolveVoiceUrl(): string {
  if (STREAMING_BASE.length > 0) {
    return `${STREAMING_BASE}/api/voice_stream`;
  }

  return `${API_BASE}/api/voice_stream`;
}
