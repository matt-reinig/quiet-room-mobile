type VoicePlaybackListener = (activeId: string | null) => void;

const listeners = new Set<VoicePlaybackListener>();
const activityListeners = new Set<VoicePlaybackListener>();
let activeVoicePlaybackId: string | null = null;
let activeVoicePlaybackActivityId: string | null = null;

function notifyListeners(
  subscribers: Set<VoicePlaybackListener>,
  activeId: string | null,
): void {
  for (const listener of subscribers) {
    listener(activeId);
  }
}

export function publishVoicePlayback(activeId: string) {
  if (
    activeVoicePlaybackActivityId &&
    activeVoicePlaybackActivityId !== activeId
  ) {
    activeVoicePlaybackActivityId = activeId;
    notifyListeners(activityListeners, activeId);
  }

  activeVoicePlaybackId = activeId;
  notifyListeners(listeners, activeId);
}

export function publishVoicePlaybackStarted(activeId: string) {
  if (
    activeVoicePlaybackId !== activeId ||
    activeVoicePlaybackActivityId === activeId
  ) {
    return;
  }

  activeVoicePlaybackActivityId = activeId;
  notifyListeners(activityListeners, activeId);
}

export function publishVoicePlaybackStopped(activeId: string) {
  if (activeVoicePlaybackId !== activeId) {
    return;
  }

  activeVoicePlaybackId = null;
  notifyListeners(listeners, null);

  if (activeVoicePlaybackActivityId === activeId) {
    activeVoicePlaybackActivityId = null;
    notifyListeners(activityListeners, null);
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

export function subscribeVoicePlaybackActivity(
  listener: VoicePlaybackListener,
): () => void {
  activityListeners.add(listener);
  listener(activeVoicePlaybackActivityId);

  return () => {
    activityListeners.delete(listener);
  };
}
