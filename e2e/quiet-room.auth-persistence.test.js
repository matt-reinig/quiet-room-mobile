const { launchQuietRoom, loginWithKnownAccount } = require('./helpers');
const ids = require('./testIds');

describe('Quiet Room auth persistence', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.header))).toBeVisible().withTimeout(60000);
  });

  it('keeps an email/password user signed in after a cold relaunch', async () => {
    await loginWithKnownAccount();
    await expect(element(by.id(ids.conversationsButton))).toExist();

    await device.terminateApp();
    await launchQuietRoom();
    await waitFor(element(by.id(ids.header))).toBeVisible().withTimeout(60000);
    await waitFor(element(by.id(ids.profileButton))).toExist().withTimeout(10000);
    await element(by.id(ids.profileButton)).tap();
    await waitFor(element(by.text('Logout'))).toExist().withTimeout(10000);
  });
});
