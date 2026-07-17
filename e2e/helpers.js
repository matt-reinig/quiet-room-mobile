const fs = require('fs');
const path = require('path');
const ids = require('./testIds');

let cachedCreds = null;
let cachedBackendConfig = null;
const DEFAULT_E2E_APP_SCHEME = process.env.E2E_APP_SCHEME || 'quietroommobileqa';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function getE2ECredentials() {
  if (cachedCreds) {
    return cachedCreds;
  }

  const sharedEnv = parseEnvFile(path.resolve(__dirname, '../../quiet-room/.env'));

  cachedCreds = {
    email:
      process.env.E2E_EMAIL ||
      process.env.E2E_EMAIL_REAL ||
      sharedEnv.E2E_EMAIL ||
      sharedEnv.E2E_EMAIL_REAL ||
      'newuser@example.com',
    password:
      process.env.E2E_PASSWORD ||
      process.env.E2E_PASSWORD_REAL ||
      sharedEnv.E2E_PASSWORD ||
      sharedEnv.E2E_PASSWORD_REAL ||
      'password',
  };

  return cachedCreds;
}

function getBackendConfig() {
  if (cachedBackendConfig) {
    return cachedBackendConfig;
  }

  const appEnv = parseEnvFile(path.resolve(__dirname, '../.env'));
  const overlayEnv = parseEnvFile(path.resolve(__dirname, '../.env.local.qa'));

  cachedBackendConfig = {
    apiBase:
      process.env.E2E_API_BASE ||
      process.env.EXPO_PUBLIC_API_BASE ||
      overlayEnv.EXPO_PUBLIC_API_BASE ||
      appEnv.EXPO_PUBLIC_API_BASE ||
      'http://localhost:5000',
    testKey:
      process.env.E2E_TEST_KEY ||
      process.env.GABRIEL_TEST_KEY ||
      'gabriel-local-test-key',
  };

  return cachedBackendConfig;
}

async function backendRequest(pathname, options = {}) {
  const config = getBackendConfig();
  const headers = {
    'x-test-key': config.testKey,
    ...(options.headers || {}),
  };

  const response = await fetch(config.apiBase.replace(/\/+$/, '') + pathname, {
    ...options,
    headers,
  });

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
    throw new Error(
      `Backend request failed (${response.status}) for ${pathname}: ${
        typeof payload === 'string' ? payload : JSON.stringify(payload)
      }`
    );
  }

  return payload;
}

async function launchQuietRoom(options = {}) {
  const {
    appScheme = DEFAULT_E2E_APP_SCHEME,
    delete: deleteAppData = false,
    featureFlags = null,
    url,
  } = options;
  const launchUrl =
    typeof url === 'string' && url.trim()
      ? url.trim()
      : featureFlags && typeof featureFlags === 'object'
        ? `${appScheme}://quiet-room?ff=${encodeURIComponent(JSON.stringify(featureFlags))}`
      : undefined;

  await device.launchApp({
    delete: deleteAppData,
    newInstance: true,
    url: launchUrl,
    launchArgs: {
      detoxEnableSynchronization: 0,
    },
  });

  await device.disableSynchronization();
}

function buildQuietRoomFeatureFlagsUrl(featureFlags, appScheme = DEFAULT_E2E_APP_SCHEME) {
  return `${appScheme}://quiet-room?ff=${encodeURIComponent(JSON.stringify(featureFlags))}`;
}

async function updateQuietRoomFeatureFlags(featureFlags, options = {}) {
  const { appScheme = DEFAULT_E2E_APP_SCHEME } = options;
  await device.openURL({
    url: buildQuietRoomFeatureFlagsUrl(featureFlags, appScheme),
  });
}

