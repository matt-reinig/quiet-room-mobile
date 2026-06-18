const { expect: jestExpect } = require('@jest/globals');
const {
  createDisposableTestUser,
  fetchReports,
  launchQuietRoom,
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

function getFrame(attributes) {
  if (!attributes || !attributes.frame) {
    throw new Error('Expected Detox attributes.frame, got: ' + JSON.stringify(attributes));
  }

  return attributes.frame;
}

async function revealReportButton(index) {
  const reportButton = element(by.id(ids.message.report(index)));
  const messageList = element(by.id(ids.messageList));

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await waitFor(reportButton).toBeVisible().withTimeout(1500);
      break;
    } catch (error) {
      if (attempt === 7) {
        throw error;
      }

      await messageList.swipe('up', 'fast', 0.45).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const reportFrame = getFrame(await reportButton.getAttributes());
  const listFrame = getFrame(await messageList.getAttributes());
  console.log('report-button-frames', JSON.stringify({ reportFrame, listFrame }));
  return reportButton;
}

describe('Quiet Room response reporting', () => {
  it('submits a report for a specific assistant response', async () => {
    const account = await createDisposableTestUser();
    await seedConversations({
      uid: account.uid,
      token: account.token,
      count: 1,
    });

    const loginParams = new URLSearchParams({
      e2eLoginEmail: account.email,
      e2eLoginPassword: account.password,
    });

    await launchQuietRoom({
      delete: true,
      url: `quietroommobileqa://quiet-room?${loginParams.toString()}`,
    });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);

    await waitFor(element(by.id(ids.message.assistant(1)))).toExist().withTimeout(60000);
    const reportButton = await revealReportButton(1);
    await reportButton.tap();

    await waitFor(element(by.id(ids.reportResponseModal))).toBeVisible().withTimeout(10000);
    const inaccurateReason = element(by.id(`${ids.reportResponseReason}.inaccurate_or_misleading`));
    await waitFor(inaccurateReason).toBeVisible().withTimeout(10000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await inaccurateReason.tap();
    await element(by.id(ids.reportResponseForm)).scroll(520, 'down').catch(() => null);
    await element(by.id(ids.reportResponseNote)).tap();
    await element(by.id(ids.reportResponseNote)).replaceText('This answer needs review.');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await expect(element(by.id(ids.reportResponseNote))).toBeVisible();
    await expect(element(by.id(ids.reportResponseSubmit))).toBeVisible();

    const noteFrame = getFrame(await element(by.id(ids.reportResponseNote)).getAttributes());
    const submitFrame = getFrame(await element(by.id(ids.reportResponseSubmit)).getAttributes());

    console.log('report-response-keyboard-frames', JSON.stringify({ noteFrame, submitFrame }));
    jestExpect(noteFrame.y + noteFrame.height).toBeLessThanOrEqual(submitFrame.y + 8);
    await device.takeScreenshot(`qr-mob-024-report-note-keyboard-${device.getPlatform()}`);

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
    jestExpect(report.contentConsent).toBeUndefined();
  });
});
