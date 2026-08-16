type VoicePlaybackListener = (activeId: string | null) => void;

const listeners = new Set<VoicePlaybackListener>();
let activeVoicePlaybackId: string | null = null;

export function publishVoicePlayback(activeId: string) {
  activeVoicePlaybackId = activeId;

  for (const listener of listeners) {
    listener(activeId);
  }
}

export function publishVoicePlaybackStopped(activeId: string) {
  if (activeVoicePlaybackId !== activeId) {
    return;
  }

  activeVoicePlaybackId = null;

  for (const listener of listeners) {
    listener(null);
  }
}

export function isVoicePlaybackOwner(activeId: string): boolean {
  return activeVoicePlaybackId === activeId;
}

export function subscribeVoicePlayback(
  listener: VoicePlaybackListener
): () => void {
  listeners.add(listener);
  listener(activeVoicePlaybackId);

  return () => {
    listeners.delete(listener);
  };
}
