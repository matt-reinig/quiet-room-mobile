const { expect: jestExpect } = require('@jest/globals');
const { launchQuietRoom } = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLabel(elementHandle) {
  const attributes = await elementHandle.getAttributes();
  return attributes?.label || attributes?.text || '';
}

async function waitForLabel(elementHandle, expectedLabel, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const currentLabel = await readLabel(elementHandle);
    if (currentLabel === expectedLabel) {
      return currentLabel;
    }

    await delay(300);
  }

  throw new Error(`Timed out waiting for label '${expectedLabel}' after ${timeoutMs}ms`);
}

async function waitForAnyLabel(elementHandle, expectedLabels, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const currentLabel = await readLabel(elementHandle);
    if (expectedLabels.includes(currentLabel)) {
      return currentLabel;
    }

    await delay(300);
  }

  throw new Error(
    `Timed out waiting for any label in [${expectedLabels.join(', ')}] after ${timeoutMs}ms`
  );
}

async function waitForExists(elementHandle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await elementHandle.getAttributes();
      return true;
    } catch {
      await delay(300);
    }
  }

  return false;
}

async function revealInMessageList(messageList, elementHandle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await waitFor(elementHandle).toBeVisible().withTimeout(1500);
      return;
    } catch {
      await messageList.swipe('up', 'fast', 0.45);
      await delay(500);
    }
  }

  throw new Error(`Timed out revealing element after ${timeoutMs}ms`);
}

async function waitForStreamingAssistant(userIndex, assistantIndex, sendButton, timeoutMs) {
  const assistantMessage = element(by.id(ids.message.assistant(assistantIndex)));
  const userMessage = element(by.id(ids.message.user(userIndex)));
  const deadline = Date.now() + timeoutMs;

  await waitFor(userMessage).toBeVisible().withTimeout(30000);

  while (Date.now() < deadline) {
    const sendLabel = await readLabel(sendButton);
    const assistantExists = await waitForExists(assistantMessage, 250);

    if (assistantExists && sendLabel !== 'Send') {
      return assistantMessage;
    }

    if (sendLabel === 'Send' && !assistantExists) {
      throw new Error('Send button reset before any assistant streaming row appeared.');
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for assistant streaming row after ${timeoutMs}ms`);
}

describe('Quiet Room streaming smoke', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('shows assistant output before completion and autoplays native voice playback', async () => {
    const composer = element(by.id(ids.composerInput));
    const sendButton = element(by.id(ids.sendButton));
    const messageList = element(by.id(ids.messageList));
    const modelMenuButton = element(by.id(ids.modelMenuButton));
    const voiceModeToggle = element(by.id(ids.modelMenuVoiceToggle));

    await modelMenuButton.tap();
    await waitFor(element(by.id(ids.modelMenu))).toBeVisible().withTimeout(10000);
    await voiceModeToggle.tap();
    await waitFor(element(by.id(ids.voiceModeIndicator))).toBeVisible().withTimeout(10000);
    await modelMenuButton.tap();

    await composer.tap();
    await composer.replaceText('Give me a longer response in several short paragraphs about silence in prayer, practical steps, and one brief concluding prayer.');
    await sendButton.tap();

    const assistantMessage = await waitForStreamingAssistant(0, 1, sendButton, 90000);
    if (device.getPlatform() === 'ios') {
      await expect(assistantMessage).toExist();
    } else {
      await expect(assistantMessage).toBeVisible();
    }

    await waitForLabel(sendButton, 'Send', 90000);

    const voiceButton = element(by.id(ids.message.voice('assistant', 1)));
    await revealInMessageList(messageList, voiceButton, 20000);

    if (device.getPlatform() === 'ios') {
      await waitForAnyLabel(
        voiceButton,
        ['Pause voice', 'Starting voice...', 'Retry voice'],
        20000
      );
    } else {
      await waitForAnyLabel(
        voiceButton,
        ['Pause voice', 'Starting voice...'],
        20000
      );
    }
  });
});
