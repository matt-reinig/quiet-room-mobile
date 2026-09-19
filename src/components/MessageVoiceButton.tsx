import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { resolveVoiceUrl } from "../config/env";
import { mobileWeb } from "../theme/mobileWeb";
import { useAuth } from "../contexts/AuthContext";
import { getIdTokenWithAnonymousRecovery } from "../lib/firebase";
import { waitForAmbientAudioSessionConfiguration } from "../lib/audioSession";
import {
  isVoicePlaybackOwner,
  publishVoicePlayback,
  publishVoicePlaybackStarted,
  publishVoicePlaybackStopped,
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
let trackPlayerCommandChain: Promise<unknown> = Promise.resolve();

function runTrackPlayerCommand<T>(command: () => Promise<T>): Promise<T> {
  const result = trackPlayerCommandChain.then(command, command);
  trackPlayerCommandChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

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
  const fileUriRef = useRef<string | null>(null);
  const instanceIdRef = useRef(uniqueVoiceId());
  const playbackOperationRef = useRef(0);
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

  const deleteCachedVoiceFile = useCallback(async (expectedUri?: string) => {
    const localUri = expectedUri || fileUriRef.current;
    if (!localUri) {
      return;
    }

    if (fileUriRef.current === localUri) {
      fileUriRef.current = null;
    }

    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch {
      // Intentionally ignored.
    }
  }, []);

  const cleanupTrackPlayer = useCallback(async () => {
    clearTrackPlayerWatchers();

    if (!trackPlayerActiveRef.current) {
      return;
    }

    trackPlayerActiveRef.current = false;

    if (!isVoicePlaybackOwner(instanceIdRef.current)) {
      return;
    }

    try {
      await runTrackPlayerCommand(async () => {
        await TrackPlayer.stop();
        await TrackPlayer.reset();
      });
    } catch {
      // Intentionally ignored.
    }
  }, [clearTrackPlayerWatchers]);

  const cleanup = useCallback(async (invalidateOperation = true) => {
    if (invalidateOperation) {
      playbackOperationRef.current += 1;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    await cleanupTrackPlayer();
    await deleteCachedVoiceFile();

    publishVoicePlaybackStopped(instanceIdRef.current);
  }, [cleanupTrackPlayer, deleteCachedVoiceFile]);

  const pausePlayback = useCallback(async () => {
    playbackOperationRef.current += 1;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (trackPlayerActiveRef.current) {
      if (isVoicePlaybackOwner(instanceIdRef.current)) {
        try {
          await runTrackPlayerCommand(() => TrackPlayer.pause());
        } catch {
          await cleanupTrackPlayer();
        }
      } else {
        trackPlayerActiveRef.current = false;
        clearTrackPlayerWatchers();
        await deleteCachedVoiceFile();
      }
    }

    setStatus("idle");
    publishVoicePlaybackStopped(instanceIdRef.current);
  }, [cleanupTrackPlayer, clearTrackPlayerWatchers, deleteCachedVoiceFile]);

  const resolveAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!user) {
      return {};
    }

    const tokenResult = await getIdTokenWithAnonymousRecovery(user);
    return tokenResult.idToken ? { Authorization: `Bearer ${tokenResult.idToken}` } : {};
  }, [user]);

  const startTrackPlayerVoicePlayback = useCallback(
    async (
      authHeaders: Record<string, string>,
      sourceUri: string,
      operation: number,
      cachedFileUri?: string,
    ) => {
      let settled = false;
      let localSubscriptions: Array<{ remove: () => void }> = [];

      const removeLocalSubscriptions = () => {
        localSubscriptions.forEach((subscription) => subscription.remove());
        if (trackPlayerSubscriptionsRef.current === localSubscriptions) {
          trackPlayerSubscriptionsRef.current = [];
        }
        localSubscriptions = [];
      };

      const stillOwnsPlayback = () =>
        operation === playbackOperationRef.current &&
        isVoicePlaybackOwner(instanceIdRef.current);

      const finish = async (error?: string) => {
        if (settled) {
          return;
        }

        settled = true;

        // A native event can arrive after a rapid replay or another message has
        // claimed the process-wide player. That stale event may clean up only
        // its own cache file; it must not stop or update the newer playback.
        if (!stillOwnsPlayback()) {
          removeLocalSubscriptions();
          if (cachedFileUri) {
            await deleteCachedVoiceFile(cachedFileUri);
          }
          return;
        }

        clearTrackPlayerWatchers();
        trackPlayerActiveRef.current = false;

        if (isVoicePlaybackOwner(instanceIdRef.current)) {
          try {
            await runTrackPlayerCommand(async () => {
              if (!stillOwnsPlayback()) {
                return;
              }
              await TrackPlayer.stop();
              await TrackPlayer.reset();
            });
          } catch {
            // Intentionally ignored.
          }
        }

        if (!stillOwnsPlayback()) {
          if (cachedFileUri) {
            await deleteCachedVoiceFile(cachedFileUri);
          }
          return;
        }

        if (cachedFileUri) {
          await deleteCachedVoiceFile(cachedFileUri);
        }

        if (error) {
          console.warn("TrackPlayer voice playback failed", error);
          setStatus("error");
          setError("Voice playback failed.");
          publishVoicePlaybackStopped(instanceIdRef.current);
          return;
        }

        setStatus("idle");
        setError("");
        publishVoicePlaybackStopped(instanceIdRef.current);
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

      const started = await runTrackPlayerCommand(async () => {
        await waitForAmbientAudioSessionConfiguration();
        await ensureTrackPlayerSetup();
        if (!stillOwnsPlayback()) {
          return false;
        }
        await TrackPlayer.reset();
        if (!stillOwnsPlayback()) {
          return false;
        }

        localSubscriptions = [
          TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
            void finish(event.message);
          }),
          TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
            void finish();
          }),
        ];
        trackPlayerSubscriptionsRef.current = localSubscriptions;

        await TrackPlayer.add({
          artist: "Quiet Room",
          headers: authHeaders,
          id: uniqueVoiceId(),
          title: "Quiet Room voice",
          url: sourceUri,
        });
        if (!stillOwnsPlayback()) {
          removeLocalSubscriptions();
          await TrackPlayer.reset();
          return false;
        }
        trackPlayerActiveRef.current = true;
        await TrackPlayer.play();
        if (!stillOwnsPlayback()) {
          trackPlayerActiveRef.current = false;
          removeLocalSubscriptions();
          await TrackPlayer.reset();
          return false;
        }
        return true;
      });

      if (!started || settled || !trackPlayerActiveRef.current) {
        removeLocalSubscriptions();
        if (cachedFileUri) {
          await deleteCachedVoiceFile(cachedFileUri);
        }
        return false;
      }

      if (!stillOwnsPlayback()) {
        removeLocalSubscriptions();
        if (cachedFileUri) {
          await deleteCachedVoiceFile(cachedFileUri);
        }
        return false;
      }

      publishVoicePlaybackStarted(instanceIdRef.current);
      trackPlayerStatusIntervalRef.current = setInterval(() => {
        void pollStatus();
      }, 1000);

      setStatus("playing");
      setError("");
      void pollStatus();
      return true;
    },
    [clearTrackPlayerWatchers, deleteCachedVoiceFile]
  );

  const startConversationPlayback = useCallback(
    async (authHeaders: Record<string, string>, operation: number) => {
      if (!hasConversationAudio) {
        return false;
      }

      const remoteUri = buildConversationVoiceUri(
        voiceUrl,
        conversationId!.trim(),
        messageIndex as number
      );

      return startTrackPlayerVoicePlayback(authHeaders, remoteUri, operation);
    },
    [
      conversationId,
      hasConversationAudio,
      messageIndex,
      startTrackPlayerVoicePlayback,
      voiceUrl,
    ]
  );

  const startPlayback = useCallback(async () => {
    if (!hasPlayableContent) {
      return;
    }

    if (trackPlayerActiveRef.current && isVoicePlaybackOwner(instanceIdRef.current)) {
      const operation = ++playbackOperationRef.current;
      try {
        publishVoicePlayback(instanceIdRef.current);
        await runTrackPlayerCommand(() => TrackPlayer.play());
        if (operation !== playbackOperationRef.current || !isVoicePlaybackOwner(instanceIdRef.current)) {
          return;
        }
        publishVoicePlaybackStarted(instanceIdRef.current);
        setStatus("playing");
        setError("");
        return;
      } catch {
        await cleanup();
      }
    }

    await cleanup();
    const operation = ++playbackOperationRef.current;
    publishVoicePlayback(instanceIdRef.current);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus("loading");
    setError("");

    try {
      // Claiming another message must silence the old process-wide queue before
      // authentication or fallback generation can take time.
      await runTrackPlayerCommand(async () => {
        await waitForAmbientAudioSessionConfiguration();
        await ensureTrackPlayerSetup();
        if (operation !== playbackOperationRef.current || !isVoicePlaybackOwner(instanceIdRef.current)) {
          return;
        }
        await TrackPlayer.reset();
      });
      if (operation !== playbackOperationRef.current || !isVoicePlaybackOwner(instanceIdRef.current)) {
        return;
      }

      if (hasPresetAudio) {
        await startTrackPlayerVoicePlayback({}, resolvedAudioSrc, operation);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        return;
      }

      const authHeaders = await resolveAuthHeaders();
      if (operation !== playbackOperationRef.current || controller.signal.aborted) {
        return;
      }

      if (hasConversationAudio) {
        try {
          const startedConversationPlayback = await startConversationPlayback(authHeaders, operation);
          if (startedConversationPlayback) {
            if (abortControllerRef.current === controller) {
              abortControllerRef.current = null;
            }
            return;
          }
        } catch (conversationError) {
          if ((conversationError as Error | null)?.name === "AbortError") {
            return;
          }

          if (operation !== playbackOperationRef.current || !isVoicePlaybackOwner(instanceIdRef.current)) {
            return;
          }

          await cleanup(false);
          if (operation !== playbackOperationRef.current) {
            return;
          }
          const fallbackController = new AbortController();
          abortControllerRef.current = fallbackController;
          publishVoicePlayback(instanceIdRef.current);
          setStatus("loading");
          console.warn("Conversation voice playback failed; falling back to text POST", conversationError);

          const response = await fetch(voiceUrl, {
            body: JSON.stringify({ text: trimmedText }),
            headers: {
              ...authHeaders,
              "Content-Type": "application/json",
            },
            method: "POST",
            signal: fallbackController.signal,
          });

          if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(`Voice stream failed: ${response.status} ${detail}`);
          }

          const audioBytes = new Uint8Array(await response.arrayBuffer());
          const localUri = await writeAudioToCache(audioBytes);
          fileUriRef.current = localUri;

          if (operation !== playbackOperationRef.current || fallbackController.signal.aborted) {
            await deleteCachedVoiceFile(localUri);
            return;
          }

          await startTrackPlayerVoicePlayback({}, localUri, operation, localUri);
          if (abortControllerRef.current === fallbackController) {
            abortControllerRef.current = null;
          }
          return;
        }
      }

      if (operation !== playbackOperationRef.current || controller.signal.aborted) {
        return;
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

      if (operation !== playbackOperationRef.current || controller.signal.aborted) {
        await deleteCachedVoiceFile(localUri);
        return;
      }

      await startTrackPlayerVoicePlayback({}, localUri, operation, localUri);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    } catch (rawError) {
      if ((rawError as Error | null)?.name === "AbortError") {
        return;
      }

      if (operation !== playbackOperationRef.current || !isVoicePlaybackOwner(instanceIdRef.current)) {
        return;
      }

      const message =
        rawError instanceof Error ? rawError.message : "Unable to start voice playback.";

      await cleanup(false);
      console.warn("Voice playback failed", rawError);
      setStatus("error");
      setError(message);
      publishVoicePlaybackStopped(instanceIdRef.current);
    }
  }, [
    cleanup,
    deleteCachedVoiceFile,
    hasPlayableContent,
    hasConversationAudio,
    hasPresetAudio,
    messageIndex,
    resolveAuthHeaders,
    resolvedAudioSrc,
    startConversationPlayback,
    startTrackPlayerVoicePlayback,
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
      if (activeId && activeId !== instanceIdRef.current) {
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
