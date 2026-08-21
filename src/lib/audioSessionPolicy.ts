export type QuietRoomAudioInterruptionMode =
  | "doNotMix"
  | "duckOthers"
  | "mixWithOthers";

export function ambientAudioInterruptionMode(
  platform: string,
): QuietRoomAudioInterruptionMode {
  return platform === "android" ? "mixWithOthers" : "duckOthers";
}
