const {
  acceptAiConsentIfVisible,
  launchQuietRoom,
  waitForExistsMaybe,
} = require('./helpers');
const ids = require('./testIds');

// This file is intentionally separate from the live-QA runner. Start the fixture server first
// and run this file against the same QA/local TrackPlayer build used by the existing diagnostics.
const fixtureBaseUrl = process.env.VOICE_FIXTURE_BASE_URL || 'http://10.0.2.2:8787';
const fixtureCase = process.env.VOICE_FIXTURE_CASE || 'steady';
const runAutomaticVoiceMode = process.env.QR_MOB_021_LIFECYCLE_AUTO === '1';
const lifecycleAttempts = 2;

jest.setTimeout(240000);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lifecycleUrl({ ambientAudio = false, voiceMode = false } = {}) {
  const flags = encodeURIComponent(JSON.stringify({
    ambient_audio: ambientAudio,
    chat_model_gpt_5_1: true,
    voice_mode: voiceMode,
  }));
  const diagnostic = encodeURIComponent(JSON.stringify({
    enabled: true,
    fixtureBaseUrl,
    fixtureCase,
    mode: 'fixture',
  }));

  return `quietroommobileqa://quiet-room?ff=${flags}&voiceDiag=${diagnostic}`;
}

async function launchFixture(options = {}) {
  await launchQuietRoom({
    delete: true,
    url: lifecycleUrl(options),
  });
  await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  await waitFor(element(by.id(ids.openingMessage))).toExist().withTimeout(15000);
}

async function readLabel(elementHandle) {
  try {
    const attributes = await elementHandle.getAttributes();
    return attributes?.label || attributes?.text || '';
  } catch {
    return '';
  }
}

async function waitForLabel(elementHandle, expectedLabel, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if ((await readLabel(elementHandle)) === expectedLabel) {
      return;
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for voice label '${expectedLabel}' after ${timeoutMs}ms`);
}

function openingVoiceButton() {
  return element(by.label('Play voice')).atIndex(0);
}

async function readOpeningVoiceLabel() {
  for (const label of ['Pause voice', 'Starting voice...', 'Retry voice', 'Play voice']) {
    if (await waitForExistsMaybe(element(by.label(label)).atIndex(0), 100)) {
      return label;
    }
  }
  return '';
}

function voiceButtonForMessage(role, index) {
  return element(by.id(ids.message.voice(role, index)));
}

async function waitForVoiceStart(voiceButton, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const label = await readLabel(voiceButton);
    if (label === 'Pause voice') {
      return { result: 'started' };
    }
    if (label === 'Retry voice') {
      throw new Error('Unexpected interruption: fixture playback entered Retry voice before starting.');
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for voice playback to start after ${timeoutMs}ms`);
}

async function waitForVoiceCompletion(voiceButton, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let sawPlaying = false;

  while (Date.now() < deadline) {
    const label = await readLabel(voiceButton);
    if (label === 'Pause voice') {
      sawPlaying = true;
    } else if (label === 'Retry voice') {
      throw new Error(
        'Unexpected interruption: voice playback entered Retry voice without a deliberate user action.'
      );
    } else if (sawPlaying && label === 'Play voice') {
      return { result: 'native-ended' };
    }
    await delay(300);
  }

  throw new Error(
    `Unexpected interruption: voice playback did not reach Play voice after ${timeoutMs}ms.`
  );
}

