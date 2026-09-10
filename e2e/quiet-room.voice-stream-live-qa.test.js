const {
  acceptAiConsentIfVisible,
  launchQuietRoom,
  loginWithKnownAccount,
} = require('./helpers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ids = require('./testIds');

const SYNTHETIC_FINAL_PHRASE = 'copper meadow nine';

const appScheme = process.env.E2E_APP_SCHEME || 'quietroommobileqa';
const diagnosticMode = process.env.VOICE_DIAGNOSTIC_MODE || 'live-trace';
const proxyBaseUrl = process.env.VOICE_DIAGNOSTIC_PROXY_BASE_URL || '';
const longReplyMode = process.env.VOICE_QA_LONG_REPLY === '1';
const evidenceDir = process.env.VOICE_QA_EVIDENCE_DIR || '';

function parseBoundedInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Invalid bounded integer configuration: ${value}`);
  }
  return parsed;
}

const longReplyAttempts = parseBoundedInteger(
  process.env.VOICE_QA_LONG_REPLY_ATTEMPTS,
  3,
  1,
  3,
);
const setupTimeoutMs = parseBoundedInteger(process.env.VOICE_QA_SETUP_TIMEOUT_MS, 120000, 1000, 600000);
const generationTimeoutMs = parseBoundedInteger(
  process.env.VOICE_QA_GENERATION_TIMEOUT_MS,
  240000,
  1000,
  900000,
);
const playbackTimeoutMs = parseBoundedInteger(
  process.env.VOICE_QA_PLAYBACK_TIMEOUT_MS,
  180000,
  1000,
  900000,
);
const postTerminalTimeoutMs = parseBoundedInteger(
  process.env.VOICE_QA_POST_TERMINAL_TIMEOUT_MS,
  5000,
  1000,
  600000,
);
const postTerminalHoldMs = Math.min(
  parseBoundedInteger(process.env.VOICE_QA_POST_TERMINAL_HOLD_MS, 2000, 1000, 10000),
  postTerminalTimeoutMs,
);
const targetSpeechMinMs = parseBoundedInteger(
  process.env.VOICE_QA_TARGET_SPEECH_MIN_MS,
  60000,
  1000,
  900000,
);
const targetSpeechMaxMs = parseBoundedInteger(
  process.env.VOICE_QA_TARGET_SPEECH_MAX_MS,
  120000,
  targetSpeechMinMs,
  900000,
);

jest.setTimeout(longReplyMode ? 1800000 : 360000);

function monotonicNowMs() {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function errorName(error) {
  return error instanceof Error ? error.name : 'unknown';
}

function diagnosticUrl() {
  if (process.env.VOICE_DIAGNOSTIC_URL) {
    return process.env.VOICE_DIAGNOSTIC_URL;
  }

  const payload = {
    enabled: true,
    mode: diagnosticMode,
  };

  if (diagnosticMode === 'live-proxy') {
    if (!proxyBaseUrl) {
      throw new Error('VOICE_DIAGNOSTIC_PROXY_BASE_URL is required for live-proxy mode.');
    }
    payload.proxyBaseUrl = proxyBaseUrl;
  }

  return `${appScheme}://quiet-room?voiceDiag=${encodeURIComponent(JSON.stringify(payload))}`;
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLabel(elementHandle) {
  const attributes = await elementHandle.getAttributes();
  return attributes?.label || attributes?.text || '';
}

async function waitForSendReady(sendButton, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if ((await readLabel(sendButton)) === 'Send') {
      return;
    }
    await delay(300);
  }

  throw new Error(`Timed out waiting for send button after ${timeoutMs}ms`);
}

async function startFreshChat(timeoutMs = 15000) {
  const panel = element(by.id(ids.conversationsPanel));
  await element(by.id(ids.conversationsButton)).tap();
  await waitFor(panel).toBeVisible().withTimeout(Math.min(timeoutMs, 10000));
  await element(by.id(ids.conversationsNew)).tap();

  try {
    await waitFor(panel).not.toBeVisible().withTimeout(Math.min(timeoutMs, 5000));
  } catch {
    await element(by.id(ids.conversationsClose)).tap().catch(() => null);
  }
  await waitFor(element(by.id(ids.openingMessage))).toExist().withTimeout(Math.min(timeoutMs, 15000));
}

