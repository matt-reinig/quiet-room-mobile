const {
  launchQuietRoom,
  waitForExistsMaybe,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

  const SEARCH_QUERIES = [
    'the',
    'FaItH',
    'pray',
    'zzzz-qr-mob-033-no-match',
  ];

function buildLoginUrl(customToken, featureFlags) {
  const params = new URLSearchParams({
    e2eLoginCustomToken: customToken,
    ff: JSON.stringify(featureFlags),
  });

  return `quietroommobileqa://quiet-room?${params.toString()}`;
}

async function waitForSearchState(expectedConversationId = null, timeoutMs = 30000) {
  const expectedResult = expectedConversationId
    ? element(by.id(ids.conversationSearchResultRow(expectedConversationId)))
    : null;
  const loading = element(by.id(ids.conversationsSearchLoading));
  const noResults = element(by.id(ids.conversationsSearchNoResults));

  const loadingSeen = await waitForExistsMaybe(loading, 3000);

  if (loadingSeen) {
    await waitFor(loading).not.toExist().withTimeout(timeoutMs);
  }

  if (expectedResult && await waitForExistsMaybe(expectedResult, 15000)) {
    return 'results';
  }

  if (await waitForExistsMaybe(noResults, 5000)) {
    return 'no_results';
  }

  return 'results';
}

describe('Quiet Room conversation search QA performance', () => {
  it('measures eight representative searches and opens the selected result', async () => {
    const customToken = process.env.E2E_CUSTOM_TOKEN;
    const expectedConversationId = process.env.E2E_EXPECTED_CONVERSATION_ID;
    const firstQuery = process.env.E2E_FIRST_QUERY || SEARCH_QUERIES[0];

    if (!customToken || !expectedConversationId) {
      throw new Error('QA performance test requires a custom token and expected conversation ID.');
    }

    const queries = [firstQuery, ...SEARCH_QUERIES.filter((query) => query !== firstQuery)];

    await launchQuietRoom({
      delete: true,
      url: buildLoginUrl(customToken, { conversation_search: true }),
    });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await waitFor(element(by.id(ids.conversationsButton))).toBeVisible().withTimeout(60000);
    await element(by.id(ids.conversationsButton)).tap();
    await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);

    const timings = [];
    const states = { no_results: 0, results: 0 };

    for (const [index, query] of queries.entries()) {
      if (index > 0) {
        const clearSearch = element(by.id(ids.conversationsSearchClear));
        if (await waitForExistsMaybe(clearSearch, 2000)) {
          await clearSearch.tap();
        }
        await waitFor(element(by.id(ids.conversationsSearchInput))).toBeVisible().withTimeout(5000);
      }

      await element(by.id(ids.conversationsSearchInput)).replaceText(query);
      const startedAt = Date.now();
      await element(by.id(ids.conversationsSearchSubmit)).tap();
      const state = await waitForSearchState(index === 0 ? expectedConversationId : null);
      timings.push(Date.now() - startedAt);
      states[state] += 1;

      if (index === 0) {
        await waitFor(element(by.id(ids.conversationSearchResultRow(expectedConversationId))))
          .toBeVisible()
          .withTimeout(15000);
        await element(by.id(ids.conversationSearchResultRow(expectedConversationId))).tap();
        await waitFor(element(by.id(ids.conversationsPanel))).not.toBeVisible().withTimeout(10000);
        await waitFor(element(by.id(ids.messageList))).toBeVisible().withTimeout(30000);
        await element(by.id(ids.conversationsButton)).tap();
        await waitFor(element(by.id(ids.conversationsPanel))).toBeVisible().withTimeout(10000);
      }
    }

    const sorted = [...timings].sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        count: timings.length,
        maxMs: Math.max(...timings),
        medianMs: sorted[Math.floor(sorted.length / 2)],
        minMs: Math.min(...timings),
        states,
      }),
    );
  });
});
