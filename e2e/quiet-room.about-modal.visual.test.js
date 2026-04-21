const { launchQuietRoom } = require('./helpers');

describe('Quiet Room About modal privacy links', () => {
  beforeEach(async () => {
    await launchQuietRoom({
      featureFlags: {
        allowed_chat_models: ['gpt-5.1-chat-latest', 'gpt-5.3-chat-latest'],
        voice_mode_enabled: true,
      },
    });
    await waitFor(element(by.id('quiet-room.screen'))).toBeVisible().withTimeout(60000);
  });

  it('shows public resource links without build details', async () => {
    await element(by.id('quiet-room.about.open')).tap();
    await waitFor(element(by.id('quiet-room.about.title')))
      .toBeVisible()
      .withTimeout(5000);
    await expect(element(by.text('Build details'))).not.toExist();
    await expect(element(by.text('API base:'))).not.toExist();

    await new Promise((resolve) => setTimeout(resolve, 500));
    await device.takeScreenshot('about-modal-top');

    await element(by.id('quiet-room.about.body')).swipe('up', 'fast', 0.85);
    await element(by.id('quiet-room.about.body')).swipe('up', 'fast', 0.85);
    await element(by.id('quiet-room.about.body')).swipe('up', 'fast', 0.85);

    await expect(element(by.text('Privacy and account information'))).toBeVisible();
    await expect(element(by.id('quiet-room.about.privacy-link'))).toBeVisible();
    await expect(element(by.id('quiet-room.about.support-link'))).toBeVisible();
    await expect(element(by.id('quiet-room.about.account-deletion-link'))).toBeVisible();

    await device.takeScreenshot('about-modal-links');
  });
});
