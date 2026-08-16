import type { AudioSource } from "expo-audio";

export const AMBIENT_AUDIO_STORAGE_KEY = "gabriel.ambientAudio.environment.v1";

export const AMBIENT_AUDIO_ENVIRONMENTS = [
  "off",
  "brown-noise",
  "rain",
  "quiet-church",
  "faint-chant",
] as const;

export type AmbientAudioEnvironment = (typeof AMBIENT_AUDIO_ENVIRONMENTS)[number];

export type AmbientAudioOption = {
  description: string;
  environment: AmbientAudioEnvironment;
  label: string;
};

export const AMBIENT_AUDIO_OPTIONS: readonly AmbientAudioOption[] = [
  {
    description: "Silence",
    environment: "off",
    label: "Off",
  },
  {
    description: "Soft, neutral background sound",
    environment: "brown-noise",
    label: "Brown Noise",
  },
  {
    description: "Gentle natural rain",
    environment: "rain",
    label: "Rain",
  },
  {
    description: "The distant room tone of a quiet church",
    environment: "quiet-church",
    label: "Quiet Church",
  },
  {
    description: "Low, distant sacred chant",
    environment: "faint-chant",
    label: "Faint Chant",
  },
];

const AMBIENT_AUDIO_SOURCES: Record<Exclude<AmbientAudioEnvironment, "off">, AudioSource> = {
  "brown-noise": require("../../assets/audio/ambient/brown-noise.mp3"),
  "faint-chant": require("../../assets/audio/ambient/faint-chant.m4a"),
  "quiet-church": require("../../assets/audio/ambient/quiet-church.mp3"),
  rain: require("../../assets/audio/ambient/gentle-rain.mp3"),
};

const AMBIENT_AUDIO_VOLUMES: Record<Exclude<AmbientAudioEnvironment, "off">, number> = {
  "brown-noise": 0.08,
  "faint-chant": 0.07,
  "quiet-church": 0.1,
  rain: 0.09,
};

export function isAmbientAudioEnvironment(value: unknown): value is AmbientAudioEnvironment {
  return (
    typeof value === "string" &&
    (AMBIENT_AUDIO_ENVIRONMENTS as readonly string[]).includes(value)
  );
}

export function ambientAudioSource(
  environment: Exclude<AmbientAudioEnvironment, "off">,
): AudioSource {
  return AMBIENT_AUDIO_SOURCES[environment];
}

export function ambientAudioVolume(
  environment: Exclude<AmbientAudioEnvironment, "off">,
): number {
  return AMBIENT_AUDIO_VOLUMES[environment];
}

export function ambientAudioLabel(environment: AmbientAudioEnvironment): string {
  return (
    AMBIENT_AUDIO_OPTIONS.find((option) => option.environment === environment)?.label || "Off"
  );
}
