export type PromptCue = {
  id: string;
  label: string;
  requiresAuth: boolean;
};

export type PromptCueVariant = "quiet_room";

export const PROMPT_CUES_BY_VARIANT: Record<PromptCueVariant, PromptCue[]> = {
  quiet_room: [
    {
      id: "scripture-finding",
      label: "I'd like help finding a scripture to pray with.",
      requiresAuth: false,
    },
    {
      id: "recollecting-myself",
      label: "I'd like help recollecting myself before God.",
      requiresAuth: false,
    },
  ],
};

type GetPromptCuesArgs = {
  isAnon: boolean;
  variant?: PromptCueVariant;
};

export function getPromptCues({
  isAnon,
  variant = "quiet_room",
}: GetPromptCuesArgs): PromptCue[] {
  const cues = PROMPT_CUES_BY_VARIANT[variant];
  return cues.filter((cue) => !cue.requiresAuth || !isAnon);
}
