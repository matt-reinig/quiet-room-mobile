const { expect: jestExpect } = require('@jest/globals');
const {
  launchQuietRoom,
  updateQuietRoomFeatureFlags,
  waitForExistsMaybe,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(120000);

async function readText(elementHandle) {
  const attributes = await elementHandle.getAttributes();
  return attributes?.text || attributes?.label || '';
}

async function waitForText(elementHandle, expectedText, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';

  while (Date.now() < deadline) {
    lastText = await readText(elementHandle);

    if (lastText === expectedText) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Expected element text "${expectedText}", got "${lastText}"`);
}

async function launchQuietRoomWithFlags(featureFlags) {
  await launchQuietRoom({
    delete: true,
    featureFlags,
  });

  await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
}

async function openChatOptions() {
  await element(by.id(ids.modelMenuButton)).tap();
  await waitFor(element(by.id(ids.modelMenu))).toBeVisible().withTimeout(10000);
}

describe('Quiet Room model gating', () => {
  it('hides picker chrome when only the fallback model is available and voice mode is off', async () => {
    await launchQuietRoomWithFlags({
      chat_model_gpt_5_1: true,
      voice_mode: false,
    });

    await expect(element(by.id(ids.header))).toBeVisible();
    await expect(element(by.id(ids.crucifixWrapper))).toBeVisible();
    await expect(element(by.id(ids.composerWrapper))).toExist();

    const hasPickerContainer = await waitForExistsMaybe(
      element(by.id(ids.modelPickerContainer)),
      1500,
    );
    const hasPickerButton = await waitForExistsMaybe(
      element(by.id(ids.modelMenuButton)),
      1500,
    );

    jestExpect(hasPickerContainer).toBe(false);
    jestExpect(hasPickerButton).toBe(false);
  });

  it('shows a voice-only chat options menu when voice mode is enabled for a single model', async () => {
    await launchQuietRoomWithFlags({
      chat_model_gpt_5_1: true,
      voice_mode: true,
    });

    await expect(element(by.id(ids.modelPickerContainer))).toBeVisible();
    await expect(element(by.id(ids.modelMenuButton))).toBeVisible();

    const selectedLabel = await readText(element(by.id(ids.modelSelectedLabel)));
    jestExpect(selectedLabel).toBe('Sonnet 4.6');

    await openChatOptions();
    await expect(element(by.id(ids.modelMenuVoiceToggle))).toBeVisible();

    const hasPrimaryModelOption = await waitForExistsMaybe(
      element(by.id(ids.modelOption('gpt-5.1-chat-latest'))),
      1000,
    );
    const hasSecondaryModelOption = await waitForExistsMaybe(
      element(by.id(ids.modelOption('gpt-5.3-chat-latest'))),
      1000,
    );

    jestExpect(hasPrimaryModelOption).toBe(false);
    jestExpect(hasSecondaryModelOption).toBe(false);
  });

  it('shows model switching when multiple models are enabled', async () => {
    await launchQuietRoomWithFlags({
      chat_model_gpt_5_1: true,
      chat_model_gpt_5_3: true,
      chat_model_gpt_5_5_reasoning_none: true,
      voice_mode: false,
    });

    await expect(element(by.id(ids.modelPickerContainer))).toBeVisible();
    await expect(element(by.id(ids.modelMenuButton))).toBeVisible();

    await openChatOptions();

    const hasVoiceToggle = await waitForExistsMaybe(
      element(by.id(ids.modelMenuVoiceToggle)),
      1000,
    );
    jestExpect(hasVoiceToggle).toBe(false);

    const hasDeprecatedModelOption = await waitForExistsMaybe(
      element(by.id(ids.modelOption('gpt-5.1-chat-latest'))),
      1000,
    );
    jestExpect(hasDeprecatedModelOption).toBe(false);

    await expect(element(by.id(ids.modelOption('gpt-5.3-chat-latest')))).toBeVisible();
    await expect(element(by.id(ids.modelOption('gpt-5.5')))).toBeVisible();

    await element(by.id(ids.modelOption('gpt-5.5'))).tap();
    await waitFor(element(by.id(ids.modelMenu))).not.toExist().withTimeout(5000);

    const selectedLabel = await readText(element(by.id(ids.modelSelectedLabel)));
    jestExpect(selectedLabel).toBe('GPT-5.5');
  });

  it('falls back and refreshes chrome when the selected model is disabled during the session', async () => {
    await launchQuietRoomWithFlags({
      chat_model_gpt_5_3: true,
      chat_model_gpt_5_5_reasoning_none: true,
      voice_mode: false,
    });

    await openChatOptions();
    await element(by.id(ids.modelOption('gpt-5.5'))).tap();
    await waitFor(element(by.id(ids.modelMenu))).not.toExist().withTimeout(5000);
    await waitForText(element(by.id(ids.modelSelectedLabel)), 'GPT-5.5');

    await updateQuietRoomFeatureFlags({
      chat_model_anthropic_fast_chat: true,
      voice_mode: true,
    });

    await waitForText(element(by.id(ids.modelSelectedLabel)), 'Sonnet 4.6');
    await openChatOptions();
    await expect(element(by.id(ids.modelMenuVoiceToggle))).toBeVisible();

    const hasPrimaryModelOption = await waitForExistsMaybe(
      element(by.id(ids.modelOption('gpt-5.1-chat-latest'))),
      1000,
    );
    const hasDisabledModelOption = await waitForExistsMaybe(
      element(by.id(ids.modelOption('gpt-5.3-chat-latest'))),
      1000,
    );

    jestExpect(hasPrimaryModelOption).toBe(false);
    jestExpect(hasDisabledModelOption).toBe(false);
  });
});
