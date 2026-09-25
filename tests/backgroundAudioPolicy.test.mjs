import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appConfig = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
const voiceButtonSource = readFileSync(
  new URL("../src/components/MessageVoiceButton.tsx", import.meta.url),
  "utf8",
);
const envSource = readFileSync(new URL("../src/config/env.ts", import.meta.url), "utf8");

test("iOS declares playback-only background audio", () => {
  assert.deepEqual(appConfig.expo.ios.infoPlist.UIBackgroundModes, ["audio"]);
});

test("all spoken voice sources use TrackPlayer", () => {
  assert.match(voiceButtonSource, /from "react-native-track-player"/);
  assert.doesNotMatch(voiceButtonSource, /from "expo-audio"/);
  assert.doesNotMatch(voiceButtonSource, /VOICE_PLAYBACK_ENGINE/);
  assert.match(
    voiceButtonSource,
    /startTrackPlayerVoicePlayback\(\{\}, resolvedAudioSrc, operation\)/,
  );
  assert.match(
    voiceButtonSource,
    /startTrackPlayerVoicePlayback\(\{\}, localUri, operation, localUri\)/,
  );
});

test("voice playback no longer has a QA-versus-production engine switch", () => {
  assert.doesNotMatch(envSource, /VOICE_PLAYBACK_ENGINE/);
  assert.doesNotMatch(envSource, /VoicePlaybackEnginePreference/);
});
