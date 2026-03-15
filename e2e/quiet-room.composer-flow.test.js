const { expect: jestExpect } = require('@jest/globals');
const { launchQuietRoom } = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(180000);

function getFrame(attributes) {
  if (!attributes || !attributes.frame) {
    throw new Error(`Expected Detox attributes.frame, got: ${JSON.stringify(attributes)}`);
  }

  return attributes.frame;
}

async function waitForEnabled(elementHandle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const attributes = await elementHandle.getAttributes();
    if (attributes && attributes.enabled) {
      return attributes;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for enabled element after ${timeoutMs}ms`);
}

async function waitForExistsMaybe(elementHandle, timeoutMs) {
  try {
    await waitFor(elementHandle).toExist().withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

describe('Quiet Room composer flow', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('lifts the composer with the keyboard and allows a second send in the same chat', async () => {
    const composer = element(by.id(ids.composerInput));
    const sendButton = element(by.id(ids.sendButton));

    const initialComposerFrame = getFrame(await composer.getAttributes());

    await composer.tap();
    await composer.replaceText('first mobile followup');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const focusedComposerFrame = getFrame(await composer.getAttributes());
    console.log('composer-frames', JSON.stringify({ initialComposerFrame, focusedComposerFrame }));
    jestExpect(focusedComposerFrame.y).toBeLessThan(initialComposerFrame.y - 80);

    await sendButton.tap();
    const firstUserMessage = element(by.id(ids.message.user(0)));
    await waitFor(firstUserMessage).toBeVisible().withTimeout(30000);

    await waitForEnabled(sendButton, 90000);

    await composer.tap();
    await composer.replaceText('second mobile followup');
    await waitForEnabled(sendButton, 10000);
    await sendButton.tap();
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const composerAfterSecondTap = await composer.getAttributes();
    const sendAfterSecondTap = await sendButton.getAttributes();
    const secondUserMessage = element(by.id(ids.message.user(2)));
    const secondExists = await waitForExistsMaybe(secondUserMessage, 10000);

    console.log('second-send-state', JSON.stringify({
      composerAfterSecondTap,
      sendAfterSecondTap,
      secondExists,
    }));

    jestExpect(secondExists).toBe(true);
    await waitFor(secondUserMessage).toBeVisible().withTimeout(15000);
  });
});
