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
    await launchQuietRoom({ delete: true });
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
    const closeFrame = getFrame(await closeButton.getAttributes());
    const imageFrame = getFrame(await image.getAttributes());

    console.log('crucifix-modal-frames', JSON.stringify({ screenFrame, modalFrame, closeFrame, imageFrame }));

    jestExpect(modalFrame.height).toBeGreaterThan(screenFrame.height * 0.9);
    jestExpect(modalFrame.width).toBeGreaterThan(screenFrame.width * 0.9);
    if (device.getPlatform() === 'ios') {
      jestExpect(closeFrame.y).toBeGreaterThanOrEqual(44);
    }
    jestExpect(imageFrame.height).toBeGreaterThan(modalFrame.height * 0.7);

    await device.takeScreenshot(`qr-mob-023-crucifix-close-safe-area-${device.getPlatform()}`);
    await closeButton.tap();
    await waitFor(modal).not.toExist().withTimeout(10000);
  });

  it('cycles through four sacred images, wraps, and persists the selection', async () => {
    const mainImage = element(by.id(ids.sacredImageMain));
    const modalImage = element(by.id(ids.crucifixImage));
    const nextButton = element(by.id(ids.sacredImageNext));
    const previousButton = element(by.id(ids.sacredImagePrevious));

    await expect(mainImage).toHaveLabel('Crucifix');
    await expect(nextButton).not.toExist();
    await expect(previousButton).not.toExist();
    await element(by.id(ids.crucifixButton)).tap();
    await waitFor(nextButton).toBeVisible().withTimeout(10000);
    await waitFor(previousButton).toBeVisible().withTimeout(10000);
    await expect(modalImage).toHaveLabel('Crucifix');
    await new Promise((resolve) => setTimeout(resolve, 750));

    for (const label of [
      'Mary in prayer',
      'Christ in Gethsemane',
      'Jesus stilling the tempest',
      'Crucifix',
    ]) {
      await nextButton.tap();
      await waitFor(element(by.label(label))).toBeVisible().withTimeout(5000);
      await device.takeScreenshot(`sacred-image-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
    }

    await previousButton.tap();
    await waitFor(element(by.label('Jesus stilling the tempest'))).toBeVisible().withTimeout(5000);
    await element(by.id(ids.crucifixClose)).tap();
    await waitFor(element(by.id(ids.crucifixModal))).not.toExist().withTimeout(10000);
    await expect(nextButton).not.toExist();
    await expect(previousButton).not.toExist();
    await waitFor(element(by.label('Jesus stilling the tempest'))).toBeVisible().withTimeout(5000);

    await launchQuietRoom();
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await waitFor(element(by.label('Jesus stilling the tempest'))).toBeVisible().withTimeout(10000);
  });
});
