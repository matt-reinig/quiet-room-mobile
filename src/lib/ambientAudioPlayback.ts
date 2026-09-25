export const AMBIENT_AUDIO_DUCK_FACTOR = 0.4;

type AmbientAudioPlaybackInput = {
  appActive: boolean;
  enabled: boolean;
  foregroundVoiceActive: boolean;
  hydrated: boolean;
  normalVolume: number;
  selectionActive: boolean;
};

export type AmbientAudioPlaybackIntent = {
  shouldOwnPlayer: boolean;
  shouldPlay: boolean;
  targetVolume: number;
};

export function resolveAmbientAudioPlaybackIntent({
  appActive,
  enabled,
  foregroundVoiceActive,
  hydrated,
  normalVolume,
  selectionActive,
}: AmbientAudioPlaybackInput): AmbientAudioPlaybackIntent {
  const shouldOwnPlayer = enabled && hydrated && selectionActive;
  const shouldPlay = shouldOwnPlayer && appActive;

  return {
    shouldOwnPlayer,
    shouldPlay,
    targetVolume: shouldPlay
      ? normalVolume * (foregroundVoiceActive ? AMBIENT_AUDIO_DUCK_FACTOR : 1)
      : 0,
  };
}
