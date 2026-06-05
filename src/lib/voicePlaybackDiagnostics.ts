import { VOICE_PLAYBACK_DIAGNOSTICS_ENABLED } from "../config/env";

export type VoicePlaybackEngine =
  | "expo-audio-live-get"
  | "expo-av-live-get"
  | "expo-av-preset"
  | "expo-av-text-post-cache";

export type VoicePlaybackDiagnosticPhase =
  | "auth"
  | "cleanup"
  | "create"
  | "error"
  | "fetch"
  | "finish"
  | "pause"
  | "play"
  | "status"
  | "summary";

export type VoicePlaybackDiagnosticEvent = {
  apiBase?: string;
  attemptId: string;
  authUid?: string;
  clippedAttempts?: number;
  didJustFinish?: boolean;
  durationMillis?: number;
  engine: VoicePlaybackEngine;
  error?: string;
  errorAttempts?: number;
  httpStatus?: number;
  isBuffering?: boolean;
  isLoaded?: boolean;
  messageIndex?: number;
  passedAttempts?: number;
  phase: VoicePlaybackDiagnosticPhase;
  playbackMode: string;
  positionMillis?: number;
  totalAttempts?: number;
  tokenAlgorithm?: string;
  tokenAudience?: string;
  tokenHasKid?: boolean;
  tokenIssuer?: string;
  tokenProvider?: string;
  tokenSource?: string;
  tokenSubject?: string;
  timestamp: string;
};

export function createVoicePlaybackAttemptId(engine: VoicePlaybackEngine): string {
  return `${engine}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isVoicePlaybackClipped(
  positionMillis?: number,
  durationMillis?: number
): boolean {
  if (
    typeof positionMillis !== "number" ||
    typeof durationMillis !== "number" ||
    durationMillis <= 0
  ) {
    return false;
  }

  return positionMillis + 750 < durationMillis;
}

export function publishVoicePlaybackDiagnostic(
  event: Omit<VoicePlaybackDiagnosticEvent, "timestamp">,
  options: { force?: boolean } = {}
): VoicePlaybackDiagnosticEvent {
  const normalizedEvent: VoicePlaybackDiagnosticEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  if (options.force || VOICE_PLAYBACK_DIAGNOSTICS_ENABLED) {
    console.info("[voice-playback-diagnostics]", JSON.stringify(normalizedEvent));
  }

  return normalizedEvent;
}
