const {
  getE2ECredentials,
  launchQuietRoom,
  loginWithKnownAccount,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Quiet Room known-account login', () => {
  it('signs in with the reusable known account', async () => {
    await launchQuietRoom({
      delete: process.env.LOGIN_DELETE_APP_DATA !== '0',
    });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);

    const credentials = await loginWithKnownAccount();

    await waitFor(element(by.id(ids.conversationsButton))).toBeVisible().withTimeout(60000);
    await device.takeScreenshot(`known-account-login-${device.getPlatform()}`);

    console.log('known-account-login', JSON.stringify({
      email: credentials.email || getE2ECredentials().email,
      platform: device.getPlatform(),
    }));

    const pauseMs = Number(process.env.LOGIN_VISUAL_PAUSE_MS || 0);
    if (pauseMs > 0) {
      await delay(pauseMs);
    }
  });
});
