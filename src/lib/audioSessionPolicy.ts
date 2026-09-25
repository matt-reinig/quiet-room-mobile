export type QuietRoomAudioInterruptionMode =
  | "doNotMix"
  | "duckOthers"
  | "mixWithOthers";

export function ambientAudioInterruptionMode(
  platform: string,
): QuietRoomAudioInterruptionMode {
  return platform === "android" ? "mixWithOthers" : "duckOthers";
}

export function shouldConfigureAmbientAudioSession(
  foregroundVoiceClaimed: boolean,
): boolean {
  // TrackPlayer and expo-audio share the process-wide iOS audio session.
  // From initial claim through playback, TrackPlayer must retain its background
  // category without racing an async ambient-session reconfiguration.
  return !foregroundVoiceClaimed;
}
