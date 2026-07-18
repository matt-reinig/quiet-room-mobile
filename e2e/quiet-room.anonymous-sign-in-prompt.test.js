const {
  acceptAiConsentIfVisible,
  ensureGuestSession,
  launchQuietRoom,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

describe('Quiet Room anonymous sign-in prompt', () => {
  it('offers sign in after the guest sends their first message', async () => {
    await launchQuietRoom({ delete: true });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await ensureGuestSession();

    await expect(element(by.id(ids.anonymousSignInPrompt))).not.toExist();

    const composer = element(by.id(ids.composerInput));
    await composer.tap();
    await composer.replaceText(`anonymous sign-in prompt ${Date.now()}`);
    await element(by.id(ids.sendButton)).tap();
    await acceptAiConsentIfVisible();

    await waitFor(element(by.id(ids.message.user(0)))).toExist().withTimeout(30000);
    await waitFor(element(by.id(ids.anonymousSignInPrompt))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('To start another conversation, please sign in.'))).toBeVisible();
    await device.takeScreenshot('anonymous-sign-in-prompt-visible');

    await element(by.id(ids.anonymousSignInPromptButton)).tap();
    await waitFor(element(by.id(ids.loginModal))).toBeVisible().withTimeout(10000);
  });
});
