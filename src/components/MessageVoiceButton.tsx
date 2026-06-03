import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Audio, type AVPlaybackSource, type AVPlaybackStatus } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { fromByteArray } from "base64-js";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { resolveVoiceUrl } from "../config/env";
import { mobileWeb } from "../theme/mobileWeb";
import { useAuth } from "../contexts/AuthContext";
import { sendClientEvent } from "../lib/clientEvents";
import {
  publishVoicePlayback,
  subscribeVoicePlayback,
} from "../lib/voicePlaybackBus";

type VoiceStatus = "error" | "idle" | "loading" | "playing";

type MessageVoiceButtonProps = {
  audioSrc?: string;
  autoPlay?: boolean;
  conversationId?: string | null;
  messageIndex?: number;
  testID?: string;
  text: string;
};

type VoicePlaybackSource =
  | "conversation_get_cached"
  | "preset_audio"
  | "text_post_cached";

type VoicePlaybackDiagnostics = {
  audioByteLength?: number;
  conversationId?: string | null;
  fetchDurationMs?: number;
  messageIndex?: number;
  playbackSource: VoicePlaybackSource;
  ttsRequestId?: string | null;
  ttsTextBytes?: number | null;
  ttsTextLength?: number | null;
  ttsTextSha256?: string | null;
};

function uniqueVoiceId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function setAudioMode() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    interruptionModeAndroid: 1,
    interruptionModeIOS: 1,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    staysActiveInBackground: false,
  });
}

async function writeAudioToCache(bytes: Uint8Array): Promise<string> {
  const cacheRoot = FileSystem.cacheDirectory || FileSystem.documentDirectory;

  if (!cacheRoot) {
    throw new Error("No writable cache directory for audio playback.");
  }

  const directoryUri = `${cacheRoot}quiet-room-voice/`;
  await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });

  const fileUri = `${directoryUri}${uniqueVoiceId()}.mp3`;
  const base64 = fromByteArray(bytes);

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return fileUri;
}

function coerceHeaderNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildConversationVoiceUri(
  baseUrl: string,
  conversationId: string,
  messageIndex: number,
  clientRequestId: string
): string {
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}conversation_id=${encodeURIComponent(
    conversationId
  )}&message_index=${messageIndex}&client_request_id=${encodeURIComponent(
    clientRequestId
  )}`;
}

export default function MessageVoiceButton({
  audioSrc,
  autoPlay = false,
  conversationId,
  messageIndex,
  testID,
  text,
}: MessageVoiceButtonProps) {
  const { user } = useAuth();

  const [error, setError] = useState("");
  const [status, setStatus] = useState<VoiceStatus>("idle");

  const abortControllerRef = useRef<AbortController | null>(null);
  const diagnosticsRef = useRef<VoicePlaybackDiagnostics | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const fileUriRef = useRef<string | null>(null);
  const instanceIdRef = useRef(uniqueVoiceId());

  const trimmedText = useMemo(() => (text || "").trim(), [text]);
  const resolvedAudioSrc = useMemo(() => (audioSrc || "").trim(), [audioSrc]);

  const hasPresetAudio = Boolean(resolvedAudioSrc);
  const hasPlayableContent = hasPresetAudio || Boolean(trimmedText);
  const hasConversationAudio =
    typeof conversationId === "string" &&
    conversationId.trim().length > 0 &&
    Number.isInteger(messageIndex) &&
    (messageIndex as number) >= 0;
  const voiceUrl = useMemo(resolveVoiceUrl, []);
  const loadingSpin = useRef(new Animated.Value(0)).current;

  const emitVoiceEvent = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      void sendClientEvent({
        event: `voice_playback.${event}`,
        payload: {
          conversationId: conversationId ?? null,
          messageIndex: Number.isInteger(messageIndex) ? messageIndex : null,
          playbackInstanceId: instanceIdRef.current,
          ...diagnosticsRef.current,
          ...payload,
        },
        user,
      }).catch(() => {
        // Diagnostic logging should never disrupt playback.
      });
    },
    [conversationId, messageIndex, user]
  );

  const fetchAudioToCache = useCallback(
    async ({
      body,
      headers,
      method,
      playbackSource,
      signal,
      uri,
    }: {
      body?: string;
      headers: Record<string, string>;
      method: "GET" | "POST";
      playbackSource: VoicePlaybackSource;
      signal: AbortSignal;
      uri: string;
    }) => {
      const startedAt = Date.now();
      const response = await fetch(uri, {
        body,
        headers,
        method,
        signal,
      });

      const fetchDurationMs = Date.now() - startedAt;
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Voice stream failed: ${response.status} ${detail}`);
      }

      const audioBytes = new Uint8Array(await response.arrayBuffer());
      const localUri = await writeAudioToCache(audioBytes);
      fileUriRef.current = localUri;

      const diagnostics: VoicePlaybackDiagnostics = {
        audioByteLength: audioBytes.byteLength,
        conversationId: conversationId ?? null,
        fetchDurationMs,
        messageIndex: Number.isInteger(messageIndex) ? messageIndex : undefined,
        playbackSource,
        ttsRequestId: response.headers.get("X-Gabriel-TTS-Request-Id"),
        ttsTextBytes: coerceHeaderNumber(
          response.headers.get("X-Gabriel-TTS-Text-Bytes")
        ),
        ttsTextLength: coerceHeaderNumber(
          response.headers.get("X-Gabriel-TTS-Text-Length")
        ),
        ttsTextSha256: response.headers.get("X-Gabriel-TTS-Text-SHA256"),
      };

      diagnosticsRef.current = diagnostics;
      emitVoiceEvent("audio_fetched", diagnostics);

      return { diagnostics, localUri };
    },
    [conversationId, emitVoiceEvent, messageIndex]
  );

  const clearCachedAudio = useCallback(async () => {
    if (fileUriRef.current) {
      const localUri = fileUriRef.current;
      fileUriRef.current = null;
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch {
        // Intentionally ignored.
      }
    }
    diagnosticsRef.current = null;
  }, []);

  const cleanup = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
      } catch {
        // Intentionally ignored.
      }

      try {
        await soundRef.current.unloadAsync();
      } catch {
        // Intentionally ignored.
      }

      soundRef.current.setOnPlaybackStatusUpdate(null);
      soundRef.current = null;
    }

    await clearCachedAudio();
  }, [clearCachedAudio]);

  const pausePlayback = useCallback(async (reason = "manual") => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (soundRef.current) {
      try {
        await soundRef.current.pauseAsync();
        emitVoiceEvent("paused", { reason });
      } catch {
        // Intentionally ignored.
      }
    }

    setStatus("idle");
  }, [emitVoiceEvent]);

  const loadAndPlayFromSource = useCallback(
    async (source: AVPlaybackSource, diagnostics: VoicePlaybackDiagnostics) => {
      await setAudioMode();
      diagnosticsRef.current = diagnostics;

      const { sound } = await Audio.Sound.createAsync(
        source,
        { shouldPlay: true },
        undefined,
        false
      );

      sound.setOnPlaybackStatusUpdate((playbackStatus: AVPlaybackStatus) => {
        if (!playbackStatus.isLoaded) {
          if (playbackStatus.error) {
            setStatus("error");
            setError("Voice playback failed.");
            emitVoiceEvent("error", {
              error: playbackStatus.error,
              stage: "playback_status",
            });
          }
          return;
        }

        if (playbackStatus.didJustFinish) {
          setStatus("idle");
          emitVoiceEvent("finished", {
            didJustFinish: true,
            durationMillis: playbackStatus.durationMillis ?? null,
            positionMillis: playbackStatus.positionMillis,
          });
        }
      });

      soundRef.current = sound;
      setStatus("playing");
      emitVoiceEvent("started", diagnostics);
    },
    [emitVoiceEvent]
  );

  const resolveAuthHeaders = useCallback(
    async (): Promise<Record<string, string>> => {
      if (!user) {
        return {};
      }

      const token = await user.getIdToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
    [user]
  );

  const startConversationPlayback = useCallback(
    async (authHeaders: Record<string, string>, controller: AbortController) => {
      if (!hasConversationAudio) {
        return false;
      }

      const remoteUri = buildConversationVoiceUri(
        voiceUrl,
        conversationId!.trim(),
        messageIndex as number,
        instanceIdRef.current
      );

      const { diagnostics, localUri } = await fetchAudioToCache({
        headers: authHeaders,
        method: "GET",
        playbackSource: "conversation_get_cached",
        signal: controller.signal,
        uri: remoteUri,
      });

      if (controller.signal.aborted) {
        return true;
      }

      await loadAndPlayFromSource({ uri: localUri }, diagnostics);

      return true;
    },
    [
      conversationId,
      fetchAudioToCache,
      hasConversationAudio,
      loadAndPlayFromSource,
      messageIndex,
      voiceUrl,
    ]
  );

  const startPlayback = useCallback(async () => {
    if (!hasPlayableContent) {
      return;
    }

    publishVoicePlayback(instanceIdRef.current);

    if (soundRef.current) {
      try {
        await soundRef.current.playAsync();
        setStatus("playing");
        setError("");
        return;
      } catch {
        await cleanup();
      }
    }

    await cleanup();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus("loading");
    setError("");

    try {
      if (hasPresetAudio) {
        await loadAndPlayFromSource(
          { uri: resolvedAudioSrc },
          {
            conversationId: conversationId ?? null,
            messageIndex: Number.isInteger(messageIndex) ? messageIndex : undefined,
            playbackSource: "preset_audio",
          }
        );
        abortControllerRef.current = null;
        return;
      }

      const authHeaders = await resolveAuthHeaders();

      if (hasConversationAudio) {
        try {
          const startedConversationPlayback = await startConversationPlayback(
            authHeaders,
            controller
          );
          if (startedConversationPlayback) {
            abortControllerRef.current = null;
            return;
          }
        } catch (conversationError) {
          if ((conversationError as Error | null)?.name === "AbortError") {
            return;
          }

          await clearCachedAudio();
          abortControllerRef.current = controller;
          setStatus("loading");
          console.warn(
            "Conversation voice playback failed; falling back to text POST",
            conversationError
          );
        }
      }

      const { diagnostics, localUri } = await fetchAudioToCache({
        body: JSON.stringify({ text: trimmedText }),
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        method: "POST",
        playbackSource: "text_post_cached",
        signal: controller.signal,
        uri: voiceUrl,
      });

      if (controller.signal.aborted) {
        return;
      }

      await loadAndPlayFromSource({ uri: localUri }, diagnostics);
      abortControllerRef.current = null;
    } catch (rawError) {
      if ((rawError as Error | null)?.name === "AbortError") {
        emitVoiceEvent("cancelled", { reason: "abort" });
        return;
      }

      const message =
        rawError instanceof Error ? rawError.message : "Unable to start voice playback.";

      console.warn("Voice playback failed", rawError);
      setStatus("error");
      setError(message);
      emitVoiceEvent("error", {
        error: message,
        stage: "start_playback",
      });
    }
  }, [
    cleanup,
    conversationId,
    clearCachedAudio,
    emitVoiceEvent,
    fetchAudioToCache,
    hasPlayableContent,
    hasConversationAudio,
    hasPresetAudio,
    loadAndPlayFromSource,
    messageIndex,
    resolveAuthHeaders,
    resolvedAudioSrc,
    startConversationPlayback,
    trimmedText,
    voiceUrl,
  ]);

  const togglePlayback = useCallback(async () => {
    if (!hasPlayableContent) {
      return;
    }

    if (status === "playing" || status === "loading") {
      await pausePlayback("toggle");
      return;
    }

    await startPlayback();
  }, [hasPlayableContent, pausePlayback, startPlayback, status]);

  useEffect(() => {
    const unsubscribe = subscribeVoicePlayback((activeId) => {
      if (activeId !== instanceIdRef.current) {
        void pausePlayback("other_voice_started");
      }
    });

    return unsubscribe;
  }, [pausePlayback]);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  useEffect(() => {
    if (!autoPlay) {
      return;
    }

    void startPlayback();
  }, [autoPlay, startPlayback]);

  useEffect(() => {
    if (status !== "loading") {
      loadingSpin.stopAnimation();
      loadingSpin.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(loadingSpin, {
        duration: 850,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      })
    );

    loop.start();

    return () => {
      loop.stop();
      loadingSpin.setValue(0);
    };
  }, [loadingSpin, status]);

  const isStarting = status === "loading";
  const loadingRotation = loadingSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const accessibilityLabel =
    status === "playing"
      ? "Pause voice"
      : status === "loading"
        ? "Starting voice..."
        : status === "error"
          ? "Retry voice"
          : "Play voice";

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ busy: isStarting }}
        testID={testID}
        disabled={!hasPlayableContent || isStarting}
        onPress={() => {
          void togglePlayback();
        }}
        style={({ pressed }) => [
          styles.button,
          status === "playing" && styles.buttonActive,
          (!hasPlayableContent || isStarting) && styles.buttonDisabled,
          pressed && hasPlayableContent && !isStarting && styles.buttonPressed,
        ]}
      >
        {status === "loading" ? (
          <Animated.View style={{ transform: [{ rotate: loadingRotation }] }}>
            <Ionicons
              color={mobileWeb.colors.blue600}
              name="volume-high-outline"
              size={16}
            />
          </Animated.View>
        ) : (
          <Ionicons
            color={status === "playing" ? mobileWeb.colors.blue600 : mobileWeb.colors.gray700}
            name={status === "playing" ? "pause" : "volume-high-outline"}
            size={16}
          />
        )}
      </Pressable>

      {isStarting ? <Text style={styles.loading}>Starting voice...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.surfaceStrong,
    borderColor: mobileWeb.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,

  },
  buttonActive: {
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue200,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  container: {
    alignItems: "flex-start",
    gap: 4,
  },
  error: {
    color: mobileWeb.colors.red600,
    fontSize: 11,
    maxWidth: 180,
  },
  loading: {
    color: mobileWeb.colors.blue600,
    fontSize: 11,
    fontWeight: "600",
    maxWidth: 180,
  },
});








