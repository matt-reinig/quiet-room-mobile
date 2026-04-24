const {
  acceptAiConsentIfVisible,
  dismissIosPasswordSavePromptIfPresent,
  launchQuietRoom,
  waitForExistsMaybe,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

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
    const label = await readLabel(sendButton);
    if (label === 'Send') {
      return;
    }

    await delay(300);
  }

  throw new Error(`Timed out waiting for send button to reset after ${timeoutMs}ms`);
}

async function sendPrompt(text) {
  const composer = element(by.id(ids.composerInput));
  const composerExpand = element(by.id(ids.composerExpand));
  const fullscreenComposer = element(by.id(ids.composerFullscreenInput));
  const fullscreenSendButton = element(by.id(ids.fullscreenSendButton));
  const sendButton = element(by.id(ids.sendButton));

  if (device.getPlatform() === 'ios') {
    await dismissIosPasswordSavePromptIfPresent();
    const hasFullscreenComposer = await waitForExistsMaybe(composerExpand, 1500);

    if (hasFullscreenComposer) {
      await composerExpand.tap();
      await waitFor(fullscreenComposer).toBeVisible().withTimeout(10000);
      await fullscreenComposer.replaceText(text);
      await fullscreenSendButton.tap();
      await acceptAiConsentIfVisible();
      return sendButton;
    }
  }

  await composer.tap();
  await composer.replaceText(text);
  await sendButton.tap();
  await acceptAiConsentIfVisible();
  return sendButton;
}

async function waitForAssistantReply(userIndex, assistantIndex, sendButton, timeoutMs) {
  const userMessage = element(by.id(ids.message.user(userIndex)));
  const assistantMessage = element(by.id(ids.message.assistant(assistantIndex)));
  const deadline = Date.now() + timeoutMs;

  await waitFor(userMessage).toExist().withTimeout(30000);

  while (Date.now() < deadline) {
    const assistantExists = await waitForExistsMaybe(assistantMessage, 400);
    const sendLabel = await readLabel(sendButton);

    if (assistantExists && sendLabel === 'Send') {
      return assistantMessage;
    }

    await delay(300);
  }

  throw new Error(`Timed out waiting for assistant reply after ${timeoutMs}ms`);
}

describe('Quiet Room response smoke', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('launches and completes one basic prompt/response flow', async () => {
    await expect(element(by.id(ids.header))).toBeVisible();
    await expect(element(by.id(ids.messageList))).toBeVisible();
    await expect(element(by.id(ids.openingMessage))).toBeVisible();

    if (device.getPlatform() === 'ios') {
      await expect(element(by.id(ids.promptCuesToggle))).toBeVisible();
      await expect(element(by.id(ids.composerInput))).toExist();
    } else {
      await expect(element(by.id(ids.composerInput))).toBeVisible();
    }

    const prompt = `detox response smoke ${Date.now()}`;
    const sendButton = await sendPrompt(prompt);
    const assistantMessage = await waitForAssistantReply(0, 1, sendButton, 90000);

    await expect(assistantMessage).toExist();

    await waitForSendReady(sendButton, 90000);
  });
});
