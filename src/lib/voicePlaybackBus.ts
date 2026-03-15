const listeners = new Set<(activeId: string) => void>();

export function publishVoicePlayback(activeId: string) {
  for (const listener of listeners) {
    listener(activeId);
  }
}

export function subscribeVoicePlayback(
  listener: (activeId: string) => void
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
