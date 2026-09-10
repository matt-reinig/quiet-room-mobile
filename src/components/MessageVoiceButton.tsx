import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAudioPlayer,
  type AudioPlayer,
  type AudioSource,
} from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { fromByteArray } from "base64-js";
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from "react-native";
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
import { configureQuietRoomAudioSession } from "../lib/audioSession";
import {
  isVoicePlaybackOwner,
  publishVoicePlayback,
  publishVoicePlaybackStarted,
  publishVoicePlaybackStopped,
  subscribeVoicePlayback,
} from "../lib/voicePlaybackBus";
import {
  createVoicePlaybackDiagnosticEmitter,
  parseVoicePlaybackDiagnosticDeepLink,
  resolveVoicePlaybackSourceIdentity,
  type VoicePlaybackDiagnosticDeepLink,
  type VoicePlaybackDiagnosticEmitter,
} from "../lib/voicePlaybackDiagnostics";

type VoiceStatus = "error" | "idle" | "loading" | "playing";

type ActiveVoiceDiagnostic = {
  attemptId: string;
  emitter: VoicePlaybackDiagnosticEmitter;
  mode: VoicePlaybackDiagnosticDeepLink["mode"];
  fixtureCase?: string;
};

const DEFAULT_ANDROID_FIXTURE_BASE_URL = "http://10.0.2.2:8787";

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