async function waitForExistsMaybe(elementHandle, timeoutMs) {
  try {
    await waitFor(elementHandle).toExist().withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function acceptAiConsentIfVisible(timeoutMs = 4000) {
  const consentModal = element(by.id(ids.aiConsentModal));
  const consentVisible = await waitForExistsMaybe(consentModal, timeoutMs);

  if (!consentVisible) {
    return false;
  }

  await element(by.id(ids.aiConsentAcceptButton)).tap();
  await element(by.text('I Consent')).tap().catch(() => null);
  if (device.getPlatform() === 'ios') {
    await element(by.label('I Consent')).tap().catch(() => null);
  }
  await waitFor(consentModal).not.toExist().withTimeout(15000);
  return true;
}

async function ensureGuestSession() {
  const conversationsButton = element(by.id(ids.conversationsButton));
  const signedIn = await waitForExistsMaybe(conversationsButton, 3000);
  if (!signedIn) {
    return;
  }

  await element(by.id(ids.profileButton)).tap();
  await waitFor(element(by.text('Logout'))).toExist().withTimeout(10000);
  await element(by.text('Logout')).tap();
  await waitFor(conversationsButton).not.toExist().withTimeout(30000);
}

async function openLoginModal() {
  await ensureGuestSession();
  await element(by.id(ids.profileButton)).tap();
  await waitFor(element(by.text('Signed in as Guest'))).toExist().withTimeout(10000);
  await waitFor(element(by.text('Sign In'))).toExist().withTimeout(10000);
  await element(by.text('Sign In')).tap();
  await waitFor(element(by.id(ids.loginModal))).toBeVisible().withTimeout(10000);
}

async function dismissIosPasswordSavePromptIfPresent() {
  if (device.getPlatform() !== 'ios') {
    return;
  }

  const deadline = Date.now() + 12000;

  while (Date.now() < deadline) {
    const notNowButtonByLabel = element(by.label('Not Now'));
    const notNowButtonByText = element(by.text('Not Now'));
    const savePasswordPromptByLabel = element(by.label('Save Password?'));
    const savePasswordPromptByText = element(by.text('Save Password?'));

    const hasNotNowButton =
      (await waitForExistsMaybe(notNowButtonByLabel, 500)) ||
      (await waitForExistsMaybe(notNowButtonByText, 500));
    const hasSavePasswordPrompt =
      (await waitForExistsMaybe(savePasswordPromptByLabel, 500)) ||
      (await waitForExistsMaybe(savePasswordPromptByText, 500));

    if (hasNotNowButton || hasSavePasswordPrompt) {
      await notNowButtonByLabel.tap().catch(async () => {
        await notNowButtonByText.tap();
      });
      await waitFor(savePasswordPromptByLabel).not.toExist().withTimeout(10000).catch(() => null);
      await waitFor(savePasswordPromptByText).not.toExist().withTimeout(10000).catch(() => null);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function loginWithKnownAccount() {
  const conversationsButton = element(by.id(ids.conversationsButton));
  const alreadySignedIn = await waitForExistsMaybe(conversationsButton, 3000);
  if (alreadySignedIn) {
    return getE2ECredentials();
  }

  const credentials = getE2ECredentials();
  await openLoginModal();
  await element(by.id(ids.loginEmailInput)).replaceText(credentials.email);
  if (device.getPlatform() === 'ios') {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await element(by.id(ids.loginPasswordInput)).replaceText(credentials.password);
  await element(by.id(ids.loginSigninButton)).tap();
  await waitFor(element(by.id(ids.loginModal))).not.toExist().withTimeout(15000).catch(() => null);
  await waitFor(conversationsButton).toExist().withTimeout(60000);
  await dismissIosPasswordSavePromptIfPresent();
  return credentials;
}

async function loginWithEmailCredentials(credentials) {
  await openLoginModal();
  await element(by.id(ids.loginEmailInput)).replaceText(credentials.email);
  if (device.getPlatform() === 'ios') {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await element(by.id(ids.loginPasswordInput)).replaceText(credentials.password);
  await element(by.id(ids.loginSigninButton)).tap();
  await waitFor(element(by.id(ids.loginModal))).not.toExist().withTimeout(15000).catch(() => null);
  await waitFor(element(by.id(ids.conversationsButton))).toExist().withTimeout(60000);
  await dismissIosPasswordSavePromptIfPresent();
  return credentials;
}

async function createDisposableTestUser() {
  return backendRequest('/test/create-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

async function seedConversations({ uid, token, count, navigationFixture = false }) {
  return backendRequest('/test/seed-conversations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      count,
      navigationFixture,
      uid,
    }),
  });
}

async function fetchUserData({ uid }) {
  const query = new URLSearchParams({ uid }).toString();
  return backendRequest(`/test/user-data?${query}`);
}

async function fetchReports({ uid }) {
  const query = new URLSearchParams({ uid }).toString();
  return backendRequest(`/test/reports?${query}`);
}

async function waitForUserConsentState({ uid, aiSharingAccepted, timeoutMs = 10000, intervalMs = 500 }) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const userData = await fetchUserData({ uid });
    if (userData?.consentState?.aiSharingAccepted === aiSharingAccepted) {
      return userData;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const lastUserData = await fetchUserData({ uid });
  throw new Error(
    `Timed out waiting for consent state ${aiSharingAccepted} for ${uid}: ${JSON.stringify(lastUserData)}`
  );
}

async function configureAccountDeletionMode({ uid, mode }) {
  return backendRequest('/test/account-deletion-mode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uid,
      mode,
    }),
  });
}

async function configureAiConsent({ uid, aiSharingAccepted, source }) {
  return backendRequest('/test/ai-consent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uid,
      aiSharingAccepted,
      source,
    }),
  });
}

module.exports = {
  acceptAiConsentIfVisible,
  buildQuietRoomFeatureFlagsUrl,
  configureAiConsent,
  configureAccountDeletionMode,
  createDisposableTestUser,
  fetchReports,
  fetchUserData,
  dismissIosPasswordSavePromptIfPresent,
  ensureGuestSession,
  getE2ECredentials,
  getBackendConfig,
  launchQuietRoom,
  loginWithEmailCredentials,
  loginWithKnownAccount,
  openLoginModal,
  seedConversations,
  updateQuietRoomFeatureFlags,
  waitForUserConsentState,
  waitForExistsMaybe,
};