async function sendSyntheticPrompt(timeoutMs = 120000, longReply = false) {
  const composer = element(by.id(ids.composerInput));
  const sendButton = element(by.id(ids.sendButton));
  const prompt =
    (longReply
      ? 'For this QA audio diagnostic, write an original reflective response of roughly 300 to 350 words about quiet prayer. ' +
        'Use several connected paragraphs, explain practical ways to begin and sustain a quiet prayer practice, and end with a concise concluding reflection. ' +
        'Do not mention this instruction or the diagnostic. '
      : 'For this QA audio diagnostic, write one representative short paragraph about quiet prayer. ') +
    `End the response with these exact final words: ${SYNTHETIC_FINAL_PHRASE}.`;
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1000, deadline - Date.now());

  await composer.tap();
  await composer.replaceText(prompt);
  await sendButton.tap();
  await acceptAiConsentIfVisible();
  await waitFor(element(by.id(ids.message.user(0)))).toExist().withTimeout(Math.min(30000, remaining()));
  await waitFor(element(by.id(ids.message.assistant(1)))).toExist().withTimeout(
    Math.min(120000, remaining()),
  );
  await waitForSendReady(sendButton, remaining());
}

async function readAssistantEvidence() {
  const assistantContent = element(by.id(ids.message.content('assistant', 1)));
  try {
    const attributes = await assistantContent.getAttributes();
    const rawText = typeof attributes?.label === 'string'
      ? attributes.label
      : typeof attributes?.text === 'string'
        ? attributes.text
        : '';
    const trimmedText = rawText.trim();
    const comparableText = trimmedText.replace(/[.!?]+$/u, '');
    return {
      sha256: crypto.createHash('sha256').update(rawText, 'utf8').digest('hex'),
      unicodeCharacterCount: Array.from(rawText).length,
      endsWithRequestedPhrase: comparableText.endsWith(SYNTHETIC_FINAL_PHRASE),
      readable: true,
    };
  } catch {
    return {
      sha256: null,
      unicodeCharacterCount: null,
      endsWithRequestedPhrase: false,
      readable: false,
    };
  }
}

function writePlaybackReadySignal() {
  if (!longReplyMode || !evidenceDir) {
    return false;
  }

  fs.mkdirSync(evidenceDir, { recursive: true });
  const signalPath = path.join(evidenceDir, 'playback-ready.signal');
  const temporaryPath = `${signalPath}.tmp-${process.pid}`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify({ event: 'playback-ready', emittedAt: new Date().toISOString() })}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  fs.renameSync(temporaryPath, signalPath);
  return true;
}

async function revealVoiceButton(timeoutMs) {
  const messageList = element(by.id(ids.messageList));
  const voiceButton = element(by.id(ids.message.voice('assistant', 1)));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await waitFor(voiceButton).toBeVisible().withTimeout(1200);
      return voiceButton;
    } catch {
      await messageList.swipe('up', 'fast', 0.45).catch(() => null);
      await delay(400);
    }
  }

  throw new Error(`Timed out revealing assistant voice button after ${timeoutMs}ms`);
}

