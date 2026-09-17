const { expect: jestExpect } = require('@jest/globals');
const {
  acceptAiConsentIfVisible,
  launchQuietRoom,
  waitForExistsMaybe,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

const FIXTURE_BASE = (process.env.E2E_API_BASE || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const AUTH_EMULATOR_BASE = process.env.E2E_AUTH_EMULATOR_BASE || 'http://127.0.0.1:9099';
const AUTH_PROJECT_ID = 'gabriel-qa-89f20';
const REGISTERED_CREDENTIALS = {
  email: 'stream-integrity@example.com',
  password: 'stream-integrity-password',
};
const COMPLETE_PROMPT = 'stream-integrity-complete';
const INCOMPLETE_PROMPT = 'stream-integrity-incomplete';
const COMPLETE_CONTENT = 'A complete native stream preserves its final punctuation.';
const INCOMPLETE_CONTENT =
  'This is a deterministic native stream fixture. What do you make of the fact that your brothers were the ones who ran you down and came to you?';

function registeredLaunchUrl() {
  const params = new URLSearchParams({
    e2eLoginEmail: REGISTERED_CREDENTIALS.email,
    e2eLoginPassword: REGISTERED_CREDENTIALS.password,
  });
  return `quietroommobileqa://quiet-room?${params.toString()}`;
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fixtureRequest(pathname, options = {}) {
  const response = await fetch(`${FIXTURE_BASE}${pathname}`, options);
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(`Fixture request failed (${response.status}) ${pathname}: ${text}`);
  }

  return payload;
}

async function resetFixture() {
  await fixtureRequest('/__fixture/reset', { method: 'POST' });
}

async function resetRegisteredTestUser() {
  const resetResponse = await fetch(
    `${AUTH_EMULATOR_BASE}/emulator/v1/projects/${AUTH_PROJECT_ID}/accounts`,
    { method: 'DELETE' },
  );
  if (!resetResponse.ok) {
    throw new Error(`Auth emulator reset failed: ${resetResponse.status}`);
  }

  const signupResponse = await fetch(
    `${AUTH_EMULATOR_BASE}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      body: JSON.stringify({
        email: REGISTERED_CREDENTIALS.email,
        password: REGISTERED_CREDENTIALS.password,
        returnSecureToken: true,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  if (!signupResponse.ok) {
    throw new Error(`Auth emulator signup failed: ${signupResponse.status} ${await signupResponse.text()}`);
  }
}

async function waitForSendReady(sendButton, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const attributes = await sendButton.getAttributes();
      const label = attributes?.label || attributes?.text || '';
      if (label === 'Send') {
        return;
      }
    } catch {
      // The composer can be replaced briefly while the response settles.
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for send button after ${timeoutMs}ms`);
}

async function sendPrompt(prompt) {
  const composer = element(by.id(ids.composerInput));
  const composerExpand = element(by.id(ids.composerExpand));
  const fullscreenComposer = element(by.id(ids.composerFullscreenInput));
  const fullscreenSendButton = element(by.id(ids.fullscreenSendButton));
  const sendButton = element(by.id(ids.sendButton));

  if (
    device.getPlatform() === 'ios' &&
    await waitForExistsMaybe(composerExpand, 1500)
  ) {
    await composerExpand.tap();
    await waitFor(fullscreenComposer).toBeVisible().withTimeout(10000);
    await fullscreenComposer.replaceText(prompt);
    await fullscreenSendButton.tap();
  } else {
    await composer.tap();
    await composer.replaceText(prompt);
    await sendButton.tap();
  }

  await acceptAiConsentIfVisible();
  await waitFor(element(by.text(prompt))).toBeVisible().withTimeout(30000);
  await waitForSendReady(sendButton);
}

async function waitForContent(messageIndex, expected, timeoutMs = 60000) {
  const content = element(by.id(ids.message.content('assistant', messageIndex)));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const attributes = await content.getAttributes();
      const text = attributes?.text || attributes?.label || '';
      if (text === expected) {
        return;
      }
    } catch {
      // The assistant row is not mounted until the first stream data arrives.
    }
    await delay(300);
  }

  throw new Error(`Timed out waiting for assistant content: ${expected}`);
}

