import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Audio, type AVPlaybackSource, type AVPlaybackStatus } from "expo-av";
import {
  createAudioPlayer,
  setAudioModeAsync as setExpoAudioModeAsync,
  type AudioPlayer,
  type AudioSource,
} from "expo-audio";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  API_BASE,
  VOICE_DIAGNOSTIC_API_BASE,
  VOICE_DIAGNOSTIC_AUTH_TOKEN,
  VOICE_DIAGNOSTIC_AUTORUN,
  VOICE_DIAGNOSTIC_CONVERSATION_ID,
  VOICE_DIAGNOSTIC_EMAIL,
  VOICE_DIAGNOSTIC_MESSAGE_INDEX,
  VOICE_DIAGNOSTIC_PASSWORD,
  VOICE_DIAGNOSTIC_RUNS,
} from "../config/env";
import { useAuth } from "../contexts/AuthContext";
import {
  createVoicePlaybackAttemptId,
  isVoicePlaybackClipped,
  publishVoicePlaybackDiagnostic,
  type VoicePlaybackDiagnosticEvent,
  type VoicePlaybackEngine,
} from "../lib/voicePlaybackDiagnostics";
import { testIds } from "../testIds";
import { mobileWeb } from "../theme/mobileWeb";

type AttemptResult = {
  attemptId: string;
  clipped: boolean;
  durationMillis?: number;
  engine: VoicePlaybackEngine;
  error?: string;
  positionMillis?: number;
};

type VoiceProbeResult = {
  contentType?: string | null;
  error?: string;
  httpStatus?: number;
};

type AuthContextResult = {
  authUid?: string;
  headers: Record<string, string>;
  tokenAlgorithm?: string;
  tokenAudience?: string;
  tokenHasKid?: boolean;
  tokenIssuer?: string;
  tokenProvider?: string;
  tokenSource?: string;
  tokenSubject?: string;
};

type DecodedJwtHeader = {
  alg?: unknown;
  kid?: unknown;
};

type DecodedJwtPayload = {
  aud?: unknown;
  firebase?: {
    sign_in_provider?: unknown;
  };
  iss?: unknown;
  sub?: unknown;
};

const KNOWN_ASSISTANT_MESSAGE =
  "Known assistant message for QR-MOB-021 voice clipping checks. Use the same saved assistant reply and message index for both player paths so the backend stream is identical.";
const PLAYBACK_ATTEMPT_TIMEOUT_MS = 360000;
const PLAYBACK_STATUS_UPDATE_INTERVAL_MS = 1000;

