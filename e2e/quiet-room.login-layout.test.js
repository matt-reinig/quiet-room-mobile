const { expect: jestExpect } = require('@jest/globals');
const { launchQuietRoom, openLoginModal } = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(180000);

function getFrame(attributes) {
  if (!attributes || !attributes.frame) {
    throw new Error('Expected Detox attributes.frame, got: ' + JSON.stringify(attributes));
  }

  return attributes.frame;
}

describe('Quiet Room login modal layout', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('lifts the login sheet enough to keep the auth form usable above the keyboard', async () => {
    await openLoginModal();

    const modal = element(by.id(ids.loginModal));
    const emailInput = element(by.id(ids.loginEmailInput));
    const passwordInput = element(by.id(ids.loginPasswordInput));
    const signInButton = element(by.id(ids.loginSigninButton));

    await expect(emailInput).toBeVisible();
    await expect(signInButton).toBeVisible();

    const initialModalFrame = getFrame(await modal.getAttributes());
    const initialEmailFrame = getFrame(await emailInput.getAttributes());

    await emailInput.tap();
    await emailInput.replaceText('layout-check@example.com');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const focusedModalFrame = getFrame(await modal.getAttributes());
    const focusedEmailFrame = getFrame(await emailInput.getAttributes());
    const signInAttributes = await signInButton.getAttributes();
    const modalBottom = focusedModalFrame.y + focusedModalFrame.height;

    console.log('login-modal-frames', JSON.stringify({
      initialModalFrame,
      focusedModalFrame,
      initialEmailFrame,
      focusedEmailFrame,
      signInAttributes,
      modalBottom,
    }));

    jestExpect(focusedEmailFrame.y).toBeGreaterThan(initialEmailFrame.y);
    jestExpect(modalBottom).toBeLessThan(1820);
    await expect(passwordInput).toBeVisible();
    await expect(signInButton).toBeVisible();
  });
});
