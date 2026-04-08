const { launchQuietRoom } = require('./helpers');
const ids = require('./testIds');

describe('Quiet Room smoke', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('shows the main shell', async () => {
    await expect(element(by.id(ids.header))).toBeVisible();
    await expect(element(by.id(ids.messageList))).toBeVisible();
    await expect(element(by.id(ids.openingMessage))).toBeVisible();

    if (device.getPlatform() === 'ios') {
      // The Expo dev client can show a bottom warning banner that partially covers
      // the composer during simulator runs even though the shell has loaded.
      await expect(element(by.id(ids.promptCuesToggle))).toBeVisible();
      await expect(element(by.id(ids.composerInput))).toExist();
      await expect(element(by.id(ids.sendButton))).toExist();
      return;
    }

    await expect(element(by.id(ids.composerInput))).toBeVisible();
    await expect(element(by.id(ids.sendButton))).toBeVisible();
  });
});
