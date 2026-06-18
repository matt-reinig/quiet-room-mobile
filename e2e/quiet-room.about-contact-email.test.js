const { launchQuietRoom } = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(120000);

describe('Quiet Room About contact email', () => {
  beforeEach(async () => {
    await launchQuietRoom({
      featureFlags: {
        allowed_chat_models: ['gpt-5.1-chat-latest', 'gpt-5.3-chat-latest'],
        voice_mode_enabled: true,
      },
    });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('shows the Quiet Room support mailbox', async () => {
    await element(by.id('quiet-room.about.open')).tap();
    await waitFor(element(by.id('quiet-room.about.title')))
      .toBeVisible()
      .withTimeout(5000);

    await waitFor(element(by.text('Email: Quietroomapp@gmail.com')))
      .toBeVisible()
      .whileElement(by.id('quiet-room.about.body'))
      .scroll(220, 'down');
  });
});
