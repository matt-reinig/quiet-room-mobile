const { expect: jestExpect } = require('@jest/globals');
const { launchQuietRoom } = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(180000);

function getFrame(attributes) {
  if (!attributes || !attributes.frame) {
    throw new Error('Expected Detox attributes.frame, got: ' + JSON.stringify(attributes));
  }

  return attributes.frame;
}

function getFrameY(attributes) {
  const frame = getFrame(attributes);
  if (typeof frame.y !== 'number') {
    throw new Error('Expected Detox attributes.frame.y, got: ' + JSON.stringify(attributes));
  }

  return frame.y;
}

async function sampleY(elementHandle, durationMs, intervalMs = 250) {
  const deadline = Date.now() + durationMs;
  const samples = [];

  while (Date.now() < deadline) {
    samples.push(getFrameY(await elementHandle.getAttributes()));
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  samples.push(getFrameY(await elementHandle.getAttributes()));
  return samples;
}

async function waitForVisibleMaybe(elementHandle, timeoutMs) {
  try {
    await waitFor(elementHandle).toBeVisible().withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

describe('Quiet Room scroll anchor', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('pins the first user message near the top while the reply fills below it', async () => {
    await element(by.id(ids.composerInput)).replaceText('anchor smoke');
    await element(by.id(ids.sendButton)).tap();

    const messageList = element(by.id(ids.messageList));
    const openingMessage = element(by.id(ids.openingMessage));
    const userMessage = element(by.id(ids.message.user(0)));
    await waitFor(userMessage).toBeVisible().withTimeout(30000);

    const listFrame = getFrame(await messageList.getAttributes());
    const openingFrame = getFrame(await openingMessage.getAttributes());
    const openingBottom = openingFrame.y + openingFrame.height;
    const initialFrame = getFrame(await userMessage.getAttributes());
    const initialY = initialFrame.y;
    const initialTopOffset = initialY - listFrame.y;
    const nearTopLimit = 20;
    console.log('anchor-frames', JSON.stringify({ listFrame, openingFrame, openingBottom, initialFrame, initialTopOffset, nearTopLimit }));

    jestExpect(openingBottom).toBeLessThanOrEqual(listFrame.y + 1);
    jestExpect(initialTopOffset).toBeGreaterThanOrEqual(0);
    jestExpect(initialTopOffset).toBeLessThanOrEqual(nearTopLimit);

    const stabilitySamples = await sampleY(userMessage, 3000);
    const minY = Math.min(...stabilitySamples);
    const maxY = Math.max(...stabilitySamples);
    jestExpect(maxY - minY).toBeLessThanOrEqual(18);

    const settledY = getFrameY(await userMessage.getAttributes());
    jestExpect(Math.abs(settledY - initialY)).toBeLessThanOrEqual(18);

    const assistantMessage = element(by.id(ids.message.assistant(1)));
    const assistantVisible = await waitForVisibleMaybe(assistantMessage, 15000);
    if (assistantVisible) {
      const assistantFrame = getFrame(await assistantMessage.getAttributes());
      jestExpect(assistantFrame.y).toBeGreaterThan(settledY + 40);
    }

    await messageList.swipe('down', 'fast', 0.7);
    await waitFor(openingMessage).toBeVisible().withTimeout(5000);
  });
});
