import type { ImageSourcePropType } from "react-native";

export const SACRED_IMAGE_STORAGE_KEY = "gabriel.sacredImageId";

export const SACRED_IMAGE_IDS = [
  "crucifix",
  "mary",
  "gethsemane",
  "calming-the-storm",
] as const;

export type SacredImageId = (typeof SACRED_IMAGE_IDS)[number];

export type SacredImage = {
  accessibilityLabel: string;
  id: SacredImageId;
  source: ImageSourcePropType;
};

export const DEFAULT_SACRED_IMAGE_ID: SacredImageId = "crucifix";

export const SACRED_IMAGES: readonly SacredImage[] = [
  {
    accessibilityLabel: "Crucifix",
    id: "crucifix",
    source: require("../../assets/crucifix-web.png"),
  },
  {
    accessibilityLabel: "Mary in prayer",
    id: "mary",
    source: require("../../assets/sacred-images/mary-virgin-in-prayer.jpg"),
  },
  {
    accessibilityLabel: "Christ in Gethsemane",
    id: "gethsemane",
    source: require("../../assets/sacred-images/christ-in-gethsemane.jpg"),
  },
  {
    accessibilityLabel: "Jesus stilling the tempest",
    id: "calming-the-storm",
    source: require("../../assets/sacred-images/jesus-stilling-the-tempest.jpg"),
  },
];

export function isSacredImageId(value: string | null): value is SacredImageId {
  return SACRED_IMAGE_IDS.includes(value as SacredImageId);
}

export function sacredImageForId(id: SacredImageId): SacredImage {
  return SACRED_IMAGES.find((image) => image.id === id) ?? SACRED_IMAGES[0];
}

export function adjacentSacredImageId(
  currentId: SacredImageId,
  direction: -1 | 1,
): SacredImageId {
  const currentIndex = SACRED_IMAGES.findIndex((image) => image.id === currentId);
  const nextIndex = (currentIndex + direction + SACRED_IMAGES.length) % SACRED_IMAGES.length;
  return SACRED_IMAGES[nextIndex].id;
}
