import { setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";
import { ambientAudioInterruptionMode } from "./audioSessionPolicy";

const COMMON_AUDIO_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
} as const;

export async function configureQuietRoomAudioSession(): Promise<void> {
  await setAudioModeAsync({
    ...COMMON_AUDIO_MODE,
    interruptionMode: "duckOthers",
  });
}

export async function configureAmbientAudioSession(): Promise<void> {
  await setAudioModeAsync({
    ...COMMON_AUDIO_MODE,
    interruptionMode: ambientAudioInterruptionMode(Platform.OS),
  });
}
