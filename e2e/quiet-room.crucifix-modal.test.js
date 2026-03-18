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

describe('Quiet Room crucifix modal', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('opens as a fullscreen modal with a close control', async () => {
    const screenHandle = element(by.id(ids.screen));
    const modal = element(by.id(ids.crucifixModal));
    const closeButton = element(by.id(ids.crucifixClose));
    const image = element(by.id(ids.crucifixImage));

    const screenFrame = getFrame(await screenHandle.getAttributes());

    await element(by.id(ids.crucifixButton)).tap();
    await waitFor(modal).toExist().withTimeout(10000);
    await waitFor(closeButton).toBeVisible().withTimeout(10000);
    await expect(image).toBeVisible();

    const modalFrame = getFrame(await modal.getAttributes());
    const imageFrame = getFrame(await image.getAttributes());

    console.log('crucifix-modal-frames', JSON.stringify({ screenFrame, modalFrame, imageFrame }));

    jestExpect(modalFrame.height).toBeGreaterThan(screenFrame.height * 0.9);
    jestExpect(modalFrame.width).toBeGreaterThan(screenFrame.width * 0.9);
    jestExpect(imageFrame.height).toBeGreaterThan(modalFrame.height * 0.7);

    await closeButton.tap();
    await waitFor(modal).not.toExist().withTimeout(10000);
  });
});
