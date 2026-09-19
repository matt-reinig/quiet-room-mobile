const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { execFileSync } = require('child_process');
const { launchQuietRoom, loginWithKnownAccount } = require('./helpers');
const ids = require('./testIds');

// Input is an ignored local file recovered from a read-only QA source lookup.
// This test never sends a chat message or changes the saved conversation.
jest.setTimeout(420000);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const parseEvents = (log) => log.split('\n').flatMap((line) => {
  const prefix = 'QR_MOB_021_VOICE_DIAG ';
  const position = line.indexOf(prefix + '{');
  if (position < 0) return [];
  try { return [JSON.parse(line.slice(position + prefix.length))]; }
  catch { return []; }
});

const describeComparison = process.env.VOICE_SAVED_SOURCE_FILE ? describe : describe.skip;
describeComparison('QR-MOB-021 same saved reply comparison', () => {
  it('records normal direct playback of the selected existing reply', async () => {
    const source = JSON.parse(fs.readFileSync(process.env.VOICE_SAVED_SOURCE_FILE, 'utf8'));
    const output = path.resolve(process.env.VOICE_COMPARISON_OUTPUT);
    const serial = process.env.ANDROID_SERIAL;
    const buildVariant = process.env.VOICE_COMPARISON_VARIANT;
    if (!['published', 'capture'].includes(buildVariant)) throw new Error('An explicit build variant is required');
    const selectedApkSha256 = createHash('sha256').update(fs.readFileSync(path.resolve('android/app/build/outputs/apk/release/app-release.apk'))).digest('hex');
    if (!serial?.startsWith('emulator-')) throw new Error('An explicit emulator is required');
    if (!source.conversationId || !Number.isInteger(source.messageIndex) ||
        !/^[a-f0-9]{64}$/.test(source.sourceSha256)) throw new Error('Invalid saved-source input');
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
    const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { timeout: 20000, maxBuffer: 64 * 1024 * 1024 });
    const payload = encodeURIComponent(JSON.stringify({ enabled: true, mode: 'live-trace' }));
    const flags = encodeURIComponent(JSON.stringify({ voice_mode: false, ambient_audio: false }));
    await launchQuietRoom({ delete: true, url: `quietroommobileqa://quiet-room?ff=${flags}&voiceDiag=${payload}` });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await loginWithKnownAccount();
    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsList))).toBeVisible().withTimeout(15000);
    const row = element(by.id(ids.conversation.row(source.conversationId)));
    let found = false;
    for (let index = 0; index < 60; index += 1) {
      try {
        await waitFor(row).toBeVisible().withTimeout(500);
        found = true;
        break;
      } catch {
        await element(by.id(ids.conversationsList)).swipe('up', 'fast', 0.7);
        await delay(300);
      }
    }
    if (!found) throw new Error('Saved conversation was not found; no TTS requested');
    await row.tap();
    const button = element(by.id(ids.message.voice('assistant', source.messageIndex)));
    for (let index = 0; index < 25; index += 1) {
      try {
        await waitFor(button).toBeVisible().withTimeout(700);
        break;
      } catch {
        await element(by.id(ids.messageList)).swipe('up', 'fast', 0.6);
      }
    }
    await waitFor(button).toBeVisible().withTimeout(5000);
    const label = async () => {
      const a = await button.getAttributes();
      return a.label || a.text || '';
    };
    if (await label() !== 'Play voice') throw new Error('Playback was not idle before controlled tap');
    const priorAttempts = new Set(parseEvents(adb('logcat', '-d', '-s', 'ReactNativeJS').toString()).map((event) => event.attemptId).filter(Boolean));
    const before = new Date().toISOString();
    const recording = path.join(output, 'emulator.webm');
    let evidence;
    adb('emu', 'screenrecord', 'start', '--time-limit', '180', recording);
    try {
      await button.tap();
      let started = false;
      let completed = false;
      const deadline = Date.now() + 165000;
      while (Date.now() < deadline) {
        const current = await label();
        if (current === 'Retry voice') throw new Error('Native playback failed');
        if (current === 'Pause voice') started = true;
        if (started && current === 'Play voice') { completed = true; break; }
        await delay(250);
      }
      if (!completed) throw new Error('Playback did not complete inside recording budget');
      await delay(2500);
      const log = adb('logcat', '-d', '-s', 'ReactNativeJS').toString();
      fs.writeFileSync(path.join(output, 'device.log'), log, { mode: 0o600 });
      const events = parseEvents(log).filter((event) => event.attemptId && !priorAttempts.has(event.attemptId));
      const identities = events.filter((event) => event.event === 'source.identity');
      if (identities.length !== 1) throw new Error('Expected one correlated source identity');
      const identity = identities[0];
      fs.writeFileSync(path.join(output, 'events.json'), JSON.stringify(events, null, 2));
      // Resolve the actual field from the emitter contract, without exposing text.
      const observedHash = identity.fields.sourceSha256;
      if (observedHash !== source.sourceSha256) throw new Error('Playback source hash mismatch');
      const conversationSha256 = createHash('sha256').update(source.conversationId).digest('hex');
      if (identity.fields.conversationSha256 !== conversationSha256 || identity.fields.sourceSlot !== source.messageIndex) {
        throw new Error('Playback conversation or slot mismatch');
      }
      if (identity.appVariant !== 'qa' || identity.releaseEnv !== 'qa' || identity.voicePlaybackEngine !== 'track-player' ||
          identity.trackPlayerPackage !== 'react-native-track-player' || identity.trackPlayerVersion !== '4.1.2') {
        throw new Error('Unexpected playback runtime');
      }
      const own = events.filter((event) => event.runId === identity.runId && event.attemptId === identity.attemptId);
      if (!own.some((event) => event.event === 'playback.queue-ended')) throw new Error('Native queue end missing');
      if (!own.some((event) => event.event === 'attempt.finished' && event.fields?.result === 'native-ended') ||
          !own.some((event) => event.event === 'cleanup.terminal.reset-completed') ||
          !own.some((event) => event.event === 'ownership.released') ||
          own.some((event) => /\.(error|failed)$/.test(event.event))) throw new Error('Incomplete or failed native terminal lifecycle');
      evidence = {
        correlation: { runId: identity.runId, attemptId: identity.attemptId },
        sourceSha256: observedHash, sourceSlot: identity.fields.sourceSlot, conversationSha256,
        buildVariant, selectedApkSha256,
        trigger: 'manual-existing-reply', nativeQueueEnded: true,
        preTapAt: before, finishedAt: new Date().toISOString(),
        scope: 'source-and-lifecycle; audible completeness requires separate recording analysis',
      };
    } finally {
      adb('emu', 'screenrecord', 'stop');
    }
    if (!fs.existsSync(recording) || fs.statSync(recording).size === 0) throw new Error('Recording is missing or empty');
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 });
  });
});
