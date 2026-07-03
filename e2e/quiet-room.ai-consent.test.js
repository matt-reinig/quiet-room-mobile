const { expect: jestExpect } = require('@jest/globals');
const {
  acceptAiConsentIfVisible,
  dismissIosPasswordSavePromptIfPresent,
  launchQuietRoom,
  loginWithKnownAccount,
  waitForExistsMaybe,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

async function sendPrompt(text) {
  await element(by.id(ids.composerInput)).replaceText(text);
  await element(by.id(ids.sendButton)).tap();
}

async function waitForAnyUserMessage(timeoutMs = 30000) {
  const anyUserMessage = element(by.id(/^quiet-room\.message\.user\.\d+$/)).atIndex(0);
  await waitFor(anyUserMessage).toExist().withTimeout(timeoutMs);
  return anyUserMessage;
}

describe('Quiet Room AI consent', () => {
  beforeEach(async () => {
    await launchQuietRoom({ delete: true });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('blocks the first send until consent is accepted', async () => {
    await sendPrompt('consent block smoke');

    await waitFor(element(by.id(ids.aiConsentModal))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('Before you continue'))).toBeVisible();

    const blockedMessage = element(by.id(ids.message.user(0)));
    const blockedMessageVisible = await waitForExistsMaybe(blockedMessage, 2000);
    jestExpect(blockedMessageVisible).toBe(false);
  });

  it('accepting consent resumes the pending send', async () => {
    await sendPrompt('consent accept smoke');

    await waitFor(element(by.id(ids.aiConsentModal))).toBeVisible().withTimeout(10000);
    jestExpect(await acceptAiConsentIfVisible(10000)).toBe(true);
    await waitFor(element(by.id(ids.message.user(0)))).toBeVisible().withTimeout(30000);
    await waitFor(element(by.id(ids.message.assistant(1)))).toExist().withTimeout(90000);
  });

  it('persists consent across a cold relaunch', async () => {
    await sendPrompt('consent persistence first send');
    await waitFor(element(by.id(ids.aiConsentModal))).toBeVisible().withTimeout(10000);
    jestExpect(await acceptAiConsentIfVisible(10000)).toBe(true);

    await waitFor(element(by.id(ids.message.user(0)))).toBeVisible().withTimeout(30000);
    await waitFor(element(by.id(ids.message.assistant(1)))).toExist().withTimeout(90000);

    await device.terminateApp();
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);

    await sendPrompt('consent persistence second send');

    await waitFor(element(by.id(ids.aiConsentModal))).not.toExist().withTimeout(2000);

    await waitForAnyUserMessage();
  });

  it('uses the reusable known account for hosted signed-in consent smoke', async () => {
    const credentials = await loginWithKnownAccount();

    await device.terminateApp();
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await waitFor(element(by.id(ids.conversationsButton))).toExist().withTimeout(60000);
    await dismissIosPasswordSavePromptIfPresent();

    await sendPrompt('known account consent smoke first send');
    const sawConsentModal = await acceptAiConsentIfVisible(4000);
    await waitForAnyUserMessage();

    await device.terminateApp();
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);

    await dismissIosPasswordSavePromptIfPresent(3000);
    await sendPrompt('known account consent smoke second send');
    await waitFor(element(by.id(ids.aiConsentModal))).not.toExist().withTimeout(2000);
    await waitForAnyUserMessage();

    console.log('known-account-ai-consent-smoke', JSON.stringify({
      email: credentials.email,
      platform: device.getPlatform(),
      sawConsentModal,
      testHookUsed: false,
    }));
  });
});
