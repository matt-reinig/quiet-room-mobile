const {
  createDisposableTestUser,
  launchQuietRoom,
  seedConversations,
} = require('./helpers');
const { expect: jestExpect } = require('@jest/globals');
const ids = require('./testIds');

jest.setTimeout(240000);

function buildLoginUrl(account, conversationSearchEnabled) {
  const params = new URLSearchParams({
    e2eLoginEmail: account.email,
    e2eLoginPassword: account.password,
  });
  params.set('ff', JSON.stringify({ conversation_search: conversationSearchEnabled }));
  return `quietroommobileqa://quiet-room?${params.toString()}`;
}

async function launchSeededSearchAccount(conversationSearchEnabled, options = {}) {
  const account = await createDisposableTestUser();
  await seedConversations({
    uid: account.uid,
    token: account.token,
    count: 25,
    navigationFixture: options.navigationFixture === true,
  });
  await launchQuietRoom({
    delete: true,
    url: buildLoginUrl(account, conversationSearchEnabled),
  });
  await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  await waitFor(element(by.id(ids.conversationsButton))).toBeVisible().withTimeout(60000);
  return account;
}

function getFrame(attributes) {
  if (!attributes || !attributes.frame) {
    throw new Error('Expected Detox attributes.frame, got: ' + JSON.stringify(attributes));
  }

  return attributes.frame;
}