async function waitForPlaybackEnd(voiceButton, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let requested = false;
  let started = false;
  let startedAtMs = null;

  while (Date.now() < deadline) {
    const label = await readLabel(voiceButton);
    if (label === 'Starting voice...') {
      requested = true;
    }
    if (label === 'Pause voice' && !started) {
      requested = true;
      started = true;
      startedAtMs = monotonicNowMs();
    }
    if (requested && label === 'Play voice') {
      return {
        actualPlaybackDurationMs:
          startedAtMs === null ? null : Math.round(monotonicNowMs() - startedAtMs),
      };
    }
    if (label === 'Retry voice') {
      const retryError = new Error('QA voice playback entered Retry voice before native completion.');
      retryError.code = 'retry-voice';
      throw retryError;
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for QA voice playback to end after ${timeoutMs}ms`);
}

async function waitForRecordingStartMarker(timeoutMs = 10000) {
  if (!longReplyMode || !evidenceDir) {
    return false;
  }

  const markerPath = path.join(evidenceDir, 'screenrecord.started');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(markerPath)) {
      return true;
    }
    await delay(100);
  }

  const captureError = new Error(`Timed out waiting for emulator recording start after ${timeoutMs}ms`);
  captureError.code = 'capture-start-timeout';
  throw captureError;
}

async function waitForPostTerminal(voiceButton, timeoutMs, holdMs) {
  const startedAtMs = monotonicNowMs();
  const deadline = Date.now() + timeoutMs;

  while (monotonicNowMs() - startedAtMs < holdMs) {
    if ((await readLabel(voiceButton)) !== 'Play voice') {
      throw new Error('Voice button changed state during the post-terminal hold.');
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out during post-terminal hold after ${timeoutMs}ms`);
    }
    await delay(Math.min(300, Math.max(50, holdMs - (monotonicNowMs() - startedAtMs))));
  }

  return Math.round(monotonicNowMs() - startedAtMs);
}

function classifyDuration(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return 'unknown';
  }
  if (durationMs < targetSpeechMinMs) {
    return 'short';
  }
  if (durationMs > targetSpeechMaxMs) {
    return 'long';
  }
  return 'target';
}

