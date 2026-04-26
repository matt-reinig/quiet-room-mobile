const {
  acceptAiConsentIfVisible,
  dismissIosPasswordSavePromptIfPresent,
  launchQuietRoom,
  loginWithKnownAccount,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

function makePrompt(tag) {
  return 'detox-conversation-' + tag + '-' + Date.now();
}

async function waitForExistsMaybe(elementHandle, timeoutMs) {
  try {
    await waitFor(elementHandle).toExist().withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function waitForSendReady(sendButton) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const attributes = await sendButton.getAttributes();
    const label = attributes?.label || attributes?.text;
    if (label === 'Send') {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for send button to become ready again.');
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
    } else {
      await composer.tap();
      await composer.replaceText(text);
      await sendButton.tap();
      await acceptAiConsentIfVisible();
    }
  } else {
    await composer.tap();
    await composer.replaceText(text);
    await sendButton.tap();
    await acceptAiConsentIfVisible();
  }

  await waitFor(element(by.text(text))).toBeVisible().withTimeout(30000);
  await waitForSendReady(sendButton);
}

async function closeConversationsPanelIfNeeded() {
  const panel = element(by.id(ids.conversationsPanel));
  const closeButton = element(by.id(ids.conversationsClose));

  try {
    await waitFor(panel).not.toBeVisible().withTimeout(4000);
  } catch {
    await closeButton.tap();
    await waitFor(panel).not.toBeVisible().withTimeout(10000);
  }
}

function firstConversationMenuButton() {
  return element(by.id(/^quiet-room\.conversation\..*\.menu$/)).atIndex(0);
}

describe('Quiet Room conversations drawer menu', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await loginWithKnownAccount();
  });

  it('shows the full conversation action menu above neighboring rows', async () => {
    await sendPrompt(makePrompt('one'));

    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);
    await element(by.id(ids.conversationsNew)).tap();
    await closeConversationsPanelIfNeeded();

    await sendPrompt(makePrompt('two'));

    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);
    await waitFor(firstConversationMenuButton()).toBeVisible().withTimeout(10000);
    await firstConversationMenuButton().tap();

    await waitFor(element(by.text('Rename'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.text('Delete'))).toBeVisible().withTimeout(10000);

    await element(by.text('Rename')).tap();
    await waitFor(element(by.id(ids.conversationsRenameInput))).toBeVisible().withTimeout(10000);
  });
});
