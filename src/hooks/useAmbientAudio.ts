import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  AMBIENT_AUDIO_STORAGE_KEY,
  ambientAudioSource,
  ambientAudioVolume,
  isAmbientAudioEnvironment,
  type AmbientAudioEnvironment,
} from "../lib/ambientAudio";
import { configureQuietRoomAudioSession } from "../lib/audioSession";
import { resolveAmbientAudioPlaybackIntent } from "../lib/ambientAudioPlayback";
import { subscribeVoicePlaybackActivity } from "../lib/voicePlaybackBus";

export type AmbientAudioPlaybackStatus = "error" | "off" | "paused" | "playing" | "starting";

type AmbientPlayer = {
  environment: Exclude<AmbientAudioEnvironment, "off">;
  player: AudioPlayer;
};

type UseAmbientAudioResult = {
  hydrated: boolean;
  playbackStatus: AmbientAudioPlaybackStatus;
  selectedEnvironment: AmbientAudioEnvironment;
  selectEnvironment: (environment: AmbientAudioEnvironment) => void;
};

const FADE_DURATION_MS = 500;
const FADE_STEP_MS = 50;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fadePlayer(
  player: AudioPlayer,
  from: number,
  to: number,
  operation: number,
  currentOperation: () => number,
): Promise<boolean> {
  const steps = Math.max(1, Math.round(FADE_DURATION_MS / FADE_STEP_MS));

  for (let step = 0; step <= steps; step += 1) {
    if (operation !== currentOperation()) {
      return false;
    }

    const progress = step / steps;

    try {
      player.volume = from + (to - from) * progress;
    } catch {
      return false;
    }

    if (step < steps) {
      await delay(FADE_STEP_MS);
    }
  }

  return operation === currentOperation();
}

function removePlayer(player: AudioPlayer): void {
  try {
    player.pause();
  } catch {
    // The native player may already have been released.
  }

  try {
    player.remove();
  } catch {
    // The native player may already have been released.
  }
}

export function useAmbientAudio(enabled: boolean): UseAmbientAudioResult {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [foregroundVoiceActive, setForegroundVoiceActive] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [playbackStatus, setPlaybackStatus] = useState<AmbientAudioPlaybackStatus>("off");
  const [selectedEnvironment, setSelectedEnvironment] =
    useState<AmbientAudioEnvironment>("off");
  const operationRef = useRef(0);
  const playerRef = useRef<AmbientPlayer | null>(null);
  const storageWriteRef = useRef<Promise<void>>(Promise.resolve());
  const transitionRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;

    void AsyncStorage.getItem(AMBIENT_AUDIO_STORAGE_KEY)
      .then((storedValue) => {
        if (!cancelled) {
          setSelectedEnvironment(
            isAmbientAudioEnvironment(storedValue) ? storedValue : "off",
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedEnvironment("off");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        operationRef.current += 1;
        const ambientPlayer = playerRef.current;
        if (ambientPlayer) {
          try {
            ambientPlayer.player.volume = 0;
            ambientPlayer.player.pause();
          } catch {
            // Reconciliation will recreate the player if the native object was released.
          }
          setPlaybackStatus("paused");
        }
      }

      setAppState(nextState);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    return subscribeVoicePlaybackActivity((activeId) => {
      operationRef.current += 1;
      setForegroundVoiceActive(Boolean(activeId));
    });
  }, []);

  useEffect(() => {
    const operation = ++operationRef.current;
    const currentOperation = () => operationRef.current;
    const normalVolume =
      selectedEnvironment === "off" ? 0 : ambientAudioVolume(selectedEnvironment);
    const { shouldOwnPlayer, shouldPlay, targetVolume } =
      resolveAmbientAudioPlaybackIntent({
        appActive: appState === "active",
        enabled,
        foregroundVoiceActive,
        hydrated,
        normalVolume,
        selectionActive: selectedEnvironment !== "off",
      });

    const reconcile = async () => {
      let ambientPlayer = playerRef.current;

      if (
        ambientPlayer &&
        (!shouldOwnPlayer || ambientPlayer.environment !== selectedEnvironment)
      ) {
        playerRef.current = null;
        await fadePlayer(
          ambientPlayer.player,
          ambientPlayer.player.volume,
          0,
          operation,
          currentOperation,
        );
        removePlayer(ambientPlayer.player);
        ambientPlayer = null;
      }

      if (!shouldOwnPlayer) {
        if (operation === currentOperation()) {
          setPlaybackStatus("off");
        }
        return;
      }

      if (!ambientPlayer) {
        if (operation === currentOperation()) {
          setPlaybackStatus(shouldPlay ? "starting" : "paused");
        }

        try {
          await configureQuietRoomAudioSession();
          if (operation !== currentOperation()) {
            return;
          }

          const environment = selectedEnvironment as Exclude<AmbientAudioEnvironment, "off">;
          const player = createAudioPlayer(ambientAudioSource(environment), {
            updateInterval: 1000,
          });
          player.loop = true;
          player.volume = 0;
          ambientPlayer = { environment, player };
          playerRef.current = ambientPlayer;
        } catch (error) {
          console.warn("Ambient audio failed to initialize", error);
          if (operation === currentOperation()) {
            setPlaybackStatus("error");
          }
          return;
        }
      }

      if (!shouldPlay) {
        const faded = await fadePlayer(
          ambientPlayer.player,
          ambientPlayer.player.volume,
          0,
          operation,
          currentOperation,
        );
        if (!faded) {
          return;
        }

        try {
          ambientPlayer.player.pause();
        } catch {
          // The next reconciliation will recreate a released player if needed.
        }
        setPlaybackStatus("paused");
        return;
      }

      try {
        ambientPlayer.player.play();
        const faded = await fadePlayer(
          ambientPlayer.player,
          ambientPlayer.player.volume,
          targetVolume,
          operation,
          currentOperation,
        );
        if (faded) {
          setPlaybackStatus("playing");
        }
      } catch (error) {
        console.warn("Ambient audio playback failed", error);
        if (operation === currentOperation()) {
          setPlaybackStatus("error");
        }
      }
    };

    transitionRef.current = transitionRef.current
      .catch(() => {
        // Keep later selections usable after an unexpected transition failure.
      })
      .then(reconcile);
  }, [appState, enabled, foregroundVoiceActive, hydrated, selectedEnvironment]);

  useEffect(() => {
    return () => {
      operationRef.current += 1;
      const ambientPlayer = playerRef.current;
      playerRef.current = null;
      if (ambientPlayer) {
        removePlayer(ambientPlayer.player);
      }
    };
  }, []);

  const selectEnvironment = useCallback((environment: AmbientAudioEnvironment) => {
    setSelectedEnvironment(environment);
    storageWriteRef.current = storageWriteRef.current
      .catch(() => {
        // Keep later selections persistable after a failed write.
      })
      .then(() => AsyncStorage.setItem(AMBIENT_AUDIO_STORAGE_KEY, environment))
      .catch(() => {
        console.warn("Unable to persist the ambient audio selection.");
      });
  }, []);

  return {
    hydrated,
    playbackStatus,
    selectedEnvironment,
    selectEnvironment,
  };
}
