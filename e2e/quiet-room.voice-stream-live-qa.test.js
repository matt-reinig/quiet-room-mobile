const {
  acceptAiConsentIfVisible,
  launchQuietRoom,
  loginWithKnownAccount,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(360000);

const appScheme = process.env.E2E_APP_SCHEME || 'quietroommobileqa';
const diagnosticMode = process.env.VOICE_DIAGNOSTIC_MODE || 'live-trace';
const proxyBaseUrl = process.env.VOICE_DIAGNOSTIC_PROXY_BASE_URL || '';

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

async function startFreshChat() {
  const panel = element(by.id(ids.conversationsPanel));
  await element(by.id(ids.conversationsButton)).tap();
  await waitFor(panel).toBeVisible().withTimeout(10000);
  await element(by.id(ids.conversationsNew)).tap();

  try {
    await waitFor(panel).not.toBeVisible().withTimeout(5000);
  } catch {
    await element(by.id(ids.conversationsClose)).tap().catch(() => null);
  }
  await waitFor(element(by.id(ids.openingMessage))).toExist().withTimeout(15000);
}

async function sendSyntheticPrompt() {
  const composer = element(by.id(ids.composerInput));
  const sendButton = element(by.id(ids.sendButton));
  const prompt =
    'For this QA audio diagnostic, write one representative short paragraph about quiet prayer. ' +
    'End the response with these exact final words: copper meadow nine.';

  await composer.tap();
  await composer.replaceText(prompt);
  await sendButton.tap();
  await acceptAiConsentIfVisible();
  await waitFor(element(by.id(ids.message.user(0)))).toExist().withTimeout(30000);
  await waitFor(element(by.id(ids.message.assistant(1)))).toExist().withTimeout(120000);
  await waitForSendReady(sendButton, 120000);
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
  let started = false;

  while (Date.now() < deadline) {
    const label = await readLabel(voiceButton);
    if (label === 'Pause voice' || label === 'Starting voice...') {
      started = true;
    }
    if (started && label === 'Play voice') {
      return;
    }
    if (label === 'Retry voice') {
      throw new Error('QA voice playback entered Retry voice before native completion.');
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for QA voice playback to end after ${timeoutMs}ms`);
}

describe('QR-MOB-021 real QA TrackPlayer stream diagnostics', () => {
  it('captures one authenticated saved-message TTS stream with a distinctive ending', async () => {
    await launchQuietRoom({ delete: true, url: diagnosticUrl() });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await loginWithKnownAccount();
    await startFreshChat();
    await sendSyntheticPrompt();

    const voiceButton = await revealVoiceButton(30000);
    await voiceButton.tap();
    await waitForPlaybackEnd(voiceButton, 180000);
  });
});
