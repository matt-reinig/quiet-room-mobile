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
    await expect(element(by.id(ids.composerInput))).toBeVisible();
    await expect(element(by.id(ids.sendButton))).toBeVisible();
  });
});
