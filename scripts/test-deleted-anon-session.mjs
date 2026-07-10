import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { deleteApp, initializeApp } = require("@firebase/app");
const {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getReactNativePersistence,
  initializeAuth,
  signInAnonymously,
  signOut,
} = require("../node_modules/@firebase/auth/dist/rn/index.js");

const PROJECT_ID = "demo-anon-deleted-session";
const API_KEY = "fake-api-key";
const AUTH_EMULATOR_ORIGIN = "http://127.0.0.1:9099";

function createAsyncStorage() {
  const store = new Map();

  return {
    async setItem(key, value) {
      store.set(key, String(value));
    },
    async getItem(key) {
      return store.get(key) ?? null;
    },
    async removeItem(key) {
      store.delete(key);
    },
    dump() {
      return Object.fromEntries(store);
    },
  };
}

function initAuth(appName, asyncStorage) {
  const app = initializeApp(
    {
      apiKey: API_KEY,
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
    },
    appName
  );
  const auth = initializeAuth(app, { persistence: getReactNativePersistence(asyncStorage) });
  connectAuthEmulator(auth, AUTH_EMULATOR_ORIGIN, { disableWarnings: true });
  return { app, auth };
}

async function deleteViaEmulatorRest(idToken) {
  const response = await fetch(
    `${AUTH_EMULATOR_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) {
    throw new Error(`Emulator delete failed: ${response.status} ${await response.text()}`);
  }
}

async function currentEnsureAuthShape(auth) {
  await auth.authStateReady();

  if (auth.currentUser) {
    return auth.currentUser;
  }

  const credential = await signInAnonymously(auth);
  return credential.user;
}

async function getIdTokenWithAnonymousRecoveryForHarness(auth, user, forceRefresh = false) {
  const shouldForceRefresh = forceRefresh || user.isAnonymous;

  try {
    return {
      idToken: await user.getIdToken(shouldForceRefresh),
      recovered: false,
      user,
    };
  } catch (error) {
    if (!user.isAnonymous) {
      throw error;
    }

    await signOut(auth).catch(() => null);
    const credential = await signInAnonymously(auth);

    return {
      idToken: await credential.user.getIdToken(true),
      recovered: true,
      user: credential.user,
    };
  }
}

function errorSummary(error) {
  return {
    code: error?.code ?? null,
    message: error instanceof Error ? error.message : String(error),
    name: error?.name ?? null,
  };
}

async function main() {
  const sameProcessStorage = createAsyncStorage();
  const sameProcess = initAuth("same-process-initial", sameProcessStorage);
  const sameProcessCredential = await signInAnonymously(sameProcess.auth);
  const sameProcessDeletedUid = sameProcessCredential.user.uid;
  const sameProcessDeleteToken = await sameProcessCredential.user.getIdToken();

  await deleteViaEmulatorRest(sameProcessDeleteToken);

  const sameProcessUser = await currentEnsureAuthShape(sameProcess.auth);
  let sameProcessRefreshError = null;
  try {
    await sameProcessUser.getIdToken(true);
  } catch (error) {
    sameProcessRefreshError = errorSummary(error);
  }

  await deleteApp(sameProcess.app);

  const coldRelaunchStorage = createAsyncStorage();
  const beforeRelaunch = initAuth("cold-relaunch-before-delete", coldRelaunchStorage);
  const beforeRelaunchCredential = await signInAnonymously(beforeRelaunch.auth);
  const coldRelaunchDeletedUid = beforeRelaunchCredential.user.uid;
  const coldRelaunchDeleteToken = await beforeRelaunchCredential.user.getIdToken();

  await deleteViaEmulatorRest(coldRelaunchDeleteToken);
  await deleteApp(beforeRelaunch.app);

  const relaunched = initAuth("cold-relaunch-after-delete", coldRelaunchStorage);
  await relaunched.auth.authStateReady();
  const currentUidAfterAuthStateReady = relaunched.auth.currentUser?.uid ?? null;

  const relaunchedUser = await currentEnsureAuthShape(relaunched.auth);
  const currentUidAfterEnsureAuth = relaunched.auth.currentUser?.uid ?? null;
  let relaunchedRefreshError = null;
  try {
    await relaunchedUser.getIdToken(true);
  } catch (error) {
    relaunchedRefreshError = errorSummary(error);
  }

  const currentUidAfterFailedRefresh = relaunched.auth.currentUser?.uid ?? null;

  await signOut(relaunched.auth).catch(() => null);
  const recoveryCredential = await signInAnonymously(relaunched.auth);

  const runningRecoveryStorage = createAsyncStorage();
  const runningRecovery = initAuth("running-recovery-anonymous", runningRecoveryStorage);
  const runningRecoveryCredential = await signInAnonymously(runningRecovery.auth);
  const runningRecoveryDeletedUid = runningRecoveryCredential.user.uid;
  const runningRecoveryDeleteToken = await runningRecoveryCredential.user.getIdToken();

  await deleteViaEmulatorRest(runningRecoveryDeleteToken);

  const runningRecoveryResult = await getIdTokenWithAnonymousRecoveryForHarness(
    runningRecovery.auth,
    runningRecoveryCredential.user
  );
  const runningRecoveryTokenRefreshAfterRecovery =
    await runningRecoveryResult.user.getIdToken(true);

  const registeredStorage = createAsyncStorage();
  const registered = initAuth("registered-no-downgrade", registeredStorage);
  const registeredCredential = await createUserWithEmailAndPassword(
    registered.auth,
    `deleted-session-${Date.now()}@example.test`,
    "password"
  );
  const registeredDeletedUid = registeredCredential.user.uid;
  const registeredDeleteToken = await registeredCredential.user.getIdToken();

  await deleteViaEmulatorRest(registeredDeleteToken);

  let registeredRecoveryError = null;
  try {
    await getIdTokenWithAnonymousRecoveryForHarness(registered.auth, registeredCredential.user, true);
  } catch (error) {
    registeredRecoveryError = errorSummary(error);
  }

  const result = {
    sameProcess: {
      deletedUid: sameProcessDeletedUid,
      ensureAuthReturnedUid: sameProcessUser.uid,
      returnedDeletedUid: sameProcessUser.uid === sameProcessDeletedUid,
      forcedTokenRefreshError: sameProcessRefreshError,
    },
    coldRelaunch: {
      deletedUid: coldRelaunchDeletedUid,
      authStateReadyCurrentUid: currentUidAfterAuthStateReady,
      currentUidAfterEnsureAuth,
      ensureAuthReturnedUid: relaunchedUser.uid,
      returnedDeletedUid: relaunchedUser.uid === coldRelaunchDeletedUid,
      forcedTokenRefreshError: relaunchedRefreshError,
      currentUidAfterFailedRefresh,
    },
    manualRecoveryAfterSignOut: {
      newUid: recoveryCredential.user.uid,
      newUidDiffersFromDeletedUid: recoveryCredential.user.uid !== coldRelaunchDeletedUid,
      isAnonymous: recoveryCredential.user.isAnonymous,
    },
    runningAnonymousRecovery: {
      deletedUid: runningRecoveryDeletedUid,
      recovered: runningRecoveryResult.recovered,
      newUid: runningRecoveryResult.user.uid,
      newUidDiffersFromDeletedUid: runningRecoveryResult.user.uid !== runningRecoveryDeletedUid,
      isAnonymous: runningRecoveryResult.user.isAnonymous,
      tokenRefreshAfterRecoverySucceeded: Boolean(runningRecoveryTokenRefreshAfterRecovery),
    },
    registeredNoSilentDowngrade: {
      deletedUid: registeredDeletedUid,
      currentUserAfterFailureUid: registered.auth.currentUser?.uid ?? null,
      isAnonymousAfterFailure: registered.auth.currentUser?.isAnonymous ?? null,
      recoveryError: registeredRecoveryError,
    },
  };

  assert.equal(result.sameProcess.returnedDeletedUid, true);
  assert.equal(result.sameProcess.forcedTokenRefreshError?.code, "auth/invalid-refresh-token");
  assert.equal(result.coldRelaunch.authStateReadyCurrentUid, null);
  assert.equal(result.coldRelaunch.returnedDeletedUid, false);
  assert.equal(result.coldRelaunch.forcedTokenRefreshError, null);
  assert.equal(result.runningAnonymousRecovery.recovered, true);
  assert.equal(result.runningAnonymousRecovery.newUidDiffersFromDeletedUid, true);
  assert.equal(result.runningAnonymousRecovery.isAnonymous, true);
  assert.equal(result.runningAnonymousRecovery.tokenRefreshAfterRecoverySucceeded, true);
  assert.equal(result.registeredNoSilentDowngrade.isAnonymousAfterFailure, false);
  assert.equal(
    result.registeredNoSilentDowngrade.recoveryError?.code,
    "auth/invalid-refresh-token"
  );

  console.log(JSON.stringify(result, null, 2));

  await deleteApp(relaunched.app);
  await deleteApp(runningRecovery.app);
  await deleteApp(registered.app);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
