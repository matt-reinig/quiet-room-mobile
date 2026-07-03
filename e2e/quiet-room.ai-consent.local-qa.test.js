const { expect: jestExpect } = require('@jest/globals');
const {
  acceptAiConsentIfVisible,
  createDisposableTestUser,
  launchQuietRoom,
  loginWithEmailCredentials,
  waitForUserConsentState,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

const describeWithTestHooks = process.env.E2E_ENABLE_TEST_HOOKS === '1' ? describe : describe.skip;

async function sendPrompt(text) {
  await element(by.id(ids.composerInput)).replaceText(text);
  await element(by.id(ids.sendButton)).tap();
}

describeWithTestHooks('Quiet Room AI consent local-QA hooks', () => {
  beforeEach(async () => {
    await launchQuietRoom({ delete: true });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('persists accepted consent to the backend for disposable signed-in users', async () => {
    const credentials = await createDisposableTestUser();
    await loginWithEmailCredentials(credentials);

    await sendPrompt('authenticated consent persistence');

    await waitFor(element(by.id(ids.aiConsentModal))).toBeVisible().withTimeout(10000);
    jestExpect(await acceptAiConsentIfVisible(10000)).toBe(true);
    await waitFor(element(by.id(ids.message.user(0)))).toBeVisible().withTimeout(30000);

    const userData = await waitForUserConsentState({
      uid: credentials.uid,
      aiSharingAccepted: true,
      timeoutMs: 10000,
    });
    jestExpect(userData.consentState.source).toBe('quiet-room-mobile');
  });
});
