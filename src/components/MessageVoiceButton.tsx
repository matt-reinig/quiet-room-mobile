import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Audio, type AVPlaybackStatus } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { fromByteArray } from "base64-js";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { resolveVoiceUrl } from "../config/env";
import { mobileWeb } from "../theme/mobileWeb";
import { useAuth } from "../contexts/AuthContext";
import {
  publishVoicePlayback,
  subscribeVoicePlayback,
} from "../lib/voicePlaybackBus";

type VoiceStatus = "error" | "idle" | "loading" | "playing";

type MessageVoiceButtonProps = {
  audioSrc?: string;
  autoPlay?: boolean;
  testID?: string;
  text: string;
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

export default function MessageVoiceButton({
  audioSrc,
  autoPlay = false,
  testID,
  text,
}: MessageVoiceButtonProps) {
  const { user } = useAuth();

  const [error, setError] = useState("");
  const [status, setStatus] = useState<VoiceStatus>("idle");

  const abortControllerRef = useRef<AbortController | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const fileUriRef = useRef<string | null>(null);
  const instanceIdRef = useRef(uniqueVoiceId());

  const trimmedText = useMemo(() => (text || "").trim(), [text]);
  const resolvedAudioSrc = useMemo(() => (audioSrc || "").trim(), [audioSrc]);

  const hasPresetAudio = Boolean(resolvedAudioSrc);
  const hasPlayableContent = hasPresetAudio || Boolean(trimmedText);
  const voiceUrl = useMemo(resolveVoiceUrl, []);

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

    if (fileUriRef.current) {
      const localUri = fileUriRef.current;
      fileUriRef.current = null;
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch {
        // Intentionally ignored.
      }
    }
  }, []);

  const pausePlayback = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (soundRef.current) {
      try {
        await soundRef.current.pauseAsync();
      } catch {
        // Intentionally ignored.
      }
    }

    setStatus("idle");
  }, []);

  const loadAndPlayFromUri = useCallback(
    async (uri: string) => {
      await setAudioMode();

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );

      sound.setOnPlaybackStatusUpdate((playbackStatus: AVPlaybackStatus) => {
        if (!playbackStatus.isLoaded) {
          if (playbackStatus.error) {
            setStatus("error");
            setError("Voice playback failed.");
          }
          return;
        }

        if (playbackStatus.didJustFinish) {
          setStatus("idle");
        }
      });

      soundRef.current = sound;
      setStatus("playing");
    },
    []
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
        await loadAndPlayFromUri(resolvedAudioSrc);
        abortControllerRef.current = null;
        return;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (user) {
        const token = await user.getIdToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      }

      const response = await fetch(voiceUrl, {
        body: JSON.stringify({ text: trimmedText }),
        headers,
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

      await loadAndPlayFromUri(localUri);
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
    hasPresetAudio,
    loadAndPlayFromUri,
    resolvedAudioSrc,
    trimmedText,
    user,
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

  const isStarting = status === "loading";

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel={status === "playing" ? "Pause voice" : "Play voice"}
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
        <Ionicons
          color={status === "playing" ? mobileWeb.colors.blue600 : mobileWeb.colors.gray700}
          name={status === "loading" ? "sync-outline" : status === "playing" ? "pause" : "volume-high-outline"}
          size={16}
        />
      </Pressable>

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
});












