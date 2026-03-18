const fs = require('fs');
const path = require('path');
const ids = require('./testIds');

let cachedCreds = null;

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

async function launchQuietRoom() {
  await device.launchApp({
    newInstance: true,
    launchArgs: {
      detoxEnableSynchronization: 0,
    },
  });

  await device.disableSynchronization();
}

async function waitForExistsMaybe(elementHandle, timeoutMs) {
  try {
    await waitFor(elementHandle).toExist().withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function ensureGuestSession() {
  const conversationsButton = element(by.id(ids.conversationsButton));
  const signedIn = await waitForExistsMaybe(conversationsButton, 3000);
  if (!signedIn) {
    return;
  }

  await element(by.id(ids.profileButton)).tap();
  await waitFor(element(by.text('Continue as Guest'))).toExist().withTimeout(10000);
  await element(by.text('Continue as Guest')).tap();
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

async function loginWithKnownAccount() {
  const conversationsButton = element(by.id(ids.conversationsButton));
  const alreadySignedIn = await waitForExistsMaybe(conversationsButton, 3000);
  if (alreadySignedIn) {
    return getE2ECredentials();
  }

  const credentials = getE2ECredentials();
  await openLoginModal();
  await element(by.id(ids.loginEmailInput)).replaceText(credentials.email);
  await element(by.id(ids.loginPasswordInput)).replaceText(credentials.password);
  await element(by.id(ids.loginSigninButton)).tap();
  await waitFor(element(by.id(ids.loginModal))).not.toExist().withTimeout(15000).catch(() => null);
  await waitFor(conversationsButton).toExist().withTimeout(60000);
  return credentials;
}

module.exports = {
  ensureGuestSession,
  getE2ECredentials,
  launchQuietRoom,
  loginWithKnownAccount,
  openLoginModal,
  waitForExistsMaybe,
};
