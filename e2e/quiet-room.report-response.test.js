const { expect: jestExpect } = require('@jest/globals');
const {
  createDisposableTestUser,
  fetchReports,
  launchQuietRoom,
  loginWithEmailCredentials,
  seedConversations,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

async function waitForReport({ uid, timeoutMs = 15000, intervalMs = 500 }) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const reports = await fetchReports({ uid });
    if (reports?.items?.length) {
      return reports.items[0];
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for response report for ${uid}`);
}

describe('Quiet Room response reporting', () => {
  beforeEach(async () => {
    await launchQuietRoom({ delete: true });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
  });

  it('submits a report for a specific assistant response', async () => {
    const account = await createDisposableTestUser();
    await seedConversations({
      uid: account.uid,
      token: account.token,
      count: 1,
    });

    await loginWithEmailCredentials(account);

    await waitFor(element(by.id(ids.message.assistant(1)))).toExist().withTimeout(60000);
    await element(by.id(ids.messageList)).scroll(220, 'down');
    await waitFor(element(by.id(ids.message.report(1)))).toBeVisible().withTimeout(10000);
    await element(by.id(ids.message.report(1))).tap();

    await waitFor(element(by.id(ids.reportResponseModal))).toBeVisible().withTimeout(10000);
    await element(by.id(`${ids.reportResponseReason}.inaccurate_or_misleading`)).tap();
    await element(by.id(ids.reportResponseForm)).scroll(520, 'down');
    await waitFor(element(by.id(`${ids.reportResponseContextScope}.full_conversation`)))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id(`${ids.reportResponseContextScope}.full_conversation`)).tap();
    await device.takeScreenshot('qr-mob-010-report-consent-modal');
    await element(by.id(ids.reportResponseNote)).replaceText('This answer needs review.');
    await element(by.id(ids.reportResponseSubmit)).tap();

    await waitFor(element(by.text('Thanks, your report was submitted.'))).toBeVisible().withTimeout(15000);
    await device.takeScreenshot('qr-mob-010-report-submitted');

    const report = await waitForReport({ uid: account.uid });
    jestExpect(report.conversationId).toBe('seed-conv-001');
    jestExpect(report.assistantMessageIndex).toBe(1);
    jestExpect(report.assistantMessageId).toBe('seed-conv-001:1');
    jestExpect(report.reason).toBe('inaccurate_or_misleading');
    jestExpect(report.note).toBe('This answer needs review.');
    jestExpect(report.status).toBe('open');
    jestExpect(report.contentConsent).toMatchObject({
      scope: 'full_conversation',
      includesSelectedMessage: true,
      includesRecentContext: true,
      includesFullConversation: true,
    });
    jestExpect(report.selectedMessageSnapshot).toMatchObject({
      index: 1,
      role: 'assistant',
      content: 'Seeded assistant reply 1',
      model: 'gpt-5.1-chat-latest',
    });
    jestExpect(report.conversationContextSnapshot).toMatchObject({
      kind: 'full_conversation',
      startIndex: 0,
      endIndexExclusive: 2,
      messageCount: 2,
      totalConversationMessages: 2,
      reportedMessageIndex: 1,
      includesReportedMessage: true,
    });
    jestExpect(report.conversationContextSnapshot.messages).toEqual([
      {
        index: 0,
        role: 'user',
        content: 'Seeded user message 1',
        timestamp_ms: 1710000001000,
      },
      {
        index: 1,
        role: 'assistant',
        content: 'Seeded assistant reply 1',
        timestamp_ms: 1710000001500,
        model: 'gpt-5.1-chat-latest',
      },
    ]);
  });
});
