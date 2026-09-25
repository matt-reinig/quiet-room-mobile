import { setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";
import { ambientAudioInterruptionMode } from "./audioSessionPolicy";

const AMBIENT_AUDIO_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
} as const;

let ambientAudioSessionConfiguration: Promise<void> = Promise.resolve();

export async function configureAmbientAudioSession(): Promise<void> {
  ambientAudioSessionConfiguration = ambientAudioSessionConfiguration
    .catch(() => {
      // A later configuration attempt must remain usable after a native failure.
    })
    .then(() =>
      setAudioModeAsync({
        ...AMBIENT_AUDIO_MODE,
        interruptionMode: ambientAudioInterruptionMode(Platform.OS),
      }),
    );
  await ambientAudioSessionConfiguration;
}

export async function waitForAmbientAudioSessionConfiguration(): Promise<void> {
  await ambientAudioSessionConfiguration.catch(() => {
    // TrackPlayer can still establish its own session after an ambient failure.
  });
}