async function waitForOpeningVoiceStart(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const label = await readOpeningVoiceLabel();
    if (label === 'Pause voice') {
      return { result: 'started' };
    }
    if (label === 'Retry voice') {
      throw new Error('Unexpected interruption: opening fixture playback entered Retry voice.');
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for opening voice playback to start after ${timeoutMs}ms`);
}

async function waitForOpeningVoiceCompletion(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let sawPlaying = false;

  while (Date.now() < deadline) {
    const label = await readOpeningVoiceLabel();
    if (label === 'Pause voice') {
      sawPlaying = true;
    } else if (label === 'Retry voice') {
      throw new Error(
        'Unexpected interruption: opening voice playback entered Retry voice without a deliberate user action.'
      );
    } else if (sawPlaying && label === 'Play voice') {
      return { result: 'native-ended' };
    }
    await delay(300);
  }

  throw new Error(
    `Unexpected interruption: opening voice playback did not reach Play voice after ${timeoutMs}ms.`
  );
}

async function deliberatelyPauseOpeningVoice() {
  await element(by.label('Play voice')).atIndex(0).tap();
  await waitForOpeningVoiceStart();
  await element(by.label('Pause voice')).atIndex(0).tap();
  await waitForLabel(element(by.label('Play voice')).atIndex(0), 'Play voice', 10000);
  return { result: 'deliberate-user-pause-and-restart' };
}

async function sendPrompt(text) {
  const composer = element(by.id(ids.composerInput));
  const sendButton = element(by.id(ids.sendButton));

  await composer.tap();
  await composer.replaceText(text);
  await sendButton.tap();
  await acceptAiConsentIfVisible();
  return sendButton;
}

async function waitForAssistantReply(assistantIndex, sendButton, timeoutMs = 90000) {
  const assistantMessage = element(by.id(ids.message.assistant(assistantIndex)));
  const deadline = Date.now() + timeoutMs;

  await waitFor(element(by.id(ids.message.user(assistantIndex - 1)))).toExist().withTimeout(30000);

  while (Date.now() < deadline) {
    const assistantExists = await waitForExistsMaybe(assistantMessage, 400);
    const sendLabel = await readLabel(sendButton);

    if (assistantExists && sendLabel === 'Send') {
      return assistantMessage;
    }
    await delay(300);
  }

  throw new Error(`Timed out waiting for assistant message ${assistantIndex} after ${timeoutMs}ms`);
}

async function revealInMessageList(elementHandle, timeoutMs = 20000) {
  const messageList = element(by.id(ids.messageList));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await waitFor(elementHandle).toBeVisible().withTimeout(1200);
      return;
    } catch {
      await messageList.swipe('up', 'fast', 0.45);
      await delay(400);
    }
  }

  throw new Error(`Timed out revealing lifecycle voice button after ${timeoutMs}ms`);
}

async function openAmbientAudioSelector() {
  await element(by.id(ids.modelMenuButton)).tap();
  await waitFor(element(by.id(ids.ambientAudioSelector))).toBeVisible().withTimeout(10000);
}

async function closeChatOptions() {
  await device.pressBack();
  await waitFor(element(by.id(ids.modelMenu))).not.toBeVisible().withTimeout(10000);
}

async function enableVoiceMode() {
  await element(by.id(ids.modelMenuButton)).tap();
  await waitFor(element(by.id(ids.modelMenuVoiceToggle))).toBeVisible().withTimeout(10000);
  await element(by.id(ids.modelMenuVoiceToggle)).tap();
  await closeChatOptions();
  await waitFor(element(by.id(ids.voiceModeIndicator))).toBeVisible().withTimeout(10000);
}

describe('QR-MOB-021 retained-fixture voice lifecycle batch', () => {
  it('completes uninterrupted playback, then replays the same retained fixture', async () => {
    for (let attempt = 1; attempt <= lifecycleAttempts; attempt += 1) {
      await launchFixture();
      const voiceButton = openingVoiceButton();

      await waitFor(voiceButton).toBeVisible().withTimeout(15000);
      await voiceButton.tap();
      await waitForOpeningVoiceCompletion();

      await element(by.label('Play voice')).atIndex(0).tap();
      await waitForOpeningVoiceCompletion();
    }
  });

  it('records deliberate pause/restart separately from unexpected interruption', async () => {
    for (let attempt = 1; attempt <= lifecycleAttempts; attempt += 1) {
      await launchFixture();
      const voiceButton = openingVoiceButton();

      await waitFor(voiceButton).toBeVisible().withTimeout(15000);
      const pauseResult = await deliberatelyPauseOpeningVoice();
      if (pauseResult.result !== 'deliberate-user-pause-and-restart') {
        throw new Error(`Expected deliberate pause/restart classification, got ${pauseResult.result}`);
      }

      await element(by.label('Play voice')).atIndex(0).tap();
      await waitForOpeningVoiceCompletion();
    }
  });

  it('keeps ambient enable/disable independent from voice completion', async () => {
    for (let attempt = 1; attempt <= lifecycleAttempts; attempt += 1) {
      await launchFixture({ ambientAudio: true });
      const voiceButton = openingVoiceButton();
      const ambientStatus = element(by.id(ids.ambientAudioStatus));

      await openAmbientAudioSelector();
      await waitFor(element(by.id(ids.ambientAudioOption('faint-chant'))))
        .toBeVisible()
        .withTimeout(10000);
      await element(by.id(ids.ambientAudioOption('faint-chant'))).tap();
      await waitFor(ambientStatus).toHaveText('Faint Chant playing').withTimeout(15000);
      await closeChatOptions();

      await element(by.label('Play voice')).atIndex(0).tap();
      await waitForOpeningVoiceStart();

      await openAmbientAudioSelector();
      await waitFor(element(by.id(ids.ambientAudioOption('off')))).toBeVisible().withTimeout(10000);
      await element(by.id(ids.ambientAudioOption('off'))).tap();
      await expect(ambientStatus).not.toExist();
      await closeChatOptions();
      await waitForOpeningVoiceCompletion();
    }
  });

  it('stops the first message when a second message claims playback', async () => {
    for (let attempt = 1; attempt <= lifecycleAttempts; attempt += 1) {
      await launchFixture();
      const sendButton = await sendPrompt('Reply in one short paragraph about a quiet room.');
      await waitForAssistantReply(1, sendButton);

      const firstVoiceButton = voiceButtonForMessage('assistant', 1);
      await revealInMessageList(firstVoiceButton);
      await firstVoiceButton.tap();
      await waitForVoiceStart(firstVoiceButton);

      const secondSendButton = await sendPrompt('Reply in one short paragraph about a candle.');
      await waitForAssistantReply(3, secondSendButton);
      const secondVoiceButton = voiceButtonForMessage('assistant', 3);
      await revealInMessageList(secondVoiceButton);
      await secondVoiceButton.tap();
      await waitForVoiceStart(secondVoiceButton);

      await waitForLabel(firstVoiceButton, 'Play voice', 10000);
      await waitForVoiceCompletion(secondVoiceButton);
    }
  });

  const automaticTest = runAutomaticVoiceMode ? it : it.skip;

  automaticTest('autoplays three completed replies without a scripted voice tap', async () => {
    await launchFixture({ voiceMode: true });
    await enableVoiceMode();
    const prompts = [
      'Give one short paragraph about silence in prayer.',
      'Give one short paragraph about a candle in a quiet room.',
      'Give one short paragraph about listening carefully.',
    ];

    for (const [attempt, prompt] of prompts.entries()) {
      const assistantIndex = attempt * 2 + 1;
      const sendButton = await sendPrompt(prompt);
      await waitForAssistantReply(assistantIndex, sendButton);

      const voiceButton = voiceButtonForMessage('assistant', assistantIndex);
      await revealInMessageList(voiceButton, 30000);
      await waitForVoiceStart(voiceButton, 30000);
      await waitForVoiceCompletion(voiceButton, 45000);
    }
  });
});
