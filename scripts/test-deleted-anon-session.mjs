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

let anonymousRecoveryPromise = null;
let anonymousTokenRequest = null;

async function getAnonymousIdTokenForHarness(user, forceRefresh) {
  if (anonymousTokenRequest?.uid === user.uid) {
    return anonymousTokenRequest.promise;
  }

  const promise = user.getIdToken(forceRefresh);
  const request = { promise, uid: user.uid };
  anonymousTokenRequest = request;

  try {
    return await promise;
  } finally {
    if (anonymousTokenRequest === request) {
      anonymousTokenRequest = null;
    }
  }
}

async function recoverAnonymousUserForHarness(auth, staleUser) {
  if (anonymousRecoveryPromise) {
    return anonymousRecoveryPromise;
  }

  const activeUser = auth.currentUser;

  if (activeUser && activeUser.uid !== staleUser.uid) {
    if (!activeUser.isAnonymous) {
      throw new Error("The authenticated user changed during anonymous session recovery.");
    }

    try {
      return {
        idToken: await getAnonymousIdTokenForHarness(activeUser, true),
        user: activeUser,
      };
    } catch {
      // A concurrently replaced anonymous user can itself be stale. Fall
      // through to one shared reset in that case.
    }
  }

  const recovery = (async () => {
    await signOut(auth).catch(() => null);
    const user = (await signInAnonymously(auth)).user;
    return {
      idToken: await getAnonymousIdTokenForHarness(user, false),
      user,
    };
  })();
  anonymousRecoveryPromise = recovery;

  try {
    return await recovery;
  } finally {
    if (anonymousRecoveryPromise === recovery) {
      anonymousRecoveryPromise = null;
    }
  }
}

async function getIdTokenWithAnonymousRecoveryForHarness(auth, user, forceRefresh = false) {
  const shouldForceRefresh = forceRefresh || user.isAnonymous;

  try {
    return {
      idToken: user.isAnonymous
        ? await getAnonymousIdTokenForHarness(user, shouldForceRefresh)
        : await user.getIdToken(shouldForceRefresh),
      recovered: false,
      user,
    };
  } catch (error) {
    if (!user.isAnonymous) {
      throw error;
    }

    const recovered = await recoverAnonymousUserForHarness(auth, user);

    return {
      idToken: recovered.idToken,
      recovered: true,
      user: recovered.user,
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

  const concurrentRecoveryStorage = createAsyncStorage();
  const concurrentRecovery = initAuth("concurrent-running-recovery", concurrentRecoveryStorage);
  const concurrentRecoveryCredential = await signInAnonymously(concurrentRecovery.auth);
  const concurrentRecoveryDeletedUid = concurrentRecoveryCredential.user.uid;
  const concurrentRecoveryDeleteToken = await concurrentRecoveryCredential.user.getIdToken();

  await deleteViaEmulatorRest(concurrentRecoveryDeleteToken);

  const concurrentRecoveryResults = await Promise.all(
    Array.from({ length: 4 }, () =>
      getIdTokenWithAnonymousRecoveryForHarness(
        concurrentRecovery.auth,
        concurrentRecoveryCredential.user
      )
    )
  );
  const concurrentRecoveryUids = [
    ...new Set(concurrentRecoveryResults.map((result) => result.user.uid)),
  ];

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
    concurrentAnonymousRecovery: {
      deletedUid: concurrentRecoveryDeletedUid,
      allCallersRecovered: concurrentRecoveryResults.every((result) => result.recovered),
      replacementUids: concurrentRecoveryUids,
      oneReplacementUid: concurrentRecoveryUids.length === 1,
      newUidDiffersFromDeletedUid:
        concurrentRecoveryUids.length === 1 &&
        concurrentRecoveryUids[0] !== concurrentRecoveryDeletedUid,
      activeUidMatchesReplacement:
        concurrentRecovery.auth.currentUser?.uid === concurrentRecoveryUids[0],
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
  assert.equal(result.concurrentAnonymousRecovery.allCallersRecovered, true);
  assert.equal(result.concurrentAnonymousRecovery.oneReplacementUid, true);
  assert.equal(result.concurrentAnonymousRecovery.newUidDiffersFromDeletedUid, true);
  assert.equal(result.concurrentAnonymousRecovery.activeUidMatchesReplacement, true);
  assert.equal(result.registeredNoSilentDowngrade.isAnonymousAfterFailure, false);
  assert.equal(
    result.registeredNoSilentDowngrade.recoveryError?.code,
    "auth/invalid-refresh-token"
  );

  console.log(JSON.stringify(result, null, 2));

  await deleteApp(relaunched.app);
  await deleteApp(runningRecovery.app);
  await deleteApp(concurrentRecovery.app);
  await deleteApp(registered.app);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
