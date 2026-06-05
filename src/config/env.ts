import { Platform } from "react-native";
import Constants from "expo-constants";

export type AppVariant = "prod" | "qa";
export type ReleaseEnv = "local" | "qa" | "prod";
export type VoiceDiagnosticAutorun = "both" | "expo-audio" | "expo-av" | "off";

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

type RenderMode = "native" | "voice-diagnostics" | "webview";

function resolveVoiceDiagnosticAutorun(value: string | undefined): VoiceDiagnosticAutorun {
  const normalizedValue = value?.toLowerCase();

  if (normalizedValue === "both" || normalizedValue === "expo-audio" || normalizedValue === "expo-av") {
    return normalizedValue;
  }

  return "off";
}

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

const appVariantRaw = process.env.EXPO_PUBLIC_APP_VARIANT;
const expoExtra = Constants.expoConfig?.extra ?? {};
const apiBaseRaw =
  (typeof expoExtra.apiBase === "string" ? expoExtra.apiBase : undefined) ||
  process.env.EXPO_PUBLIC_API_BASE ||
  (__DEV__ ? devApiBase : "https://your-prod-api.com");
const modelOptionsRaw = process.env.EXPO_PUBLIC_MODEL_OPTIONS;
const releaseEnvRaw = process.env.EXPO_PUBLIC_RELEASE_ENV;
const renderModeRaw =
  (typeof expoExtra.renderMode === "string" ? expoExtra.renderMode : undefined) ||
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
  (typeof expoExtra.streamingBase === "string" ? expoExtra.streamingBase : undefined) ||
    process.env.EXPO_PUBLIC_STREAMING_BASE ||
    ""
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
  process.env.EXPO_PUBLIC_DEFAULT_MODEL || "gpt-5.1-chat-latest";

export const MODEL_OPTIONS =
  modelOptionsRaw
    ?.split(",")
    .map((value: string) => value.trim())
    .filter(Boolean) || ["gpt-5.1-chat-latest", "gpt-5.3-chat-latest"];

function resolveRenderMode(value: string): RenderMode {
  const normalizedValue = value.toLowerCase();

  if (normalizedValue === "voice-diagnostics") {
    return "voice-diagnostics";
  }

  if (normalizedValue === "webview") {
    return "webview";
  }

  return "native";
}

export const RENDER_MODE: RenderMode = resolveRenderMode(renderModeRaw);

export const VOICE_PLAYBACK_DIAGNOSTICS_ENABLED =
  RENDER_MODE === "voice-diagnostics" ||
  process.env.EXPO_PUBLIC_VOICE_PLAYBACK_DIAGNOSTICS === "1";

export const VOICE_DIAGNOSTIC_CONVERSATION_ID =
  process.env.EXPO_PUBLIC_VOICE_DIAGNOSTIC_CONVERSATION_ID ||
  (typeof expoExtra.voiceDiagnosticConversationId === "string"
    ? expoExtra.voiceDiagnosticConversationId
    : "");

export const VOICE_DIAGNOSTIC_EMAIL =
  process.env.EXPO_PUBLIC_VOICE_DIAGNOSTIC_EMAIL ||
  (typeof expoExtra.voiceDiagnosticEmail === "string" ? expoExtra.voiceDiagnosticEmail : "");

export const VOICE_DIAGNOSTIC_AUTH_TOKEN =
  process.env.EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTH_TOKEN ||
  (typeof expoExtra.voiceDiagnosticAuthToken === "string"
    ? expoExtra.voiceDiagnosticAuthToken
    : "");

export const VOICE_DIAGNOSTIC_API_BASE =
  process.env.EXPO_PUBLIC_VOICE_DIAGNOSTIC_API_BASE ||
  (typeof expoExtra.voiceDiagnosticApiBase === "string"
    ? expoExtra.voiceDiagnosticApiBase
    : "");

export const VOICE_DIAGNOSTIC_MESSAGE_INDEX = Number.parseInt(
  process.env.EXPO_PUBLIC_VOICE_DIAGNOSTIC_MESSAGE_INDEX ||
    (typeof expoExtra.voiceDiagnosticMessageIndex === "string"
      ? expoExtra.voiceDiagnosticMessageIndex
      : "") ||
    "1",
  10
);

export const VOICE_DIAGNOSTIC_PASSWORD =
  process.env.EXPO_PUBLIC_VOICE_DIAGNOSTIC_PASSWORD ||
  (typeof expoExtra.voiceDiagnosticPassword === "string"
    ? expoExtra.voiceDiagnosticPassword
    : "");

export const VOICE_DIAGNOSTIC_RUNS = Number.parseInt(
  process.env.EXPO_PUBLIC_VOICE_DIAGNOSTIC_RUNS ||
    (typeof expoExtra.voiceDiagnosticRuns === "string" ? expoExtra.voiceDiagnosticRuns : "") ||
    "5",
  10
);

export const VOICE_DIAGNOSTIC_AUTORUN = resolveVoiceDiagnosticAutorun(
  process.env.EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTORUN ||
    (typeof expoExtra.voiceDiagnosticAutorun === "string"
      ? expoExtra.voiceDiagnosticAutorun
      : undefined)
);

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