function buildConversationVoiceUri(baseUrl: string, conversationId: string, messageIndex: number): string {
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}conversation_id=${encodeURIComponent(conversationId)}&message_index=${messageIndex}`;
}

function buildVoiceUrl(apiBase: string): string {
  return `${apiBase.replace(/\/+$/, "")}/api/voice_stream`;
}

function coerceNonNegativeInteger(value: string, fallback: number): number {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

function coercePositiveInteger(value: string, fallback: number): number {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue >= 1 ? parsedValue : fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function decodeJwtSection<T>(segment: string | undefined): T | null {
  if (!segment || typeof globalThis.atob !== "function") {
    return null;
  }

  try {
    const normalizedSegment = segment.replace(/-/g, "+").replace(/_/g, "/");
    const paddingLength = (4 - (normalizedSegment.length % 4)) % 4;
    const decodedSegment = globalThis.atob(`${normalizedSegment}${"=".repeat(paddingLength)}`);
    const parsedSegment = JSON.parse(decodedSegment);
    return parsedSegment && typeof parsedSegment === "object" ? parsedSegment : null;
  } catch {
    return null;
  }
}

function decodeJwtHeader(token: string): DecodedJwtHeader | null {
  return decodeJwtSection<DecodedJwtHeader>(token.split(".")[0]);
}

function decodeJwtPayload(token: string): DecodedJwtPayload | null {
  return decodeJwtSection<DecodedJwtPayload>(token.split(".")[1]);
}

async function setExpoAvAudioMode() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    interruptionModeAndroid: 1,
    interruptionModeIOS: 1,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    staysActiveInBackground: false,
  });
}

async function setExpoAudioMode() {
  await setExpoAudioModeAsync({
    allowsRecording: false,
    interruptionMode: "duckOthers",
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  });
}

function summarize(results: AttemptResult[], engine: VoicePlaybackEngine) {
  const engineResults = results.filter((result) => result.engine === engine);
  const errors = engineResults.filter((result) => result.error).length;
  const clipped = engineResults.filter((result) => result.clipped).length;
  const passed = engineResults.length - errors - clipped;

  return {
    clipped,
    errors,
    passed,
    total: engineResults.length,
  };
}

export default function VoicePlaybackDiagnosticsScreen() {
  const { isAnon, loading: authLoading, loginWithEmail, logout, user } = useAuth();
  const [email, setEmail] = useState(VOICE_DIAGNOSTIC_EMAIL);
  const [password, setPassword] = useState(VOICE_DIAGNOSTIC_PASSWORD);
  const [authError, setAuthError] = useState("");
  const [apiBase, setApiBase] = useState(VOICE_DIAGNOSTIC_API_BASE || API_BASE);
  const [conversationId, setConversationId] = useState(VOICE_DIAGNOSTIC_CONVERSATION_ID);
  const [messageIndex, setMessageIndex] = useState(
    Number.isFinite(VOICE_DIAGNOSTIC_MESSAGE_INDEX)
      ? String(VOICE_DIAGNOSTIC_MESSAGE_INDEX)
      : "1"
  );
  const [runCount, setRunCount] = useState(
    Number.isFinite(VOICE_DIAGNOSTIC_RUNS) ? String(VOICE_DIAGNOSTIC_RUNS) : "5"
  );
  const [events, setEvents] = useState<VoicePlaybackDiagnosticEvent[]>([]);
  const [results, setResults] = useState<AttemptResult[]>([]);
  const [runningEngine, setRunningEngine] = useState<VoicePlaybackEngine | null>(null);

  const activeCleanupRef = useRef<(() => void) | null>(null);
  const autorunStartedRef = useRef(false);
  const stopRequestedRef = useRef(false);

  const trimmedApiBase = apiBase.trim().replace(/\/+$/, "");
  const voiceUrl = useMemo(() => buildVoiceUrl(trimmedApiBase || API_BASE), [trimmedApiBase]);
  const parsedMessageIndex = coerceNonNegativeInteger(messageIndex, 1);
  const parsedRunCount = coercePositiveInteger(runCount, 5);
  const trimmedConversationId = conversationId.trim();
  const hasDiagnosticAuthToken = VOICE_DIAGNOSTIC_AUTH_TOKEN.trim().length > 0;
  const hasSignedInUser = Boolean(user && !isAnon);
  const canRun =
    (hasSignedInUser || hasDiagnosticAuthToken) && trimmedConversationId.length > 0 && !runningEngine;
  const avSummary = summarize(results, "expo-av-live-get");
  const audioSummary = summarize(results, "expo-audio-live-get");
  const signedInUserLabel =
    hasDiagnosticAuthToken
      ? "Diagnostic env token"
      : hasSignedInUser
        ? user?.email || user?.uid || "Signed-in user"
        : "Anonymous session";

  const emit = useCallback(
    (event: Omit<VoicePlaybackDiagnosticEvent, "timestamp">) => {
      const loggedEvent = publishVoicePlaybackDiagnostic(event, { force: true });
      setEvents((previousEvents) => [loggedEvent, ...previousEvents].slice(0, 160));
    },
    []
  );

  const resolveAuthContext = useCallback(async (): Promise<AuthContextResult> => {
    const token = VOICE_DIAGNOSTIC_AUTH_TOKEN.trim() || (user ? await user.getIdToken(true) : "");
    const header = decodeJwtHeader(token);
    const payload = decodeJwtPayload(token);
    const tokenSubject = asString(payload?.sub);

    return {
      authUid: VOICE_DIAGNOSTIC_AUTH_TOKEN.trim() ? tokenSubject : user?.uid,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      tokenAlgorithm: asString(header?.alg),
      tokenAudience: asString(payload?.aud),
      tokenHasKid: Boolean(header?.kid),
      tokenIssuer: asString(payload?.iss),
      tokenProvider: asString(payload?.firebase?.sign_in_provider),
      tokenSource: VOICE_DIAGNOSTIC_AUTH_TOKEN.trim() ? "diagnostic-env-token" : "firebase-user",
      tokenSubject,
    };
  }, [user]);

  const probeConversationGet = useCallback(
    async (
      attemptId: string,
      engine: VoicePlaybackEngine,
      authContext: AuthContextResult
    ): Promise<VoiceProbeResult> => {
      const requestApiBase = trimmedApiBase || API_BASE;
      const url = `${requestApiBase}/api/conversations/${encodeURIComponent(trimmedConversationId)}`;

      try {
        const response = await fetch(url, {
          headers: authContext.headers,
        });
        const contentType = response.headers.get("content-type");

        if (response.ok) {
          const body = await response.json().catch(() => null);
          const messages =
            body && typeof body === "object" && Array.isArray(body.messages) ? body.messages : [];
          const indexedMessage = messages[parsedMessageIndex];
          const indexedRole =
            indexedMessage && typeof indexedMessage === "object"
              ? asString(indexedMessage.role)
              : undefined;

          emit({
            attemptId,
            apiBase: requestApiBase,
            authUid: authContext.authUid,
            engine,
            httpStatus: response.status,
            messageIndex: parsedMessageIndex,
            phase: "fetch",
            playbackMode: `conversation-get/messages-${messages.length}/index-role-${indexedRole || "unknown"}`,
            tokenAudience: authContext.tokenAudience,
            tokenAlgorithm: authContext.tokenAlgorithm,
            tokenHasKid: authContext.tokenHasKid,
            tokenIssuer: authContext.tokenIssuer,
            tokenProvider: authContext.tokenProvider,
            tokenSource: authContext.tokenSource,
            tokenSubject: authContext.tokenSubject,
          });
          return { contentType, httpStatus: response.status };
        }

        const body = await response.text();
        const error = `Conversation GET returned ${response.status}: ${body.slice(0, 180)}`;
        emit({
          attemptId,
          apiBase: requestApiBase,
          authUid: authContext.authUid,
          engine,
          error,
          httpStatus: response.status,
          messageIndex: parsedMessageIndex,
          phase: "fetch",
          playbackMode: `conversation-get/${contentType || "unknown"}`,
          tokenAudience: authContext.tokenAudience,
          tokenAlgorithm: authContext.tokenAlgorithm,
          tokenHasKid: authContext.tokenHasKid,
          tokenIssuer: authContext.tokenIssuer,
          tokenProvider: authContext.tokenProvider,
          tokenSource: authContext.tokenSource,
          tokenSubject: authContext.tokenSubject,
        });
        return { contentType, error, httpStatus: response.status };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Conversation GET failed.";
        emit({
          attemptId,
          apiBase: requestApiBase,
          authUid: authContext.authUid,
          engine,
          error: message,
          messageIndex: parsedMessageIndex,
          phase: "fetch",
          playbackMode: "conversation-get",
          tokenAudience: authContext.tokenAudience,
          tokenAlgorithm: authContext.tokenAlgorithm,
          tokenHasKid: authContext.tokenHasKid,
          tokenIssuer: authContext.tokenIssuer,
          tokenProvider: authContext.tokenProvider,
          tokenSource: authContext.tokenSource,
          tokenSubject: authContext.tokenSubject,
        });
        return { error: message };
      }
    },
    [emit, parsedMessageIndex, trimmedApiBase, trimmedConversationId]
  );

  const probeVoiceGet = useCallback(
    async (
      attemptId: string,
      engine: VoicePlaybackEngine,
      uri: string,
      authHeaders: Record<string, string>,
      attemptIndex: number
    ): Promise<VoiceProbeResult> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 15000);

      try {
        const response = await fetch(uri, {
          headers: authHeaders,
          signal: controller.signal,
        });
        const contentType = response.headers.get("content-type");

        if (response.ok) {
          controller.abort();
          emit({
            attemptId,
            engine,
            httpStatus: response.status,
            messageIndex: parsedMessageIndex,
            phase: "fetch",
            playbackMode: `probe-get/run-${attemptIndex}/${contentType || "unknown"}`,
          });
          return { contentType, httpStatus: response.status };
        }

        const body = await response.text();
        const error = `Probe GET returned ${response.status}: ${body.slice(0, 180)}`;
        emit({
          attemptId,
          engine,
          error,
          httpStatus: response.status,
          messageIndex: parsedMessageIndex,
          phase: "fetch",
          playbackMode: `probe-get/run-${attemptIndex}/${contentType || "unknown"}`,
        });
        return { contentType, error, httpStatus: response.status };
      } catch (error) {
        const message =
          error instanceof Error && error.name === "AbortError"
            ? "Probe GET aborted after headers."
            : error instanceof Error
              ? error.message
              : "Probe GET failed.";
        emit({
          attemptId,
          engine,
          error: message,
          messageIndex: parsedMessageIndex,
          phase: "fetch",
          playbackMode: `probe-get/run-${attemptIndex}`,
        });
        return { error: message };
      } finally {
        clearTimeout(timeout);
      }
    },
    [emit, parsedMessageIndex]
  );

  const runExpoAvAttempt = useCallback(
    async (
      source: AVPlaybackSource,
      uri: string,
      authHeaders: Record<string, string>,
      attemptIndex: number
    ): Promise<AttemptResult> => {
      const engine: VoicePlaybackEngine = "expo-av-live-get";
      const attemptId = createVoicePlaybackAttemptId(engine);
      let sound: Audio.Sound | null = null;
      let lastDurationMillis: number | undefined;
      let lastPositionMillis: number | undefined;

      emit({
        attemptId,
        engine,
        messageIndex: parsedMessageIndex,
        phase: "create",
        playbackMode: `live-get/run-${attemptIndex}`,
      });

      await setExpoAvAudioMode();
      await probeVoiceGet(attemptId, engine, uri, authHeaders, attemptIndex);

      return new Promise((resolve) => {
        let settled = false;

        const finish = async (error?: string) => {
          if (settled) {
            return;
          }

          settled = true;
          activeCleanupRef.current = null;
          clearTimeout(timeout);

          if (sound) {
            sound.setOnPlaybackStatusUpdate(null);
            try {
              await sound.unloadAsync();
            } catch {
              // Best effort cleanup for a diagnostic run.
            }
          }

          const clipped = isVoicePlaybackClipped(lastPositionMillis, lastDurationMillis);
          emit({
            attemptId,
            durationMillis: lastDurationMillis,
            engine,
            error,
            messageIndex: parsedMessageIndex,
            phase: error ? "error" : "finish",
            playbackMode: `live-get/run-${attemptIndex}`,
            positionMillis: lastPositionMillis,
          });
          resolve({
            attemptId,
            clipped,
            durationMillis: lastDurationMillis,
            engine,
            error,
            positionMillis: lastPositionMillis,
          });
        };

        const timeout = setTimeout(() => {
          void finish("Timed out before playback finished.");
        }, PLAYBACK_ATTEMPT_TIMEOUT_MS);

        activeCleanupRef.current = () => {
          void finish("Stopped by diagnostic operator.");
        };

        Audio.Sound.createAsync(
          source,
          { progressUpdateIntervalMillis: PLAYBACK_STATUS_UPDATE_INTERVAL_MS, shouldPlay: true },
          (status: AVPlaybackStatus) => {
            if (!status.isLoaded) {
              if (status.error) {
                void finish(status.error);
              }
              return;
            }

            lastDurationMillis = status.durationMillis;
            lastPositionMillis = status.positionMillis;
            emit({
              attemptId,
              didJustFinish: status.didJustFinish,
              durationMillis: status.durationMillis,
              engine,
              isBuffering: status.isBuffering,
              isLoaded: status.isLoaded,
              messageIndex: parsedMessageIndex,
              phase: "status",
              playbackMode: `live-get/run-${attemptIndex}`,
              positionMillis: status.positionMillis,
            });

            if (status.didJustFinish) {
              void finish();
            }
          },
          false
        )
          .then((result) => {
            sound = result.sound;
            emit({
              attemptId,
              engine,
              messageIndex: parsedMessageIndex,
              phase: "play",
              playbackMode: `live-get/run-${attemptIndex}`,
            });
          })
          .catch((error: unknown) => {
            void finish(error instanceof Error ? error.message : "Unable to start expo-av.");
          });
      });
    },
    [emit, parsedMessageIndex, probeVoiceGet]
  );

  const runExpoAudioAttempt = useCallback(
    async (
      source: AudioSource,
      uri: string,
      authHeaders: Record<string, string>,
      attemptIndex: number
    ): Promise<AttemptResult> => {
      const engine: VoicePlaybackEngine = "expo-audio-live-get";
      const attemptId = createVoicePlaybackAttemptId(engine);
      let player: AudioPlayer | null = null;
      let lastDurationMillis: number | undefined;
      let lastPositionMillis: number | undefined;
      let stablePausedPolls = 0;

      emit({
        attemptId,
        engine,
        messageIndex: parsedMessageIndex,
        phase: "create",
        playbackMode: `live-get/run-${attemptIndex}`,
      });

      await setExpoAudioMode();
      await probeVoiceGet(attemptId, engine, uri, authHeaders, attemptIndex);

      return new Promise((resolve) => {
        let settled = false;

        const finish = (error?: string) => {
          if (settled) {
            return;
          }

          settled = true;
          activeCleanupRef.current = null;
          clearInterval(interval);
          clearTimeout(timeout);

          if (player) {
            try {
              player.pause();
              player.remove();
            } catch {
              // Best effort cleanup for a diagnostic run.
            }
          }

          const clipped = isVoicePlaybackClipped(lastPositionMillis, lastDurationMillis);
          emit({
            attemptId,
            durationMillis: lastDurationMillis,
            engine,
            error,
            messageIndex: parsedMessageIndex,
            phase: error ? "error" : "finish",
            playbackMode: `live-get/run-${attemptIndex}`,
            positionMillis: lastPositionMillis,
          });
          resolve({
            attemptId,
            clipped,
            durationMillis: lastDurationMillis,
            engine,
            error,
            positionMillis: lastPositionMillis,
          });
        };

        const interval = setInterval(() => {
          if (!player) {
            return;
          }

          const status = player.currentStatus;
          const currentDurationMillis = Math.round(status.duration * 1000);
          const currentPositionMillis = Math.round(status.currentTime * 1000);
          const hasUsableDuration = Number.isFinite(currentDurationMillis) && currentDurationMillis > 0;
          const isStablePausedTerminalState =
            status.isLoaded &&
            !status.isBuffering &&
            status.timeControlStatus === "paused" &&
            currentPositionMillis > 1000 &&
            Math.abs(currentPositionMillis - (lastPositionMillis ?? 0)) <= 50;

          lastDurationMillis = hasUsableDuration ? currentDurationMillis : undefined;
          lastPositionMillis = currentPositionMillis;
          stablePausedPolls = isStablePausedTerminalState ? stablePausedPolls + 1 : 0;

          emit({
            attemptId,
            didJustFinish: status.didJustFinish,
            durationMillis: lastDurationMillis,
            engine,
            isBuffering: status.isBuffering,
            isLoaded: status.isLoaded,
            messageIndex: parsedMessageIndex,
            phase: "status",
            playbackMode: `${status.playbackState}/${status.timeControlStatus}`,
            positionMillis: lastPositionMillis,
          });

          if (status.didJustFinish) {
            finish();
          } else if (stablePausedPolls >= 12) {
            finish();
          }
        }, PLAYBACK_STATUS_UPDATE_INTERVAL_MS);

        const timeout = setTimeout(() => {
          finish("Timed out before playback finished.");
        }, PLAYBACK_ATTEMPT_TIMEOUT_MS);

        activeCleanupRef.current = () => {
          finish("Stopped by diagnostic operator.");
        };

        try {
          player = createAudioPlayer(source, { updateInterval: PLAYBACK_STATUS_UPDATE_INTERVAL_MS });
          player.play();
          emit({
            attemptId,
            engine,
            messageIndex: parsedMessageIndex,
            phase: "play",
            playbackMode: `live-get/run-${attemptIndex}`,
          });
        } catch (error) {
          finish(error instanceof Error ? error.message : "Unable to start expo-audio.");
        }
      });
    },
    [emit, parsedMessageIndex, probeVoiceGet]
  );

  const runHarness = useCallback(
    async (engine: VoicePlaybackEngine) => {
      if (!canRun) {
        return;
      }

      stopRequestedRef.current = false;
      setRunningEngine(engine);

      const authContext = await resolveAuthContext();
      const harnessAttemptId = createVoicePlaybackAttemptId(engine);
      emit({
        attemptId: harnessAttemptId,
        apiBase: trimmedApiBase || API_BASE,
        authUid: authContext.authUid,
        engine,
        messageIndex: parsedMessageIndex,
        phase: "auth",
        playbackMode: authContext.tokenSource || "token-refresh",
        tokenAlgorithm: authContext.tokenAlgorithm,
        tokenAudience: authContext.tokenAudience,
        tokenHasKid: authContext.tokenHasKid,
        tokenIssuer: authContext.tokenIssuer,
        tokenProvider: authContext.tokenProvider,
        tokenSource: authContext.tokenSource,
        tokenSubject: authContext.tokenSubject,
      });
      await probeConversationGet(harnessAttemptId, engine, authContext);

      const uri = buildConversationVoiceUri(voiceUrl, trimmedConversationId, parsedMessageIndex);
      const source = {
        headers: authContext.headers,
        uri,
      };
      const batchResults: AttemptResult[] = [];

      for (let attemptIndex = 1; attemptIndex <= parsedRunCount; attemptIndex += 1) {
        if (stopRequestedRef.current) {
          break;
        }

        const result =
          engine === "expo-av-live-get"
            ? await runExpoAvAttempt(
                {
                  ...source,
                  overrideFileExtensionAndroid: "mp3",
                },
                uri,
                authContext.headers,
                attemptIndex
              )
            : await runExpoAudioAttempt(source, uri, authContext.headers, attemptIndex);

        batchResults.push(result);
        setResults((previousResults) => [result, ...previousResults]);
      }

      const batchSummary = summarize(batchResults, engine);
      emit({
        attemptId: harnessAttemptId,
        apiBase: trimmedApiBase || API_BASE,
        authUid: authContext.authUid,
        clippedAttempts: batchSummary.clipped,
        engine,
        errorAttempts: batchSummary.errors,
        messageIndex: parsedMessageIndex,
        passedAttempts: batchSummary.passed,
        phase: "summary",
        playbackMode: `batch/${stopRequestedRef.current ? "stopped" : "complete"}/requested-${parsedRunCount}/completed-${batchSummary.total}`,
        tokenAudience: authContext.tokenAudience,
        tokenAlgorithm: authContext.tokenAlgorithm,
        tokenHasKid: authContext.tokenHasKid,
        tokenIssuer: authContext.tokenIssuer,
        tokenProvider: authContext.tokenProvider,
        tokenSource: authContext.tokenSource,
        tokenSubject: authContext.tokenSubject,
        totalAttempts: batchSummary.total,
      });
      activeCleanupRef.current = null;
      setRunningEngine(null);
    },
    [
      canRun,
      emit,
      parsedMessageIndex,
      parsedRunCount,
      probeConversationGet,
      resolveAuthContext,
      runExpoAudioAttempt,
      runExpoAvAttempt,
      trimmedConversationId,
      trimmedApiBase,
      voiceUrl,
    ]
  );

  const stopHarness = useCallback(() => {
    stopRequestedRef.current = true;
    activeCleanupRef.current?.();
    setRunningEngine(null);
  }, []);

  useEffect(() => {
    if (VOICE_DIAGNOSTIC_AUTORUN === "off" || autorunStartedRef.current || !canRun) {
      return;
    }

    autorunStartedRef.current = true;

    const runAutorun = async () => {
      if (VOICE_DIAGNOSTIC_AUTORUN === "expo-av" || VOICE_DIAGNOSTIC_AUTORUN === "both") {
        await runHarness("expo-av-live-get");
      }

      if (stopRequestedRef.current) {
        return;
      }

      if (VOICE_DIAGNOSTIC_AUTORUN === "expo-audio" || VOICE_DIAGNOSTIC_AUTORUN === "both") {
        await runHarness("expo-audio-live-get");
      }
    };

    void runAutorun();
  }, [canRun, runHarness]);

  const submitLogin = useCallback(async () => {
    setAuthError("");

    try {
      await loginWithEmail(email.trim(), password);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }, [email, loginWithEmail, password]);

  const submitLogout = useCallback(async () => {
    setAuthError("");

    try {
      await logout();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }, [logout]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>QR-MOB-021</Text>
          <Text style={styles.title}>Voice playback diagnostics</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Known assistant message</Text>
          <Text style={styles.copy}>{KNOWN_ASSISTANT_MESSAGE}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Auth</Text>
          <Text style={styles.copy}>Current: {signedInUserLabel}</Text>
          <View style={styles.formGrid}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                style={styles.input}
                testID={testIds.voiceDiagnostics.email}
                value={email}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
                testID={testIds.voiceDiagnostics.password}
                value={password}
              />
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              disabled={authLoading || !email.trim() || password.length < 6}
              onPress={() => {
                void submitLogin();
              }}
              style={({ pressed }) => [
                styles.button,
                (authLoading || !email.trim() || password.length < 6) && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              testID={testIds.voiceDiagnostics.login}
            >
              <Text style={styles.buttonText}>{authLoading ? "Signing in..." : "Sign in"}</Text>
            </Pressable>
            <Pressable
              disabled={authLoading}
              onPress={() => {
                void submitLogout();
              }}
              style={({ pressed }) => [
                styles.iconButton,
                authLoading && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.iconButtonText}>Sign out</Text>
            </Pressable>
          </View>
          {authError ? <Text style={styles.error}>{authError}</Text> : null}
        </View>

        <View style={styles.formGrid}>
          <View style={styles.field}>
            <Text style={styles.label}>API base</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setApiBase}
              style={styles.input}
              value={apiBase}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Conversation ID</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setConversationId}
              style={styles.input}
              testID={testIds.voiceDiagnostics.conversationId}
              value={conversationId}
            />
          </View>
          <View style={styles.compactFields}>
            <View style={styles.field}>
              <Text style={styles.label}>Message index</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={setMessageIndex}
                style={styles.input}
                testID={testIds.voiceDiagnostics.messageIndex}
                value={messageIndex}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Runs</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={setRunCount}
                style={styles.input}
                testID={testIds.voiceDiagnostics.runCount}
                value={runCount}
              />
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            disabled={!canRun}
            onPress={() => {
              void runHarness("expo-av-live-get");
            }}
            style={({ pressed }) => [
              styles.button,
              !canRun && styles.buttonDisabled,
              pressed && canRun && styles.buttonPressed,
            ]}
            testID={testIds.voiceDiagnostics.runExpoAv}
          >
            <Text style={styles.buttonText}>Run expo-av</Text>
          </Pressable>
          <Pressable
            disabled={!canRun}
            onPress={() => {
              void runHarness("expo-audio-live-get");
            }}
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              !canRun && styles.buttonDisabled,
              pressed && canRun && styles.buttonPressed,
            ]}
            testID={testIds.voiceDiagnostics.runExpoAudio}
          >
            <Text style={styles.secondaryButtonText}>Run expo-audio</Text>
          </Pressable>
          <Pressable
            disabled={!runningEngine}
            onPress={stopHarness}
            style={({ pressed }) => [
              styles.iconButton,
              !runningEngine && styles.buttonDisabled,
              pressed && runningEngine && styles.buttonPressed,
            ]}
            testID={testIds.voiceDiagnostics.stop}
          >
            <Text style={styles.iconButtonText}>Stop</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setEvents([]);
              setResults([]);
            }}
            style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}
            testID={testIds.voiceDiagnostics.reset}
          >
            <Text style={styles.iconButtonText}>Reset</Text>
          </Pressable>
        </View>

        <View style={styles.summary} testID={testIds.voiceDiagnostics.summary}>
          <Text style={styles.summaryTitle}>
            {runningEngine ? `Running ${runningEngine}` : "Baseline comparison"}
          </Text>
          <View style={styles.summaryGrid}>
            <Text style={styles.summaryLine}>
              expo-av: {avSummary.passed}/{avSummary.total} pass, {avSummary.clipped} clipped,{" "}
              {avSummary.errors} error
            </Text>
            <Text style={styles.summaryLine}>
              expo-audio: {audioSummary.passed}/{audioSummary.total} pass,{" "}
              {audioSummary.clipped} clipped, {audioSummary.errors} error
            </Text>
          </View>
        </View>

        <View style={styles.logPanel} testID={testIds.voiceDiagnostics.eventLog}>
          <Text style={styles.panelTitle}>Telemetry</Text>
          {events.length === 0 ? (
            <Text style={styles.copy}>No playback events yet.</Text>
          ) : (
            events.map((event) => (
              <Text key={`${event.attemptId}-${event.timestamp}-${event.phase}`} style={styles.logLine}>
                {event.timestamp.slice(11, 19)} {event.engine} {event.phase} mode=
                {event.playbackMode} pos={event.positionMillis ?? "-"} dur=
                {event.durationMillis ?? "-"} buffer=
                {String(event.isBuffering ?? "-")} finish={String(event.didJustFinish ?? "-")}
                {event.httpStatus ? ` status=${event.httpStatus}` : ""}
                {event.apiBase ? ` api=${event.apiBase}` : ""}
                {event.authUid ? ` uid=${event.authUid}` : ""}
                {event.tokenSource ? ` token=${event.tokenSource}` : ""}
                {event.tokenAlgorithm ? ` alg=${event.tokenAlgorithm}` : ""}
                {event.tokenHasKid === undefined ? "" : ` kid=${String(event.tokenHasKid)}`}
                {event.tokenAudience ? ` aud=${event.tokenAudience}` : ""}
                {event.tokenSubject ? ` sub=${event.tokenSubject}` : ""}
                {event.totalAttempts === undefined
                  ? ""
                  : ` total=${event.totalAttempts} pass=${event.passedAttempts ?? 0} clipped=${event.clippedAttempts ?? 0} errors=${event.errorAttempts ?? 0}`}
                {event.error ? ` error=${event.error}` : ""}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  button: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.gray900,
    borderRadius: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: mobileWeb.colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  compactFields: {
    flexDirection: "row",
    gap: 10,
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 36,
  },
  copy: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    lineHeight: 21,
  },
  eyebrow: {
    ...mobileWeb.typography.captionUpper,
    color: mobileWeb.colors.blue600,
  },
  error: {
    color: mobileWeb.colors.red600,
    fontSize: 12,
    lineHeight: 18,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  formGrid: {
    gap: 12,
  },
  header: {
    gap: 4,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.surfaceStrong,
    borderColor: mobileWeb.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconButtonText: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    backgroundColor: mobileWeb.colors.surfaceStrong,
    borderColor: mobileWeb.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: mobileWeb.colors.gray900,
    fontSize: 14,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: {
    color: mobileWeb.colors.gray600,
    fontSize: 12,
    fontWeight: "700",
  },
  logLine: {
    color: mobileWeb.colors.gray700,
    fontSize: 11,
    lineHeight: 17,
  },
  logPanel: {
    backgroundColor: mobileWeb.colors.surface,
    borderColor: mobileWeb.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  panel: {
    backgroundColor: mobileWeb.colors.surface,
    borderColor: mobileWeb.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  panelTitle: {
    color: mobileWeb.colors.gray900,
    fontSize: 14,
    fontWeight: "800",
  },
  safeArea: {
    backgroundColor: mobileWeb.colors.bg,
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: mobileWeb.colors.blue600,
  },
  secondaryButtonText: {
    color: mobileWeb.colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  summary: {
    backgroundColor: mobileWeb.colors.surfaceStrong,
    borderColor: mobileWeb.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  summaryGrid: {
    gap: 4,
  },
  summaryLine: {
    color: mobileWeb.colors.gray700,
    fontSize: 13,
    lineHeight: 20,
  },
  summaryTitle: {
    color: mobileWeb.colors.gray900,
    fontSize: 15,
    fontWeight: "800",
  },
  title: {
    color: mobileWeb.colors.gray900,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30,
  },
});
