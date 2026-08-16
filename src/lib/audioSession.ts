import { setAudioModeAsync } from "expo-audio";

export async function configureQuietRoomAudioSession(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    interruptionMode: "duckOthers",
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });
}