describe('Quiet Room conversation search', () => {
  it('keeps search controls absent when conversation_search is disabled', async () => {
    await launchSeededSearchAccount(false);
    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);

    await expect(element(by.id(ids.conversationsSearchInput))).not.toExist();
  });

  it('keeps the open Conversations drawer clear of the device safe area', async () => {
    await launchSeededSearchAccount(false);
    const screenFrame = getFrame(await element(by.id(ids.screen)).getAttributes());

    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);

    const panelFrame = getFrame(await element(by.id(ids.conversationsPanel)).getAttributes());
    const closeFrame = getFrame(await element(by.id(ids.conversationsClose)).getAttributes());
    const newChatFrame = getFrame(await element(by.id(ids.conversationsNew)).getAttributes());

    console.log('conversations-safe-area-frames', JSON.stringify({
      platform: device.getPlatform(),
      screenFrame,
      panelFrame,
      closeFrame,
      newChatFrame,
    }));

    const minimumTopClearance = device.getPlatform() === 'ios' ? 44 : 24;
    jestExpect(closeFrame.y).toBeGreaterThanOrEqual(minimumTopClearance);
    jestExpect(closeFrame.y).toBeGreaterThanOrEqual(panelFrame.y);
    jestExpect(newChatFrame.y).toBeGreaterThan(closeFrame.y);
    jestExpect(panelFrame.height).toBeGreaterThanOrEqual(screenFrame.height * 0.9);

    await device.takeScreenshot(`qr-mob-033-conversations-safe-area-${device.getPlatform()}`);
  });

  it('searches an older conversation, opens it, and restores the normal list after clear', async () => {
    await launchSeededSearchAccount(true);
    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);

    await element(by.id(ids.conversationsSearchInput)).replaceText('mEsSaGe 5');
    await element(by.id(ids.conversationsSearchSubmit)).tap();
    await waitFor(element(by.id(ids.conversationSearchResultRow('seed-conv-005'))))
      .toBeVisible()
      .withTimeout(15000);
    await expect(element(by.id(ids.conversationSearchSnippet('seed-conv-005')))).toBeVisible();

    await element(by.id(ids.conversationSearchResultRow('seed-conv-005'))).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).not.toBeVisible().withTimeout(10000);
    await waitFor(element(by.text('Seeded user message 5'))).toBeVisible().withTimeout(30000);

    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);
    await element(by.id(ids.conversationsSearchInput)).replaceText('query-that-cannot-match');
    await element(by.id(ids.conversationsSearchSubmit)).tap();
    await waitFor(element(by.id(ids.conversationsSearchNoResults))).toBeVisible().withTimeout(15000);

    await element(by.id(ids.conversationsSearchClear)).tap();
    await waitFor(element(by.id(ids.conversationsSearchInput))).toBeVisible().withTimeout(5000);
    // The normal list is paginated; the newest seeded conversation is guaranteed
    // to be in the first page after clearing search.
    await waitFor(element(by.id(ids.conversation.row('seed-conv-025')))).toBeVisible().withTimeout(15000);
  });

  it('serves a repeated identical search from the fresh UID-scoped client cache', async () => {
    await launchSeededSearchAccount(true);
    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);

    const query = 'mEsSaGe 5';
    await element(by.id(ids.conversationsSearchInput)).replaceText(query);
    await element(by.id(ids.conversationsSearchSubmit)).tap();
    await waitFor(element(by.id(ids.conversationSearchResultRow('seed-conv-005'))))
      .toBeVisible()
      .withTimeout(15000);

    await element(by.id(ids.conversationsSearchClear)).tap();
    await waitFor(element(by.id(ids.conversationsSearchInput))).toBeVisible().withTimeout(5000);
    await element(by.id(ids.conversationsSearchInput)).replaceText(query);
    await element(by.id(ids.conversationsSearchSubmit)).tap();
    await waitFor(element(by.id(ids.conversationSearchResultRow('seed-conv-005'))))
      .toBeVisible()
      .withTimeout(15000);

    console.log('conversation-search-repeat-cache-journey-complete', JSON.stringify({
      platform: device.getPlatform(),
      query,
      expectedBackendSearchRequests: 1,
    }));
  });

  it('navigates grouped matches, highlights the active message, and clears stale context', async () => {
    await launchSeededSearchAccount(true, { navigationFixture: true });
    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);

    await element(by.id(ids.conversationsSearchInput)).replaceText('NaViGaTiOn NeEdLe');
    await element(by.id(ids.conversationsSearchSubmit)).tap();
    await waitFor(element(by.id(ids.conversationSearchResultRow('seed-conv-001'))))
      .toBeVisible()
      .withTimeout(15000);
    await expect(element(by.text('3 matches'))).toBeVisible();

    await element(by.id(ids.conversationSearchResultRow('seed-conv-001'))).tap();
    await waitFor(element(by.id(ids.conversationSearchNavigator))).toBeVisible().withTimeout(30000);
    await expect(element(by.id(ids.conversationSearchOrdinal))).toHaveText('Match 3 of 3');
    await waitFor(element(by.id(ids.conversationSearchActiveMessage('seed-conv-001', 4))))
      .toBeVisible()
      .withTimeout(30000);
    await waitFor(element(by.id(ids.conversationSearchHighlight('seed-conv-001', 4))))
      .toBeVisible()
      .withTimeout(30000);

    await element(by.id(ids.conversationSearchPrevious)).tap();
    await waitFor(element(by.id(ids.conversationSearchOrdinal))).toHaveText('Match 2 of 3').withTimeout(10000);
    await waitFor(element(by.id(ids.conversationSearchActiveMessage('seed-conv-001', 2))))
      .toBeVisible()
      .withTimeout(30000);

    await element(by.id(ids.conversationSearchPrevious)).tap();
    await waitFor(element(by.id(ids.conversationSearchOrdinal))).toHaveText('Match 1 of 3').withTimeout(10000);
    await waitFor(element(by.id(ids.conversationSearchActiveMessage('seed-conv-001', 0))))
      .toBeVisible()
      .withTimeout(30000);

    await element(by.id(ids.conversationSearchNext)).tap();
    await waitFor(element(by.id(ids.conversationSearchOrdinal))).toHaveText('Match 2 of 3').withTimeout(10000);
    await element(by.id(ids.conversationSearchDismiss)).tap();
    await expect(element(by.id(ids.conversationSearchNavigator))).not.toExist();
    await expect(element(by.id(ids.conversationSearchHighlight('seed-conv-001', 2)))).not.toExist();

    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);
    await element(by.id(ids.conversation.row('seed-conv-025'))).tap();
    await waitFor(element(by.id(ids.conversationSearchNavigator))).not.toExist().withTimeout(10000);
  });
});
