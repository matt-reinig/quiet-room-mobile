import assert from "node:assert/strict";
import test from "node:test";

import {
  AMBIENT_AUDIO_DUCK_FACTOR,
  resolveAmbientAudioPlaybackIntent,
} from "../src/lib/ambientAudioPlayback.ts";
import {
  publishVoicePlayback,
  publishVoicePlaybackStarted,
  publishVoicePlaybackStopped,
  subscribeVoicePlaybackActivity,
} from "../src/lib/voicePlaybackBus.ts";

const NORMAL_VOLUME = 0.1;

function playbackIntent({
  enabled = true,
  foregroundVoiceActive = false,
  selectionActive = true,
} = {}) {
  return resolveAmbientAudioPlaybackIntent({
    appActive: true,
    enabled,
    foregroundVoiceActive,
    hydrated: true,
    normalVolume: NORMAL_VOLUME,
    selectionActive,
  });
}

test("ducks only during produced voice playback and restores for the active owner", () => {
  let activeVoiceId = null;
  const unsubscribe = subscribeVoicePlaybackActivity((activeId) => {
    activeVoiceId = activeId;
  });

  assert.equal(playbackIntent().targetVolume, NORMAL_VOLUME);

  publishVoicePlayback("voice-a");
  assert.equal(activeVoiceId, null, "claiming/loading alone must not duck ambience");

  publishVoicePlaybackStarted("voice-a");
  assert.equal(activeVoiceId, "voice-a");
  assert.equal(
    playbackIntent({ foregroundVoiceActive: Boolean(activeVoiceId) }).targetVolume,
    NORMAL_VOLUME * AMBIENT_AUDIO_DUCK_FACTOR,
  );

  publishVoicePlaybackStopped("voice-a");
  assert.equal(activeVoiceId, null);
  assert.equal(playbackIntent().targetVolume, NORMAL_VOLUME);
  unsubscribe();
});

test("stale start and stop events cannot restore ambience during sequential playback", () => {
  let activeVoiceId = null;
  const activity = [];
  const unsubscribe = subscribeVoicePlaybackActivity((activeId) => {
    activeVoiceId = activeId;
    activity.push(activeId);
  });

  publishVoicePlayback("voice-a");
  publishVoicePlaybackStarted("voice-a");
  publishVoicePlayback("voice-b");
  publishVoicePlaybackStarted("voice-b");
  publishVoicePlaybackStarted("voice-a");
  publishVoicePlaybackStopped("voice-a");

  assert.equal(activeVoiceId, "voice-b");
  assert.equal(
    playbackIntent({ foregroundVoiceActive: Boolean(activeVoiceId) }).targetVolume,
    NORMAL_VOLUME * AMBIENT_AUDIO_DUCK_FACTOR,
  );
  assert.deepEqual(activity, [null, "voice-a", "voice-b"]);

  publishVoicePlaybackStopped("voice-b");
  assert.equal(activeVoiceId, null);
  unsubscribe();
});

test("Off and feature disable remain authoritative after voice playback stops", () => {
  publishVoicePlayback("voice-authority");
  publishVoicePlaybackStarted("voice-authority");

  assert.deepEqual(playbackIntent({ selectionActive: false }), {
    shouldOwnPlayer: false,
    shouldPlay: false,
    targetVolume: 0,
  });
  assert.deepEqual(playbackIntent({ enabled: false }), {
    shouldOwnPlayer: false,
    shouldPlay: false,
    targetVolume: 0,
  });

  publishVoicePlaybackStopped("voice-authority");

  assert.equal(playbackIntent({ selectionActive: false }).shouldOwnPlayer, false);
  assert.equal(playbackIntent({ enabled: false }).shouldOwnPlayer, false);
});

test("microphone-only activity does not change ambient playback intent", () => {
  const beforeMicrophoneActivity = playbackIntent();
  const afterMicrophoneActivity = playbackIntent();

  assert.deepEqual(afterMicrophoneActivity, beforeMicrophoneActivity);
  assert.equal(afterMicrophoneActivity.targetVolume, NORMAL_VOLUME);
});
