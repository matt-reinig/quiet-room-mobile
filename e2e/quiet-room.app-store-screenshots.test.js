const {
  acceptAiConsentIfVisible,
  dismissIosPasswordSavePromptIfPresent,
  launchQuietRoom,
  loginWithKnownAccount,
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

    await delay(400);
  }

  throw new Error(`Timed out waiting for send button to reset after ${timeoutMs}ms`);
}

async function sendPublicPrompt(text) {
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

async function openFreshConversation() {
  await dismissIosPasswordSavePromptIfPresent();
  await delay(800);
  await element(by.id(ids.conversationsButton)).tap();
  await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);
  await element(by.text('+ New chat')).tap();
  const closed = await waitForPanelClosed(10000);
  if (!closed) {
    await element(by.id(ids.conversationsClose)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).not.toBeVisible().withTimeout(10000);
  }
}

async function waitForPanelClosed(timeoutMs) {
  try {
    await waitFor(element(by.id(ids.conversationsPanel))).not.toBeVisible().withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

describe('Quiet Room App Store screenshots', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await loginWithKnownAccount();
  });

  it('captures a normal conversation and conversation history', async () => {
    await openFreshConversation();

    const prompt = 'Help me slow down and pray before a busy day.';
    const sendButton = await sendPublicPrompt(prompt);
    await waitForSendReady(sendButton, 90000);
    await delay(1200);

    await device.takeScreenshot('qr-mob-028-normal-conversation');

    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);
    await delay(800);
    await device.takeScreenshot('qr-mob-028-conversations-history');
  });
});
