const {
  acceptAiConsentIfVisible,
  launchQuietRoom,
  waitForExistsMaybe,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(300000);

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLabel(elementHandle) {
  const attributes = await elementHandle.getAttributes();
  return attributes?.label || attributes?.text || '';
}

async function sendPrompt(text) {
  const composer = element(by.id(ids.composerInput));
  const composerExpand = element(by.id(ids.composerExpand));
  const fullscreenComposer = element(by.id(ids.composerFullscreenInput));
  const fullscreenSendButton = element(by.id(ids.fullscreenSendButton));
  const sendButton = element(by.id(ids.sendButton));

  if (device.getPlatform() === 'ios' && (await waitForExistsMaybe(composerExpand, 1500))) {
    await composerExpand.tap();
    await waitFor(fullscreenComposer).toBeVisible().withTimeout(10000);
    await fullscreenComposer.replaceText(text);
    await fullscreenSendButton.tap();
    await acceptAiConsentIfVisible();
    return sendButton;
  }

  await composer.tap();
  await composer.replaceText(text);
  await sendButton.tap();
  await acceptAiConsentIfVisible();
  return sendButton;
}

async function waitForAssistantReply(userIndex, assistantIndex, sendButton) {
  const userMessage = element(by.id(ids.message.user(userIndex)));
  const assistantMessage = element(by.id(ids.message.assistant(assistantIndex)));
  const deadline = Date.now() + 120000;

  await waitFor(userMessage).toExist().withTimeout(30000);

  while (Date.now() < deadline) {
    const assistantExists = await waitForExistsMaybe(assistantMessage, 400);
    if (assistantExists && (await readLabel(sendButton)) === 'Send') {
      return;
    }
    await delay(300);
  }

  throw new Error('Timed out waiting for the assistant reply.');
}

describe('Quiet Room anonymous continuity', () => {
  it('restores the newest guest conversation across three cold relaunches', async () => {
    await launchQuietRoom({ delete: true });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await acceptAiConsentIfVisible();

    let prompt = `anonymous continuity first ${Date.now()}`;
    let userIndex = 0;
    let assistantIndex = 1;

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const sendButton = await sendPrompt(prompt);
      await waitForAssistantReply(userIndex, assistantIndex, sendButton);

      await device.terminateApp();
      await launchQuietRoom();
      await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
      await waitFor(element(by.text(prompt))).toExist().withTimeout(60000);
      await waitFor(element(by.id(ids.message.assistant(assistantIndex)))).toExist().withTimeout(60000);

      prompt = `anonymous continuity cycle ${cycle + 2} ${Date.now()}`;
      userIndex += 2;
      assistantIndex += 2;
    }
  });
});
