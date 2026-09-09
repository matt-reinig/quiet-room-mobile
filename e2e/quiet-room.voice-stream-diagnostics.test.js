const { launchQuietRoom } = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(120000);

const fixtureBaseUrl = process.env.VOICE_FIXTURE_BASE_URL || 'http://10.0.2.2:8787';
const fixtureCase = process.env.VOICE_FIXTURE_CASE || 'steady';

function diagnosticUrl() {
  const payload = encodeURIComponent(JSON.stringify({
    enabled: true,
    fixtureBaseUrl,
    fixtureCase,
  }));
  return `quietroommobileqa://quiet-room?voiceDiag=${payload}`;
}

describe('QR-MOB-021 TrackPlayer stream diagnostics', () => {
  it('plays the frozen fixture through the normal message voice button', async () => {
    await launchQuietRoom({ delete: true, url: diagnosticUrl() });
    await waitFor(element(by.id(ids.screen))).toBeVisible().withTimeout(60000);
    await waitFor(element(by.id(ids.openingMessage))).toExist().withTimeout(15000);

    const voiceButton = element(by.label('Play voice')).atIndex(0);
    await waitFor(voiceButton).toBeVisible().withTimeout(15000);
    await voiceButton.tap();

    await waitFor(element(by.label('Pause voice')).atIndex(0))
      .toBeVisible()
      .withTimeout(30000);
    await waitFor(element(by.label('Play voice')).atIndex(0))
      .toBeVisible()
      .withTimeout(45000);
  });
});
