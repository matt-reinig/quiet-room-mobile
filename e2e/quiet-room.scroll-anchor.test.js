const { expect: jestExpect } = require('@jest/globals');
const { acceptAiConsentIfVisible, ensureGuestSession, launchQuietRoom } = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

function getFrame(attributes) {
  if (!attributes || !attributes.frame) {
    throw new Error('Expected Detox attributes.frame, got: ' + JSON.stringify(attributes));
  }

  return attributes.frame;
}

function getFrameY(attributes) {
  return getFrame(attributes).y;
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLabel(elementHandle) {
  const attributes = await elementHandle.getAttributes();
  return attributes?.label || attributes?.text || '';
}

async function isComposerReady(composer, sendButton) {
  try {
    await waitFor(composer).toBeVisible().withTimeout(1000);
    await waitFor(sendButton).toBeVisible().withTimeout(1000);
    return (await readLabel(sendButton)) === 'Send';
  } catch {
    return false;
  }
}

async function waitForComposerReady(timeoutMs = 90000) {
  const composer = element(by.id(ids.composerInput));
  const sendButton = element(by.id(ids.sendButton));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isComposerReady(composer, sendButton)) {
      await delay(500);
      if (await isComposerReady(composer, sendButton)) {
        return { composer, sendButton };
      }
    }

    await delay(300);
  }

  throw new Error(`Timed out waiting for a stable composer after ${timeoutMs}ms`);
}

async function waitForSendReady(sendButton, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if ((await readLabel(sendButton)) === 'Send') {
      return;
    }

    await delay(300);
  }

  throw new Error(`Timed out waiting for send button after ${timeoutMs}ms`);
}

async function sendPrompt(text, { keepKeyboardOpen = false } = {}) {
  const { composer, sendButton } = await waitForComposerReady();

  await composer.replaceText(text);
  await waitForComposerReady();
  await sendButton.tap();
  await acceptAiConsentIfVisible();

  if (!keepKeyboardOpen) {
    await waitFor(element(by.id(ids.message.user(0)))).toExist().withTimeout(30000);
  }

  return { composer, sendButton };
}

async function readAnchorFrames(userIndex) {
  const messageList = element(by.id(ids.messageList));
  const openingMessage = element(by.id(ids.openingMessage));
  const userMessage = element(by.id(ids.message.user(userIndex)));
  const listAttributes = await messageList.getAttributes();
  const listFrame = getFrame(listAttributes);
  const openingFrame = getFrame(await openingMessage.getAttributes());
  const userFrame = getFrame(await userMessage.getAttributes());

  return {
    listFrame,
    openingFrame,
    openingBottom: openingFrame.y + openingFrame.height,
    userFrame,
    userTopOffset: userFrame.y - listFrame.y,
  };
}

async function waitForUserAnchor(userIndex, timeoutMs = 30000) {
  const userMessage = element(by.id(ids.message.user(userIndex)));
  await waitFor(userMessage).toExist().withTimeout(timeoutMs);

  const deadline = Date.now() + timeoutMs;
  let frames;

  while (Date.now() < deadline) {
    frames = await readAnchorFrames(userIndex);
    if (frames.openingBottom <= frames.listFrame.y + 1 && frames.userTopOffset >= 0 && frames.userTopOffset <= 20) {
      return frames;
    }

    await delay(250);
  }

  throw new Error('Timed out waiting for anchored message: ' + JSON.stringify(frames));
}

async function assertStableUserAnchor(userIndex) {
  const userMessage = element(by.id(ids.message.user(userIndex)));
  const initialY = getFrameY(await userMessage.getAttributes());
  const samples = [];
  const deadline = Date.now() + 3000;

  while (Date.now() < deadline) {
    samples.push(getFrameY(await userMessage.getAttributes()));
    await delay(250);
  }

  samples.push(getFrameY(await userMessage.getAttributes()));
  const minY = Math.min(...samples);
  const maxY = Math.max(...samples);

  jestExpect(maxY - minY).toBeLessThanOrEqual(18);
  jestExpect(Math.abs(samples[samples.length - 1] - initialY)).toBeLessThanOrEqual(18);
}

describe('Quiet Room scroll anchor', () => {
  beforeEach(async () => {
    await launchQuietRoom({ delete: true });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await ensureGuestSession();
    await waitForComposerReady();
  });

  it('pins the first user message near the top while the reply fills below it', async () => {
    const { sendButton } = await sendPrompt('anchor smoke');
    const frames = await waitForUserAnchor(0);

    jestExpect(frames.openingBottom).toBeLessThanOrEqual(frames.listFrame.y + 1);
    jestExpect(frames.userTopOffset).toBeGreaterThanOrEqual(0);
    jestExpect(frames.userTopOffset).toBeLessThanOrEqual(20);
    await assertStableUserAnchor(0);

    const assistantMessage = element(by.id(ids.message.assistant(1)));
    try {
      await waitFor(assistantMessage).toBeVisible().withTimeout(15000);
      const assistantFrame = getFrame(await assistantMessage.getAttributes());
      const userFrame = getFrame(await element(by.id(ids.message.user(0))).getAttributes());
      jestExpect(assistantFrame.y).toBeGreaterThan(userFrame.y + 40);
    } catch {
      // A slow backend response does not invalidate the layout assertion.
    }

    await waitForSendReady(sendButton);
    await element(by.id(ids.messageList)).swipe('down', 'fast', 0.7);
    await waitFor(element(by.id(ids.openingMessage))).toBeVisible().withTimeout(5000);
  });

  it('keeps a follow-up user message near the top of an established conversation', async () => {
    const { sendButton } = await sendPrompt('anchor first message');
    await waitForUserAnchor(0);
    await waitFor(element(by.id(ids.message.assistant(1)))).toExist().withTimeout(90000);
    await waitForSendReady(sendButton);

    const composer = element(by.id(ids.composerInput));
    await composer.replaceText('anchor follow-up message');
    await waitForComposerReady();
    await sendButton.tap();
    await waitFor(element(by.id(ids.message.user(2)))).toExist().withTimeout(30000);

    const frames = await waitForUserAnchor(2);
    jestExpect(frames.userTopOffset).toBeGreaterThanOrEqual(0);
    jestExpect(frames.userTopOffset).toBeLessThanOrEqual(20);
    await assertStableUserAnchor(2);
  });

  it('anchors a multiline first send while the Android keyboard is active', async () => {
    const multilinePrompt = 'first line of the anchor prompt\nsecond line keeps the keyboard open';
    const { sendButton } = await sendPrompt(multilinePrompt, { keepKeyboardOpen: true });
    const frames = await waitForUserAnchor(0);

    jestExpect(frames.openingBottom).toBeLessThanOrEqual(frames.listFrame.y + 1);
    jestExpect(frames.userTopOffset).toBeLessThanOrEqual(20);
    await assertStableUserAnchor(0);
    await waitForSendReady(sendButton);
  });
});