async function reopenAndVerify(expected, conversationId) {
  await element(by.id(ids.conversationsButton)).tap();
  await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);
  const row = element(by.id(ids.conversation.row(conversationId)));
  await waitFor(row).toBeVisible().withTimeout(15000);
  await row.tap();
  try {
    await waitFor(element(by.id(ids.conversationsPanel))).not.toBeVisible().withTimeout(3000);
  } catch {
    // On some iOS simulator runtimes the first press only dismisses the
    // composer editing overlay that remains behind the modal.
    await row.tap();
    await waitFor(element(by.id(ids.conversationsPanel))).not.toBeVisible().withTimeout(10000);
  }
  await waitForContent(1, expected);
}

async function relaunchAndVerify(expected) {
  await launchQuietRoom({ delete: false });
  await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  await waitForContent(1, expected);
}

describe('Quiet Room stream integrity', () => {
  beforeEach(async () => {
    await resetFixture();
    await resetRegisteredTestUser();
    await launchQuietRoom({ delete: true, url: registeredLaunchUrl() });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await waitFor(element(by.id(ids.composerInput))).toExist().withTimeout(60000);
    await waitFor(element(by.id(ids.conversationsButton))).toExist().withTimeout(60000);
  });

  it('keeps a healthy native stream with its DONE marker', async () => {
    await sendPrompt(COMPLETE_PROMPT);
    await waitForContent(1, COMPLETE_CONTENT);

    const state = await fixtureRequest('/__fixture/state');
    const streamRequests = state.requests.filter((request) => request.path === '/api/chat/stream');
    jestExpect(streamRequests).toHaveLength(1);
    jestExpect(state.streamModes).toEqual([{ id: state.conversations[0].id, mode: 'done' }]);
    jestExpect(state.conversations).toHaveLength(1);
    jestExpect(state.conversations[0].messages[1].content).toBe(COMPLETE_CONTENT);
  });

  it('recovers a canonical tail after HTTP 200 closes without DONE, including reopen and relaunch', async () => {
    await sendPrompt(INCOMPLETE_PROMPT);
    await waitForContent(1, INCOMPLETE_CONTENT);

    const stateAfterSend = await fixtureRequest('/__fixture/state');
    const conversationId = stateAfterSend.conversations[0].id;
    const streamRequests = stateAfterSend.requests.filter((request) => request.path === '/api/chat/stream');
    jestExpect(streamRequests).toHaveLength(1);
    jestExpect(stateAfterSend.streamModes).toEqual([{ id: conversationId, mode: 'missing_done' }]);
    jestExpect(stateAfterSend.conversations[0].messages[1].content).toBe(INCOMPLETE_CONTENT);
    jestExpect(
      stateAfterSend.clientEvents.some((event) => event.event === 'chat_stream.incomplete'),
    ).toBe(true);

    await reopenAndVerify(INCOMPLETE_CONTENT, conversationId);

    const stateAfterReopen = await fixtureRequest('/__fixture/state');
    const detailRequestsAfterReopen = stateAfterReopen.requests.filter(
      (request) => request.path === `/api/conversations/${conversationId}`,
    );
    jestExpect(detailRequestsAfterReopen.length).toBeGreaterThanOrEqual(2);

    await relaunchAndVerify(INCOMPLETE_CONTENT);

    const finalState = await fixtureRequest('/__fixture/state');
    const detailRequests = finalState.requests.filter(
      (request) => request.path === `/api/conversations/${conversationId}`,
    );
    jestExpect(detailRequests.length).toBeGreaterThanOrEqual(3);
  });
});
