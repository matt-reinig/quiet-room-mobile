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

describe('Quiet Room chat layout', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('keeps the opening message below the header and the composer padded within the footer chrome', async () => {
    const screenFrame = getFrame(await element(by.id(ids.screen)).getAttributes());
    const headerFrame = getFrame(await element(by.id(ids.header)).getAttributes());
    const openingFrame = getFrame(await element(by.id(ids.openingMessage)).getAttributes());
    const promptToggleFrame = getFrame(await element(by.id(ids.promptCuesToggle)).getAttributes());
    const composerFrame = getFrame(await element(by.id(ids.composerInput)).getAttributes());

    const headerBottom = headerFrame.y + headerFrame.height;
    const openingGap = openingFrame.y - headerBottom;
    const promptBottom = promptToggleFrame.y + promptToggleFrame.height;
    const composerTopGap = composerFrame.y - promptBottom;
    const composerBottomGap = screenFrame.height - (composerFrame.y + composerFrame.height);

    console.log('chat-layout-frames', JSON.stringify({
      screenFrame,
      headerFrame,
      openingFrame,
      promptToggleFrame,
      composerFrame,
      openingGap,
      composerTopGap,
      composerBottomGap,
    }));

    jestExpect(openingGap).toBeGreaterThan(8);
    jestExpect(openingGap).toBeLessThan(96);
    jestExpect(composerTopGap).toBeGreaterThan(12);
    jestExpect(composerBottomGap).toBeGreaterThan(20);
  });
});
