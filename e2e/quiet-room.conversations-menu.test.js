const { launchQuietRoom, loginWithKnownAccount } = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

function makePrompt(tag) {
  return 'detox-conversation-' + tag + '-' + Date.now();
}

async function waitForSendReady(sendButton) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const attributes = await sendButton.getAttributes();
    const label = attributes?.label || attributes?.text;
    if (label === 'Send') {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for send button to become ready again.');
}

async function sendPrompt(text) {
  const composer = element(by.id(ids.composerInput));
  const sendButton = element(by.id(ids.sendButton));

  await composer.tap();
  await composer.replaceText(text);
  await sendButton.tap();
  await waitFor(element(by.text(text))).toBeVisible().withTimeout(30000);
  await waitForSendReady(sendButton);
}

describe('Quiet Room conversations drawer menu', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await loginWithKnownAccount();
  });

  it('shows the full conversation action menu above neighboring rows', async () => {
    await sendPrompt(makePrompt('one'));

    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);
    await element(by.id(ids.conversationsNew)).tap();

    await sendPrompt(makePrompt('two'));

    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);
    await element(by.label('Conversation options')).atIndex(0).tap();

    await waitFor(element(by.text('Rename'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.text('Delete'))).toBeVisible().withTimeout(10000);
  });
});
