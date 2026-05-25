const { launchQuietRoom } = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(180000);

describe('Quiet Room message text selection', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('keeps assistant and user message text long-pressable without using action buttons', async () => {
    await element(by.id(ids.composerInput)).replaceText('selection smoke');
    await element(by.id(ids.sendButton)).tap();

    const userMessage = element(by.id(ids.message.user(0)));
    await waitFor(userMessage).toBeVisible().withTimeout(30000);
    await element(by.label('OK')).tap().catch(async () => {
      await element(by.text('OK')).tap().catch(() => null);
    });
    await waitFor(element(by.label('OK'))).not.toExist().withTimeout(5000).catch(() => null);
    await userMessage.longPress(1500);

    const openingMessage = element(by.id(ids.openingMessage));
    await waitFor(openingMessage).toBeVisible().withTimeout(30000);
    await openingMessage.longPress(1500);
  });
});
