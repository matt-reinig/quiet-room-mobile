const { expect: jestExpect } = require('@jest/globals');
const {
  createDisposableTestUser,
  launchQuietRoom,
  loginWithEmailCredentials,
  waitForUserConsentState,
  waitForExistsMaybe,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

describe('Quiet Room AI consent', () => {
  beforeEach(async () => {
    await launchQuietRoom({ delete: true });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('blocks the first send until consent is accepted', async () => {
    await element(by.id(ids.composerInput)).replaceText('consent block smoke');
    await element(by.id(ids.sendButton)).tap();

    await waitFor(element(by.id(ids.aiConsentModal))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('Before you continue'))).toBeVisible();

    const blockedMessage = element(by.id(ids.message.user(0)));
    const blockedMessageVisible = await waitForExistsMaybe(blockedMessage, 2000);
    jestExpect(blockedMessageVisible).toBe(false);
  });

  it('accepting consent resumes the pending send', async () => {
    await element(by.id(ids.composerInput)).replaceText('consent accept smoke');
    await element(by.id(ids.sendButton)).tap();

    await waitFor(element(by.id(ids.aiConsentModal))).toBeVisible().withTimeout(10000);
    await element(by.id(ids.aiConsentAcceptButton)).tap();

    await waitFor(element(by.id(ids.aiConsentModal))).not.toExist().withTimeout(10000);
    await waitFor(element(by.id(ids.message.user(0)))).toBeVisible().withTimeout(30000);
    await waitFor(element(by.id(ids.message.assistant(1)))).toExist().withTimeout(90000);
  });

  it('persists consent across a cold relaunch', async () => {
    await element(by.id(ids.composerInput)).replaceText('consent persistence first send');
    await element(by.id(ids.sendButton)).tap();
    await waitFor(element(by.id(ids.aiConsentModal))).toBeVisible().withTimeout(10000);
    await element(by.id(ids.aiConsentAcceptButton)).tap();

    await waitFor(element(by.id(ids.message.user(0)))).toBeVisible().withTimeout(30000);
    await waitFor(element(by.id(ids.message.assistant(1)))).toExist().withTimeout(90000);

    await device.terminateApp();
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);

    await element(by.id(ids.composerInput)).replaceText('consent persistence second send');
    await element(by.id(ids.sendButton)).tap();

    await waitFor(element(by.id(ids.aiConsentModal))).not.toExist().withTimeout(2000);

    const anyUserMessage = element(by.id(/^quiet-room\.message\.user\.\d+$/)).atIndex(0);
    await waitFor(anyUserMessage).toExist().withTimeout(30000);
  });

  it('persists accepted consent to the backend for signed-in users', async () => {
    const credentials = await createDisposableTestUser();
    await loginWithEmailCredentials(credentials);

    await element(by.id(ids.composerInput)).replaceText('authenticated consent persistence');
    await element(by.id(ids.sendButton)).tap();

    await waitFor(element(by.id(ids.aiConsentModal))).toBeVisible().withTimeout(10000);
    await element(by.id(ids.aiConsentAcceptButton)).tap();

    await waitFor(element(by.id(ids.aiConsentModal))).not.toExist().withTimeout(10000);
    await waitFor(element(by.id(ids.message.user(0)))).toBeVisible().withTimeout(30000);

    const userData = await waitForUserConsentState({
      uid: credentials.uid,
      aiSharingAccepted: true,
      timeoutMs: 10000,
    });
    jestExpect(userData.consentState.source).toBe('quiet-room-mobile');
  });
});
