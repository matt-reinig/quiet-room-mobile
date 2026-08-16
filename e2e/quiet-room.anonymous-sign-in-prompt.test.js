const {
  acceptAiConsentIfVisible,
  ensureGuestSession,
  launchQuietRoom,
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

async function waitForAssistantReply(sendButton) {
  const assistantMessage = element(by.id(ids.message.assistant(1)));
  const deadline = Date.now() + 120000;

  while (Date.now() < deadline) {
    const assistantAttributes = await assistantMessage.getAttributes().catch(() => null);
    if (assistantAttributes && (await readLabel(sendButton)) === 'Send') {
      return;
    }
    await delay(300);
  }

  throw new Error('Timed out waiting for the first assistant response to finish.');
}

describe('Quiet Room anonymous sign-in prompt', () => {
  it('offers sign in after the guest sends their first message', async () => {
    await launchQuietRoom({ delete: true });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await ensureGuestSession();

    await expect(element(by.id(ids.anonymousSignInPrompt))).not.toExist();

    const composer = element(by.id(ids.composerInput));
    await composer.tap();
    await composer.replaceText(`anonymous sign-in prompt ${Date.now()}`);
    const sendButton = element(by.id(ids.sendButton));
    await sendButton.tap();
    await acceptAiConsentIfVisible();

    await waitFor(element(by.id(ids.message.user(0)))).toExist().withTimeout(30000);
    await waitFor(element(by.id(ids.anonymousSignInPrompt))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('Sign in to start one.'))).toBeVisible();
    await device.takeScreenshot('anonymous-sign-in-prompt-pinned-visible');

    await waitForAssistantReply(sendButton);
    await device.takeScreenshot('anonymous-sign-in-prompt-pinned-after-response');

    await element(by.id(ids.anonymousSignInPromptButton)).tap();
    await waitFor(element(by.id(ids.loginModal))).toBeVisible().withTimeout(10000);
  });

  it('keeps the prompt dismissed for the same guest after relaunch', async () => {
    await launchQuietRoom({ delete: true });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await ensureGuestSession();

    const prompt = `anonymous dismiss prompt ${Date.now()}`;
    const composer = element(by.id(ids.composerInput));
    const sendButton = element(by.id(ids.sendButton));
    await composer.tap();
    await composer.replaceText(prompt);
    await sendButton.tap();
    await acceptAiConsentIfVisible();

    await waitFor(element(by.id(ids.anonymousSignInPrompt))).toBeVisible().withTimeout(10000);
    await waitForAssistantReply(sendButton);
    await element(by.id(ids.anonymousSignInPromptDismiss)).tap();
    await waitFor(element(by.id(ids.anonymousSignInPrompt))).not.toExist().withTimeout(10000);

    await device.terminateApp();
    await launchQuietRoom();
    await waitFor(element(by.text(prompt))).toExist().withTimeout(60000);
    await expect(element(by.id(ids.anonymousSignInPrompt))).not.toExist();
  });
});
