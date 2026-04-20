const { launchQuietRoom, openLoginModal } = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(180000);

describe('Quiet Room iOS login compliance', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('shows Sign in with Apple on the iOS sign-in sheet', async () => {
    if (device.getPlatform() !== 'ios') {
      return;
    }

    await openLoginModal();

    await expect(element(by.id(ids.loginModal))).toBeVisible();
    await expect(element(by.id(ids.loginAppleButton))).toBeVisible();
    await expect(element(by.id(ids.loginEmailInput))).toBeVisible();
    await expect(element(by.id(ids.loginSigninButton))).toBeVisible();
  });
});
