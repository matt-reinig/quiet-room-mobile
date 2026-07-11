# QR-MOB-032 Investigation

## Scope

This task verifies the ordinary valid-anonymous-session path after a full app
termination and relaunch. QR-MOB-031's deleted-user recovery path remains a
separate boundary: a deleted UID must receive a new identity and must not
recover the deleted UID's history.

## Classification

The mobile Firebase setup already uses React Native `AsyncStorage` persistence
and `ensureAuth()` waits for `auth.authStateReady()`. A valid anonymous user can
therefore be restored by Firebase across a normal process restart.

The observed fresh-session behavior was caused by the mobile chat controller,
not by the Firebase persistence configuration. Before this task, the anonymous
branch of `useChatController` deliberately cleared the conversation map, set
the current conversation to `null`, marked the list hydrated, and skipped both
conversation-list and conversation-detail requests. A restored anonymous UID
could therefore be valid while the UI still presented a blank new chat.

The corrected startup path is:

1. Firebase restores or creates the current user.
2. The controller fetches `/api/conversations` using that user's token for both
   registered and anonymous users.
3. The controller first restores the per-UID active conversation ID when it is
   still present in the returned list.
4. Otherwise it selects the deterministically newest conversation by
   `updatedAt`, then `createdAt`, then ID.
5. The selected conversation's messages load through the UID-authorized detail
   endpoint.

This separates the three behaviors required by the plan:

- identity persistence is owned by Firebase Auth persistence;
- conversation persistence is owned by the backend conversation records;
- active-conversation restoration is owned by the UID-scoped AsyncStorage key,
  with newest-conversation fallback when the remembered conversation is gone.

## Safety boundaries

- The active-conversation key is namespaced by Firebase UID.
- Conversation list and detail requests remain authorized by the current
  user's token; a remembered ID is used only when it appears in that user's
  returned list.
- QR-MOB-031's recovery guard still prevents a UID-change render from clearing
  the locally constructed recovery conversation before the triggering send
  finishes.
- Registered-user behavior is no longer excluded from the shared loading path,
  and the stale-session recovery helper still only replaces anonymous users.
- Explicit New Conversation behavior is unchanged.

## Automated coverage

`e2e/quiet-room.anonymous-continuity.test.js` performs a release-style flow
with three consecutive cold relaunch cycles:

1. starts with cleared app data;
2. sends a unique guest message and waits for the assistant response;
3. fully terminates the app without clearing data;
4. relaunches and asserts the prior user and assistant messages are present;
5. sends the next message in the restored conversation and waits for its
   response;
6. repeats the terminate/relaunch/continue sequence two more times.

The test deliberately uses `launchQuietRoom()` without `delete: true` for every
relaunch so Firebase Auth and AsyncStorage persistence are retained.

## Verification so far

- `npm ci` completed and applied the tracked Track Player patch.
- `npm run typecheck` passed.
- `MOBILE_ENV_BASE_FILE=../worktrees/quiet-room-mobile-qr-mob-031-qa-release/.env npm run mobile:verify:qa` passed with the QA API, Firebase project, and no auth-emulator host.

Android QA repetition and the final QA artifact are recorded in
`qa-proof.md`; the accepted QA release flow passed three consecutive relaunch
cycles without clearing app data.