function writeEvidenceFile(filename, evidence) {
  if (!evidenceDir) {
    return null;
  }

  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = path.join(evidenceDir, filename);
  fs.writeFileSync(
    evidencePath,
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  return evidencePath;
}

function writeLongReplyEvidence(attempts) {
  return writeEvidenceFile('long-reply-evidence.json', {
    diagnosticMode,
    endpointMode: diagnosticMode === 'live-proxy' ? 'live-proxy' : 'direct-live-trace',
    durationMeasurement: 'wall-clock from first Pause voice label to Play voice label',
    attemptsRequested: longReplyAttempts,
    timeoutsMs: {
      setup: setupTimeoutMs,
      generation: generationTimeoutMs,
      playback: playbackTimeoutMs,
      postTerminal: postTerminalTimeoutMs,
    },
    targetSpeechMs: {
      min: targetSpeechMinMs,
      max: targetSpeechMaxMs,
    },
    attempts,
  });
}

async function runLongReplyAttempt(attemptNumber) {
  const record = {
    attempt: attemptNumber,
    startedAt: new Date().toISOString(),
    classification: 'inconclusive',
    timeoutPhase: null,
    durationBand: 'unknown',
    assistantEvidence: null,
    captureSignalEmitted: false,
    actualPlaybackDurationMs: null,
    setupDurationMs: null,
    generationDurationMs: null,
    postTerminalDurationMs: null,
    failurePhase: null,
    errorName: null,
  };
  const attemptStartedAtMs = monotonicNowMs();

  try {
    const setupStartedAtMs = monotonicNowMs();
    await startFreshChat(setupTimeoutMs);
    record.setupDurationMs = Math.round(monotonicNowMs() - setupStartedAtMs);

    const generationStartedAtMs = monotonicNowMs();
    await sendSyntheticPrompt(generationTimeoutMs, true);
    record.generationDurationMs = Math.round(monotonicNowMs() - generationStartedAtMs);
    record.assistantEvidence = await readAssistantEvidence();
    if (
      !record.assistantEvidence?.readable ||
      !record.assistantEvidence?.endsWithRequestedPhrase
    ) {
      const sourceError = new Error('Saved assistant source evidence is missing or incomplete.');
      sourceError.code = 'source-incomplete';
      throw sourceError;
    }

    const voiceButton = await revealVoiceButton(setupTimeoutMs);
    record.captureSignalEmitted = writePlaybackReadySignal();
    await waitForRecordingStartMarker();
    await voiceButton.tap();
    const playback = await waitForPlaybackEnd(voiceButton, playbackTimeoutMs);
    record.actualPlaybackDurationMs = playback.actualPlaybackDurationMs;
    record.durationBand = classifyDuration(playback.actualPlaybackDurationMs);
    if (record.durationBand === 'unknown') {
      const durationError = new Error('Native playback ended before an actual-playing duration was observed.');
      durationError.code = 'duration-unavailable';
      throw durationError;
    }

    record.postTerminalDurationMs = await waitForPostTerminal(
      voiceButton,
      postTerminalTimeoutMs,
      postTerminalHoldMs,
    );
    record.classification = `complete-${record.durationBand}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    record.errorName = errorName(error);
    record.failurePhase = record.setupDurationMs === null
      ? 'setup'
      : record.generationDurationMs === null
        ? 'generation'
        : record.actualPlaybackDurationMs === null
          ? 'playback'
          : 'post-terminal';
    if (error?.code === 'capture-start-timeout') {
      record.failurePhase = 'capture-start';
      record.timeoutPhase = 'capture-start';
      record.classification = 'capture-start-timeout';
    } else if (/timed out/i.test(message)) {
      record.timeoutPhase = record.failurePhase;
      record.classification = `${record.failurePhase}-timeout`;
    } else if (error?.code === 'retry-voice') {
      record.classification = 'playback-error';
    } else if (error?.code === 'source-incomplete') {
      record.failurePhase = 'source';
      record.classification = 'source-inconclusive';
    } else if (error?.code === 'duration-unavailable') {
      record.failurePhase = 'playback';
      record.classification = 'playback-duration-inconclusive';
    } else {
      record.classification = `${record.failurePhase}-error`;
    }
  }

  record.elapsedMs = Math.round(monotonicNowMs() - attemptStartedAtMs);
  record.finishedAt = new Date().toISOString();
  return record;
}

async function runLongReplyTrace() {
  if (diagnosticMode !== 'live-trace' && diagnosticMode !== 'live-proxy') {
    throw new Error('Long-reply mode requires live-trace or live-proxy mode.');
  }
  if (process.env.VOICE_DIAGNOSTIC_URL) {
    throw new Error('Long-reply mode does not accept a custom diagnostic URL.');
  }

  await launchQuietRoom({ delete: true, url: diagnosticUrl() });
  await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(Math.min(60000, setupTimeoutMs));
  await loginWithKnownAccount();

  const attempts = [];
  for (let attemptNumber = 1; attemptNumber <= longReplyAttempts; attemptNumber += 1) {
    attempts.push(await runLongReplyAttempt(attemptNumber));
  }

  const evidencePath = writeLongReplyEvidence(attempts);
  const failedAttempts = attempts.filter((attempt) => !attempt.classification.startsWith('complete-'));
  if (failedAttempts.length > 0) {
    throw new Error(
      `Long-reply trace had ${failedAttempts.length} non-complete attempt(s): ${failedAttempts
        .map((attempt) => `${attempt.attempt}:${attempt.classification}`)
        .join(', ')}${evidencePath ? `; evidence=${evidencePath}` : ''}`,
    );
  }
}

describe('QR-MOB-021 real QA TrackPlayer stream diagnostics', () => {
  it('captures one authenticated saved-message TTS stream with a distinctive ending', async () => {
    if (longReplyMode) {
      await runLongReplyTrace();
      return;
    }

    await launchQuietRoom({ delete: true, url: diagnosticUrl() });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await loginWithKnownAccount();
    await startFreshChat();
    await sendSyntheticPrompt();
    const assistantEvidence = await readAssistantEvidence();
    if (!assistantEvidence.readable || !assistantEvidence.endsWithRequestedPhrase) {
      throw new Error('Saved assistant source evidence is missing or incomplete.');
    }

    const voiceButton = await revealVoiceButton(30000);
    await voiceButton.tap();
    const playback = await waitForPlaybackEnd(voiceButton, 180000);
    writeEvidenceFile('short-live-evidence.json', {
      diagnosticMode,
      endpointMode: diagnosticMode === 'live-proxy' ? 'live-proxy' : 'direct-live-trace',
      durationMeasurement: 'wall-clock from first Pause voice label to Play voice label',
      attemptsRequested: 1,
      attempts: [{
        attempt: 1,
        assistantEvidence,
        actualPlaybackDurationMs: playback.actualPlaybackDurationMs,
        classification: 'complete',
      }],
    });
  });
});