function removeVoicePlayer(player: AudioPlayer): void {
  try {
    player.pause();
  } catch {
    // The player may already have been released.
  }

  try {
    player.remove();
  } catch {
    // The player may already have been released.
  }
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

function buildDiagnosticFixtureVoiceUri(
  diagnostic: VoicePlaybackDiagnosticDeepLink,
  runId: string,
  attemptId: string,
  conversationId: string,
  messageIndex: number,
): string {
  const fixtureBaseUrl = (diagnostic.fixtureBaseUrl || DEFAULT_ANDROID_FIXTURE_BASE_URL)
    .replace(/\/+$/, "");
  const endpoint = fixtureBaseUrl.endsWith("/api/voice_stream")
    ? fixtureBaseUrl
    : `${fixtureBaseUrl}/api/voice_stream`;
  const params = new URLSearchParams({
    attempt_id: attemptId,
    conversation_id: conversationId,
    fixture_case: diagnostic.fixtureCase || "steady",
    message_index: String(messageIndex),
    run_id: runId,
  });
  return `${endpoint}?${params.toString()}`;
}

function buildDiagnosticProxyVoiceUri(
  proxyBaseUrl: string,
  conversationId: string,
  messageIndex: number,
): string {
  const normalizedBaseUrl = proxyBaseUrl.replace(/\/+$/, "");
  const endpoint = normalizedBaseUrl.endsWith("/api/voice_stream")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/api/voice_stream`;
  return buildConversationVoiceUri(endpoint, conversationId, messageIndex);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  const playbackOperationRef = useRef(0);
  const trackPlayerActiveRef = useRef(false);
  const trackPlayerStatusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackPlayerSubscriptionsRef = useRef<Array<{ remove: () => void }>>([]);
  const activeDiagnosticRef = useRef<ActiveVoiceDiagnostic | null>(null);

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

  const emitDiagnostic = useCallback((event: string, fields: Record<string, unknown> = {}) => {
    const diagnostic = activeDiagnosticRef.current;
    diagnostic?.emitter.emit(event, fields, diagnostic.attemptId);
  }, []);

  const finishDiagnostic = useCallback((fields: Record<string, unknown>) => {
    const diagnostic = activeDiagnosticRef.current;
    if (!diagnostic) {
      return;
    }

    diagnostic.emitter.finishAttempt(diagnostic.attemptId, fields);
    activeDiagnosticRef.current = null;
  }, []);

  const emitSourceIdentity = useCallback(
    async (
      diagnostic: ActiveVoiceDiagnostic | null,
      sourceText: string,
      sourceConversationId: string,
      sourceSlot: number,
    ) => {
      if (
        !diagnostic ||
        (diagnostic.mode !== "live-trace" && diagnostic.mode !== "live-proxy")
      ) {
        return;
      }

      try {
        const identity = await resolveVoicePlaybackSourceIdentity(
          sourceText,
          sourceConversationId,
          sourceSlot,
        );
        diagnostic.emitter.emit("source.identity", identity, diagnostic.attemptId);
      } catch (error) {
        diagnostic.emitter.emit(
          "source.identity.unavailable",
          { reason: error instanceof Error ? error.name : "unknown" },
          diagnostic.attemptId,
        );
        const identityError = new Error("Voice source identity is unavailable for this diagnostic attempt.");
        identityError.name = "VoiceSourceIdentityUnavailableError";
        throw identityError;
      }
    },
    [],
  );

  const cleanupTrackPlayer = useCallback(async (reason = "cleanup") => {
    clearTrackPlayerWatchers();
    emitDiagnostic("cleanup.track-player.requested", {
      active: trackPlayerActiveRef.current,
      reason,
    });

    if (!trackPlayerActiveRef.current) {
      return;
    }

    trackPlayerActiveRef.current = false;

    if (!isVoicePlaybackOwner(instanceIdRef.current)) {
      return;
    }

    try {
      await TrackPlayer.stop();
      emitDiagnostic("cleanup.track-player.stopped", { reason });
      await TrackPlayer.reset();
      emitDiagnostic("cleanup.track-player.reset", { reason });
    } catch {
      emitDiagnostic("cleanup.track-player.failed", { reason });
    }
  }, [clearTrackPlayerWatchers, emitDiagnostic]);

  const cleanup = useCallback(async (
    invalidateOperation = true,
    reason = "cleanup",
    result: "cancelled" | "native-ended" | "playback-error" = "cancelled",
  ) => {
    if (invalidateOperation) {
      playbackOperationRef.current += 1;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    await cleanupTrackPlayer(reason);

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

    publishVoicePlaybackStopped(instanceIdRef.current);
    emitDiagnostic("ownership.released", { reason });
    emitDiagnostic("ambient.duck.released", { reason });
    finishDiagnostic({ reason, result });
  }, [cleanupTrackPlayer, emitDiagnostic, finishDiagnostic]);

  const pausePlayback = useCallback(async () => {
    playbackOperationRef.current += 1;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (trackPlayerActiveRef.current) {
      if (isVoicePlaybackOwner(instanceIdRef.current)) {
        try {
          emitDiagnostic("playback.pause.requested", { reason: "user" });
          await TrackPlayer.pause();
          emitDiagnostic("playback.pause.completed", { reason: "user" });
        } catch {
          await cleanupTrackPlayer("pause-failed");
        }
      } else {
        trackPlayerActiveRef.current = false;
        clearTrackPlayerWatchers();
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
    publishVoicePlaybackStopped(instanceIdRef.current);
    emitDiagnostic("ownership.released", { reason: "user-pause" });
    emitDiagnostic("ambient.duck.released", { reason: "user-pause" });
    finishDiagnostic({ reason: "user-pause", result: "cancelled" });
  }, [cleanupTrackPlayer, clearTrackPlayerWatchers, emitDiagnostic, finishDiagnostic]);

  const loadAndPlayFromSource = useCallback(
    async (
      source: AudioSource,
      operation: number,
      diagnostic: ActiveVoiceDiagnostic | null = null,
    ) => {
      const emit = (event: string, fields: Record<string, unknown> = {}) => {
        diagnostic?.emitter.emit(event, fields, diagnostic.attemptId);
      };

      emit("audio-session.requested", { engine: "expo-audio" });
      try {
        await configureQuietRoomAudioSession();
        emit("audio-session.completed", { engine: "expo-audio" });
      } catch (error) {
        emit("audio-session.failed", { engine: "expo-audio", error: error instanceof Error ? error.name : "unknown" });
        throw error;
      }
      if (operation !== playbackOperationRef.current) {
        return false;
      }

      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }

      const player = createAudioPlayer(source, {
        updateInterval: 1000,
      });

      if (operation !== playbackOperationRef.current) {
        removeVoicePlayer(player);
        return false;
      }

      playerRef.current = player;

      statusIntervalRef.current = setInterval(() => {
        const playbackStatus = player.currentStatus;
        emit("playback.progress", {
          buffered: null,
          duration: finiteOrNull(playbackStatus.duration),
          isBuffering: playbackStatus.isBuffering,
          position: finiteOrNull(playbackStatus.currentTime),
          state: playbackStatus.playbackState,
          timeControlStatus: playbackStatus.timeControlStatus,
        });
        if (playbackStatus.didJustFinish) {
          emit("playback.terminal", { reason: "native-ended", errorCode: null });
          setStatus("idle");
          void cleanup(true, "native-ended", "native-ended");
        }
      }, 1000);

      player.play();
      if (operation !== playbackOperationRef.current) {
        removeVoicePlayer(player);
        if (playerRef.current === player) {
          playerRef.current = null;
        }
        return false;
      }

      publishVoicePlaybackStarted(instanceIdRef.current);
      emit("ownership.activity-started", { reason: "playback-started" });
      emit("ambient.duck.requested", { reason: "playback-started" });
      setStatus("playing");
      return true;
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
    async (
      authHeaders: Record<string, string>,
      remoteUri: string,
      operation: number,
      diagnostic: ActiveVoiceDiagnostic | null,
    ) => {
      let settled = false;

      const emit = (event: string, fields: Record<string, unknown> = {}) => {
        diagnostic?.emitter.emit(event, fields, diagnostic.attemptId);
      };
      const endpointMode = diagnostic?.mode === "fixture"
        ? "fixture"
        : diagnostic?.mode === "live-proxy"
          ? "live-proxy"
          : "live";

      const finish = async (reason: string, errorCode?: string) => {
        if (settled) {
          return;
        }

        if (
          operation !== playbackOperationRef.current ||
          !isVoicePlaybackOwner(instanceIdRef.current)
        ) {
          emit("playback.terminal.stale", { reason });
          return;
        }

        settled = true;
        emit("playback.terminal", { errorCode: errorCode || null, reason });
        clearTrackPlayerWatchers();
        trackPlayerActiveRef.current = false;

        if (isVoicePlaybackOwner(instanceIdRef.current)) {
          try {
            emit("cleanup.terminal.stop-requested", { reason });
            await TrackPlayer.stop();
            emit("cleanup.terminal.stop-completed", { reason });
            await TrackPlayer.reset();
            emit("cleanup.terminal.reset-completed", { reason });
          } catch {
            emit("cleanup.terminal.failed", { reason });
          }
        }

        if (errorCode) {
          console.warn("TrackPlayer voice playback failed", errorCode);
          setStatus("error");
          setError("Voice playback failed.");
          publishVoicePlaybackStopped(instanceIdRef.current);
          emit("ownership.released", { reason });
          emit("ambient.duck.released", { reason });
          diagnostic?.emitter.finishAttempt(diagnostic.attemptId, {
            errorCode,
            reason,
            result: "playback-error",
          });
          if (activeDiagnosticRef.current?.attemptId === diagnostic?.attemptId) {
            activeDiagnosticRef.current = null;
          }
          return;
        }

        setStatus("idle");
        setError("");
        publishVoicePlaybackStopped(instanceIdRef.current);
        emit("ownership.released", { reason });
        emit("ambient.duck.released", { reason });
        diagnostic?.emitter.finishAttempt(diagnostic.attemptId, {
          reason,
          result: "native-ended",
        });
        if (activeDiagnosticRef.current?.attemptId === diagnostic?.attemptId) {
          activeDiagnosticRef.current = null;
        }
      };

      const stillOwnsPlayback = () =>
        operation === playbackOperationRef.current &&
        isVoicePlaybackOwner(instanceIdRef.current);

      const pollStatus = async () => {
        try {
          const [playbackState, progress] = await Promise.all([
            TrackPlayer.getPlaybackState(),
            TrackPlayer.getProgress(),
          ]);

          emit("playback.poll", {
            buffered: finiteOrNull(progress.buffered),
            duration: finiteOrNull(progress.duration),
            isBuffering: playbackState.state === State.Buffering,
            position: finiteOrNull(progress.position),
            state: playbackState.state,
          });
          if (playbackState.state === State.Buffering) {
            emit("playback.buffering", {
              buffered: finiteOrNull(progress.buffered),
              duration: finiteOrNull(progress.duration),
              position: finiteOrNull(progress.position),
            });
          }

          if (isTrackPlayerTerminalState(playbackState)) {
            await finish(
              playbackState.state === State.Error ? "state-error" : "state-ended",
              playbackState.state === State.Error
                ? playbackState.error?.code || "track-player-state-error"
                : undefined
            );
          }
        } catch {
          await finish("poll-error", "track-player-poll-error");
        }
      };

      emit("setup.requested", { operation });
      emit("audio-session.requested", { engine: "track-player" });
      try {
        await ensureTrackPlayerSetup();
      } catch (error) {
        emit("audio-session.failed", {
          engine: "track-player",
          error: error instanceof Error ? error.name : "unknown",
        });
        throw error;
      }
      emit("setup.completed", { operation });
      emit("audio-session.completed", { engine: "track-player", source: "track-player.setup" });
      if (!stillOwnsPlayback()) {
        emit("setup.cancelled", { operation });
        return false;
      }
      emit("queue.reset.requested", { reason: "new-attempt" });
      await TrackPlayer.reset();
      emit("queue.reset.completed", { reason: "new-attempt" });
      if (!stillOwnsPlayback()) {
        emit("queue.reset.cancelled", { operation });
        return false;
      }

      trackPlayerSubscriptionsRef.current = [
        TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
          emit("playback.error", { errorCode: event.code || "track-player-error" });
          void finish("playback-error", event.code || "track-player-error");
        }),
        TrackPlayer.addEventListener(Event.PlaybackQueueEnded, (event) => {
          emit("playback.queue-ended", {
            position: finiteOrNull(event.position),
            track: finiteOrNull(event.track),
          });
          void finish("queue-ended");
        }),
        TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
          emit("playback.state", { state: event.state });
        }),
        TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
          emit("playback.progress", {
            buffered: finiteOrNull(event.buffered),
            duration: finiteOrNull(event.duration),
            position: finiteOrNull(event.position),
            track: finiteOrNull(event.track),
          });
        }),
        TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
          emit("playback.active-track", {
            index: finiteOrNull(event.index),
            lastIndex: finiteOrNull(event.lastIndex),
            lastPosition: finiteOrNull(event.lastPosition),
          });
        }),
        TrackPlayer.addEventListener(Event.PlaybackPlayWhenReadyChanged, (event) => {
          emit("playback.play-when-ready", { playWhenReady: event.playWhenReady });
        }),
      ];

      emit("queue.add.requested", { endpointMode });
      await TrackPlayer.add({
        artist: "Quiet Room",
        headers: authHeaders,
        id: uniqueVoiceId(),
        title: "Quiet Room voice",
        url: remoteUri,
      });
      emit("queue.add.completed", { endpointMode });
      if (!stillOwnsPlayback()) {
        emit("queue.add.cancelled", { operation });
        return false;
      }
      trackPlayerActiveRef.current = true;
      emit("playback.play.requested", { operation });
      await TrackPlayer.play();
      emit("playback.play.completed", { operation });
      if (!stillOwnsPlayback()) {
        trackPlayerActiveRef.current = false;
        emit("playback.play.cancelled", { operation });
        return false;
      }

      publishVoicePlaybackStarted(instanceIdRef.current);
      emit("ownership.activity-started", { reason: "playback-started" });
      emit("ambient.duck.requested", { reason: "playback-started" });
      trackPlayerStatusIntervalRef.current = setInterval(() => {
        void pollStatus();
      }, 1000);

      setStatus("playing");
      setError("");
      void pollStatus();
      return true;
    },
    [clearTrackPlayerWatchers]
  );

  const startConversationPlayback = useCallback(
    async (
      authHeaders: Record<string, string>,
      operation: number,
      diagnostic: VoicePlaybackDiagnosticDeepLink | null,
      activeDiagnostic: ActiveVoiceDiagnostic | null,
    ) => {
      if (!hasConversationAudio && !diagnostic) {
        return false;
      }

      if (
        (diagnostic?.mode === "live-trace" || diagnostic?.mode === "live-proxy") &&
        !hasConversationAudio
      ) {
        throw new Error("Live voice tracing requires a saved message.");
      }

      const resolvedConversationId = hasConversationAudio ? conversationId!.trim() : "fixture";
      const resolvedMessageIndex = hasConversationAudio ? (messageIndex as number) : 1;
      const remoteUri = diagnostic?.mode === "fixture" && activeDiagnostic
        ? buildDiagnosticFixtureVoiceUri(
            diagnostic,
            activeDiagnostic.emitter.runId,
            activeDiagnostic.attemptId,
            resolvedConversationId,
            resolvedMessageIndex,
          )
        : diagnostic?.mode === "live-proxy" && diagnostic.proxyBaseUrl
          ? buildDiagnosticProxyVoiceUri(
              diagnostic.proxyBaseUrl,
              resolvedConversationId,
              resolvedMessageIndex,
            )
          : buildConversationVoiceUri(voiceUrl, resolvedConversationId, resolvedMessageIndex);

      await emitSourceIdentity(
        activeDiagnostic,
        text,
        resolvedConversationId,
        resolvedMessageIndex,
      );

      if (VOICE_PLAYBACK_ENGINE === "track-player") {
        const playbackHeaders = diagnostic?.mode === "fixture"
          ? {}
          : diagnostic?.mode === "live-proxy" && activeDiagnostic
            ? {
                ...authHeaders,
                "X-QR-MOB-021-Attempt-Id": activeDiagnostic.attemptId,
                "X-QR-MOB-021-Run-Id": activeDiagnostic.emitter.runId,
              }
            : authHeaders;
        return startTrackPlayerConversationPlayback(
          playbackHeaders,
          remoteUri,
          operation,
          activeDiagnostic,
        );
      }

      if (diagnostic?.mode === "fixture") {
        throw new Error("Voice diagnostics require TrackPlayer.");
      }

      return loadAndPlayFromSource(
        {
          headers: authHeaders,
          uri: remoteUri,
        },
        operation,
        activeDiagnostic,
      );
    },
    [
      conversationId,
      hasConversationAudio,
      loadAndPlayFromSource,
      messageIndex,
      startTrackPlayerConversationPlayback,
      emitSourceIdentity,
      text,
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
        await TrackPlayer.play();
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

    if (playerRef.current) {
      const operation = ++playbackOperationRef.current;
      try {
        publishVoicePlayback(instanceIdRef.current);
        playerRef.current.play();
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

    await cleanup(true, "new-playback");
    const operation = ++playbackOperationRef.current;
    publishVoicePlayback(instanceIdRef.current);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus("loading");
    setError("");

    try {
      const diagnosticLink = parseVoicePlaybackDiagnosticDeepLink(await Linking.getInitialURL());
      let activeDiagnostic: ActiveVoiceDiagnostic | null = null;
      if (diagnosticLink) {
        const emitter = createVoicePlaybackDiagnosticEmitter({
          enabled: true,
          sink: (line) => console.info(line),
        });
        const fixtureCase = diagnosticLink.mode === "fixture"
          ? diagnosticLink.fixtureCase || "steady"
          : undefined;
        const endpointMode = diagnosticLink.mode === "fixture"
          ? "fixture"
          : diagnosticLink.mode === "live-proxy"
            ? "live-proxy"
            : "live";
        const attemptId = emitter.startAttempt({
          diagnosticMode: diagnosticLink.mode,
          endpointMode,
          ...(fixtureCase ? { fixtureCase } : {}),
          ...(diagnosticLink.fixtureSource ? { sourceClass: diagnosticLink.fixtureSource } : {}),
        });
        activeDiagnostic = { attemptId, emitter, mode: diagnosticLink.mode, fixtureCase };
        activeDiagnosticRef.current = activeDiagnostic;
        emitter.emit("source.asserted", {
          diagnosticMode: diagnosticLink.mode,
          endpointMode,
          ...(fixtureCase ? { fixtureCase } : {}),
          ...(diagnosticLink.fixtureSource ? { sourceClass: diagnosticLink.fixtureSource } : {}),
        }, attemptId);
        emitDiagnostic("ownership.claimed", { reason: "playback-requested" });
      }

      if (hasPresetAudio) {
        if (diagnosticLink) {
          throw new Error("Voice diagnostics cannot use preset audio.");
        }
        await loadAndPlayFromSource({ uri: resolvedAudioSrc }, operation);
        abortControllerRef.current = null;
        return;
      }

      const authHeaders = await resolveAuthHeaders();
      if (operation !== playbackOperationRef.current || controller.signal.aborted) {
        return;
      }

      if (hasConversationAudio || diagnosticLink) {
        try {
          const startedConversationPlayback = await startConversationPlayback(
            authHeaders,
            operation,
            diagnosticLink,
            activeDiagnostic,
          );
          if (startedConversationPlayback) {
            abortControllerRef.current = null;
            return;
          }
        } catch (conversationError) {
          if ((conversationError as Error | null)?.name === "AbortError") {
            return;
          }

          if (diagnosticLink) {
            emitDiagnostic("fallback.suppressed", { reason: "diagnostic-source-required" });
            throw conversationError;
          }

          await cleanup(false, "conversation-fallback");
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
            return;
          }

          await loadAndPlayFromSource({ uri: localUri }, operation);
          abortControllerRef.current = null;
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
        return;
      }

      await loadAndPlayFromSource({ uri: localUri }, operation);
      abortControllerRef.current = null;
    } catch (rawError) {
      if ((rawError as Error | null)?.name === "AbortError") {
        return;
      }

      const message =
        rawError instanceof Error ? rawError.message : "Unable to start voice playback.";

      console.warn("Voice playback failed", {
        name: rawError instanceof Error ? rawError.name : "UnknownError",
      });
      setStatus("error");
      setError(message);
      publishVoicePlaybackStopped(instanceIdRef.current);
      finishDiagnostic({ reason: "start-error", result: "playback-error" });
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
    emitDiagnostic,
    finishDiagnostic,
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
      void cleanup(true, "unmount");
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
