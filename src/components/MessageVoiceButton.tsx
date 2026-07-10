import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioSource,
} from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { fromByteArray } from "base64-js";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import TrackPlayer, {
  AndroidAudioContentType,
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  IOSCategory,
  IOSCategoryMode,
  IOSCategoryOptions,
  State,
  type PlaybackState,
} from "react-native-track-player";
import { resolveVoiceUrl, VOICE_PLAYBACK_ENGINE } from "../config/env";
import { mobileWeb } from "../theme/mobileWeb";
import { useAuth } from "../contexts/AuthContext";
import { getIdTokenWithAnonymousRecovery } from "../lib/firebase";
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

function uniqueVoiceId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function setAudioMode() {
  await setAudioModeAsync({
    allowsRecording: false,
    interruptionMode: "duckOthers",
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
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

function buildConversationVoiceUri(baseUrl: string, conversationId: string, messageIndex: number): string {
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}conversation_id=${encodeURIComponent(conversationId)}&message_index=${messageIndex}`;
}

let trackPlayerSetupPromise: Promise<void> | null = null;

function isTrackPlayerAlreadyInitialized(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";

  return (
    code.toLowerCase().includes("already") ||
    message.toLowerCase().includes("already") ||
    message.toLowerCase().includes("initialized")
  );
}

async function ensureTrackPlayerSetup() {
  if (!trackPlayerSetupPromise) {
    trackPlayerSetupPromise = (async () => {
      try {
        await TrackPlayer.setupPlayer({
          androidAudioContentType: AndroidAudioContentType.Speech,
          autoHandleInterruptions: true,
          autoUpdateMetadata: false,
          iosCategory: IOSCategory.Playback,
          iosCategoryMode: IOSCategoryMode.SpokenAudio,
          iosCategoryOptions: [IOSCategoryOptions.DuckOthers],
        });
      } catch (error) {
        if (!isTrackPlayerAlreadyInitialized(error)) {
          throw error;
        }
      }

      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
        },
        capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
        compactCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
        progressUpdateEventInterval: 1,
      });
    })().catch((error) => {
      trackPlayerSetupPromise = null;
      throw error;
    });
  }

  await trackPlayerSetupPromise;
}

function isTrackPlayerTerminalState(playbackState: PlaybackState): boolean {
  return playbackState.state === State.Ended || playbackState.state === State.Error;
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
  const playerRef = useRef<AudioPlayer | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileUriRef = useRef<string | null>(null);
  const instanceIdRef = useRef(uniqueVoiceId());
  const trackPlayerActiveRef = useRef(false);
  const trackPlayerStatusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackPlayerSubscriptionsRef = useRef<Array<{ remove: () => void }>>([]);

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

  const clearTrackPlayerWatchers = useCallback(() => {
    if (trackPlayerStatusIntervalRef.current) {
      clearInterval(trackPlayerStatusIntervalRef.current);
      trackPlayerStatusIntervalRef.current = null;
    }

    trackPlayerSubscriptionsRef.current.forEach((subscription) => {
      subscription.remove();
    });
    trackPlayerSubscriptionsRef.current = [];
  }, []);

  const cleanupTrackPlayer = useCallback(async () => {
    clearTrackPlayerWatchers();

    if (!trackPlayerActiveRef.current) {
      return;
    }

    trackPlayerActiveRef.current = false;

    try {
      await TrackPlayer.stop();
      await TrackPlayer.reset();
    } catch {
      // Intentionally ignored.
    }
  }, [clearTrackPlayerWatchers]);

  const cleanup = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    await cleanupTrackPlayer();

    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }

    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {
        // Intentionally ignored.
      }

      try {
        playerRef.current.remove();
      } catch {
        // Intentionally ignored.
      }

      playerRef.current = null;
    }

    if (fileUriRef.current) {
      const localUri = fileUriRef.current;
      fileUriRef.current = null;
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch {
        // Intentionally ignored.
      }
    }
  }, [cleanupTrackPlayer]);

  const pausePlayback = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (trackPlayerActiveRef.current) {
      try {
        await TrackPlayer.pause();
      } catch {
        await cleanupTrackPlayer();
      }
    }

    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {
        // Intentionally ignored.
      }
    }

    setStatus("idle");
  }, [cleanupTrackPlayer]);

  const loadAndPlayFromSource = useCallback(
    async (source: AudioSource) => {
      await setAudioMode();

      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }

      const player = createAudioPlayer(source, {
        updateInterval: 1000,
      });

      statusIntervalRef.current = setInterval(() => {
        const playbackStatus = player.currentStatus;
        if (playbackStatus.didJustFinish) {
          setStatus("idle");
          void cleanup();
        }
      }, 1000);

      player.play();
      playerRef.current = player;
      setStatus("playing");
    },
    [cleanup]
  );

  const resolveAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!user) {
      return {};
    }

    const tokenResult = await getIdTokenWithAnonymousRecovery(user);
    return tokenResult.idToken ? { Authorization: `Bearer ${tokenResult.idToken}` } : {};
  }, [user]);

  const startTrackPlayerConversationPlayback = useCallback(
    async (authHeaders: Record<string, string>, remoteUri: string) => {
      let settled = false;

      const finish = async (error?: string) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTrackPlayerWatchers();
        trackPlayerActiveRef.current = false;

        try {
          await TrackPlayer.stop();
          await TrackPlayer.reset();
        } catch {
          // Intentionally ignored.
        }

        if (error) {
          console.warn("TrackPlayer voice playback failed", error);
          setStatus("error");
          setError("Voice playback failed.");
          return;
        }

        setStatus("idle");
        setError("");
      };

      const pollStatus = async () => {
        try {
          const playbackState = await TrackPlayer.getPlaybackState();

          if (isTrackPlayerTerminalState(playbackState)) {
            await finish(
              playbackState.state === State.Error
                ? playbackState.error?.message || "TrackPlayer entered error state."
                : undefined
            );
          }
        } catch (error) {
          await finish(
            error instanceof Error ? error.message : "Unable to read TrackPlayer status."
          );
        }
      };

      await ensureTrackPlayerSetup();
      await TrackPlayer.reset();

      trackPlayerSubscriptionsRef.current = [
        TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
          void finish(event.message);
        }),
        TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
          void finish();
        }),
      ];

      await TrackPlayer.add({
        artist: "Quiet Room",
        headers: authHeaders,
        id: uniqueVoiceId(),
        title: "Quiet Room voice",
        url: remoteUri,
      });
      await TrackPlayer.play();

      trackPlayerActiveRef.current = true;
      trackPlayerStatusIntervalRef.current = setInterval(() => {
        void pollStatus();
      }, 1000);

      setStatus("playing");
      setError("");
      void pollStatus();
    },
    [clearTrackPlayerWatchers]
  );

  const startConversationPlayback = useCallback(
    async (authHeaders: Record<string, string>) => {
      if (!hasConversationAudio) {
        return false;
      }

      const remoteUri = buildConversationVoiceUri(
        voiceUrl,
        conversationId!.trim(),
        messageIndex as number
      );

      if (VOICE_PLAYBACK_ENGINE === "track-player") {
        await startTrackPlayerConversationPlayback(authHeaders, remoteUri);
        return true;
      }

      await loadAndPlayFromSource({
        headers: authHeaders,
        uri: remoteUri,
      });

      return true;
    },
    [
      conversationId,
      hasConversationAudio,
      loadAndPlayFromSource,
      messageIndex,
      startTrackPlayerConversationPlayback,
      voiceUrl,
    ]
  );

  const startPlayback = useCallback(async () => {
    if (!hasPlayableContent) {
      return;
    }

    publishVoicePlayback(instanceIdRef.current);

    if (trackPlayerActiveRef.current) {
      try {
        await TrackPlayer.play();
        setStatus("playing");
        setError("");
        return;
      } catch {
        await cleanup();
      }
    }

    if (playerRef.current) {
      try {
        playerRef.current.play();
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
        await loadAndPlayFromSource({ uri: resolvedAudioSrc });
        abortControllerRef.current = null;
        return;
      }

      const authHeaders = await resolveAuthHeaders();

      if (hasConversationAudio) {
        try {
          const startedConversationPlayback = await startConversationPlayback(authHeaders);
          if (startedConversationPlayback) {
            abortControllerRef.current = null;
            return;
          }
        } catch (conversationError) {
          if ((conversationError as Error | null)?.name === "AbortError") {
            return;
          }

          await cleanup();
          abortControllerRef.current = controller;
          setStatus("loading");
          console.warn("Conversation voice playback failed; falling back to text POST", conversationError);
        }
      }

      const response = await fetch(voiceUrl, {
        body: JSON.stringify({ text: trimmedText }),
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Voice stream failed: ${response.status} ${detail}`);
      }

      const audioBytes = new Uint8Array(await response.arrayBuffer());
      const localUri = await writeAudioToCache(audioBytes);
      fileUriRef.current = localUri;

      if (controller.signal.aborted) {
        return;
      }

      await loadAndPlayFromSource({ uri: localUri });
      abortControllerRef.current = null;
    } catch (rawError) {
      if ((rawError as Error | null)?.name === "AbortError") {
        return;
      }

      const message =
        rawError instanceof Error ? rawError.message : "Unable to start voice playback.";

      console.warn("Voice playback failed", rawError);
      setStatus("error");
      setError(message);
    }
  }, [
    cleanup,
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
      await pausePlayback();
      return;
    }

    await startPlayback();
  }, [hasPlayableContent, pausePlayback, startPlayback, status]);

  useEffect(() => {
    const unsubscribe = subscribeVoicePlayback((activeId) => {
      if (activeId !== instanceIdRef.current) {
        void pausePlayback();
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








