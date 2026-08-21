const { expect: jestExpect } = require('@jest/globals');
const {
  launchQuietRoom,
  updateQuietRoomFeatureFlags,
  waitForExistsMaybe,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(120000);

async function launchWithAmbientAudio(enabled, options = {}) {
  await launchQuietRoom({
    delete: options.delete !== false,
    featureFlags: {
      ambient_audio: enabled,
      chat_model_gpt_5_1: true,
      voice_mode: false,
      ...(options.featureFlags || {}),
    },
  });

  await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  await waitFor(element(by.id(ids.composerWrapper))).toBeVisible().withTimeout(60000);
  if (enabled) {
    await waitFor(element(by.id(ids.modelMenuButton))).toBeVisible().withTimeout(60000);
  }
}

async function openAmbientAudioSelector() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await element(by.id(ids.modelMenuButton)).tap();
    try {
      await waitFor(element(by.id(ids.ambientAudioSelector))).toBeVisible().withTimeout(5000);
      return;
    } catch {
      await waitFor(element(by.id(ids.modelMenuButton))).toBeVisible().withTimeout(5000);
    }
  }
  await waitFor(element(by.id(ids.ambientAudioSelector))).toBeVisible().withTimeout(10000);
}

describe('Quiet Room ambient audio', () => {
  it('keeps the control absent when ambient_audio is disabled', async () => {
    await launchWithAmbientAudio(false);

    const hasOptionsButton = await waitForExistsMaybe(
      element(by.id(ids.modelMenuButton)),
      1500,
    );
    if (hasOptionsButton) {
      await element(by.id(ids.modelMenuButton)).tap();
    }
    await expect(element(by.id(ids.ambientAudioSelector))).not.toExist();
  });

  it('offers all environments, persists a selection, and lets Off stop it', async () => {
    await launchWithAmbientAudio(true);
    await openAmbientAudioSelector();

    for (const environment of [
      'off',
      'brown-noise',
      'rain',
      'quiet-church',
      'faint-chant',
    ]) {
      await expect(element(by.id(ids.ambientAudioOption(environment)))).toExist();
    }

    await waitFor(element(by.id(ids.ambientAudioOption('faint-chant'))))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id(ids.ambientAudioOption('faint-chant'))).tap();
    await waitFor(element(by.id(ids.ambientAudioStatus)))
      .toHaveText('Faint Chant playing')
      .withTimeout(15000);

    await launchWithAmbientAudio(true, { delete: false });
    await openAmbientAudioSelector();
    await waitFor(element(by.id(ids.ambientAudioStatus)))
      .toHaveText('Faint Chant playing')
      .withTimeout(15000);

    await element(by.id(ids.ambientAudioOption('off'))).tap();
    await expect(element(by.id(ids.ambientAudioStatus))).not.toExist();
  });

  it('scrolls to choices below the visible menu area', async () => {
    await launchWithAmbientAudio(true, {
      featureFlags: {
        chat_model_gpt_5_3: true,
        chat_model_gpt_5_5_reasoning_none: true,
        voice_mode: true,
      },
    });
    await openAmbientAudioSelector();

    await waitFor(element(by.id(ids.modelOption('anthropic_fast_chat'))))
      .toExist()
      .withTimeout(10000);
    await element(by.id(ids.modelMenu)).scrollTo('bottom');
    await waitFor(element(by.id(ids.modelOption('anthropic_fast_chat'))))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('removes the UI immediately when the live feature flag is disabled', async () => {
    await launchWithAmbientAudio(true);
    await openAmbientAudioSelector();
    await element(by.id(ids.ambientAudioOption('rain'))).tap();
    await waitFor(element(by.id(ids.ambientAudioStatus)))
      .toHaveText('Rain playing')
      .withTimeout(15000);

    await updateQuietRoomFeatureFlags({
      ambient_audio: false,
      chat_model_gpt_5_1: true,
      voice_mode: false,
    });

    await waitFor(element(by.id(ids.ambientAudioSelector))).not.toExist().withTimeout(10000);
    await expect(element(by.id(ids.ambientAudioStatus))).not.toExist();
  });
});
