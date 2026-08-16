# QR-MOB-032: Verify Anonymous Session and Conversation Persistence

## Status

Backlog

## Priority

High

## Area

Accounts / anonymous session persistence

## Problem statement

Quiet Room is intended to let a person use the mobile app immediately through a persisted Firebase anonymous identity.

The expected product behavior is:

1. A person opens the app without signing in.
2. The app creates or restores an anonymous Firebase user.
3. The person sends a message and receives a response.
4. The person fully closes the app.
5. The person reopens the app.
6. The app restores the same anonymous identity and returns the person to the same existing conversation, with the prior messages visible.

A manual test on the QA mobile app did not produce that result. After sending a chat, closing the app, and reopening it, the app appeared to start a fresh session.

It is not yet known whether:

- Firebase restored a different anonymous UID;
- Firebase restored the same UID but the app created a new conversation;
- the same conversation still existed but was not selected or loaded;
- app termination, store-build behavior, feature-flag initialization, or another startup race changed the result;
- the behavior differs between Android and iOS.

## Relationship to QR-MOB-031

QR-MOB-031 verified recovery when backend retention deletes the current anonymous Firebase Auth user. It proved that the app can replace a stale anonymous identity and continue under exactly one new UID.

QR-MOB-031 did not conclusively prove the ordinary persistence flow where a valid anonymous user closes and reopens the app and should return to the same conversation.

This task must keep these concerns separate:

- **Identity persistence:** whether Firebase restores the same anonymous UID.
- **Conversation persistence:** whether conversations owned by that UID still exist.
- **Active-conversation restoration:** whether the app selects and displays the conversation that was active before termination.

## Product decision to verify

For a valid anonymous account that has not been deleted by retention, the desired behavior is:

- the anonymous UID persists across normal app restarts;
- previously stored conversations remain available to that UID;
- reopening the app returns to the most recently active conversation rather than silently starting a blank one;
- the prior user and assistant messages are visible;
- no new anonymous UID or conversation is created merely because the process was closed;
- explicit actions such as New Conversation, logout, account deletion, clearing app data, uninstalling, or retention deletion may intentionally create a new identity or conversation according to their own rules.

If the current implementation intentionally does something different, document that behavior and obtain an explicit product decision before preserving it.

## Phase 1: Reproduce and classify the QA observation

Use the current accepted QA store build on a real device first. Do not clear app data between the send and relaunch steps.

### Baseline procedure

1. Record platform, app version/build, Firebase project, and approximate timestamp.
2. Begin from an anonymous user.
3. Capture the current Firebase UID.
4. Capture the current conversation ID.
5. Send a unique marker message and wait for the assistant response.
6. Confirm both messages exist in Firestore under the recorded UID and conversation ID.
7. Fully terminate the app from the operating-system app switcher.
8. Reopen the app normally.
9. Capture the restored Firebase UID.
10. Capture the selected conversation ID after startup.
11. Check whether the marker conversation still exists in Firestore.
12. Record what is visible in the UI.

### Classification matrix

| UID after reopen | Marker conversation exists | Selected conversation | Meaning |
| --- | --- | --- | --- |
| Same UID | Yes | Same conversation | Expected behavior |
| Same UID | Yes | New/different conversation | Active-conversation restoration defect |
| Same UID | No | New conversation | Conversation storage or cleanup defect |
| Different UID | Old conversation still exists | New conversation | Anonymous Auth persistence defect |
| Different UID | Old user/conversation deleted | New conversation | Retention or cleanup unexpectedly ran |

Repeat at least three times on the affected QA platform. Then run one comparison on the other platform when available.

## Phase 2: Trace startup ownership and conversation selection

Inspect the startup path from Firebase restoration through chat initialization.

Relevant areas include:

- `src/lib/firebase.ts`
  - React Native Firebase persistence setup;
  - `auth.authStateReady()`;
  - `ensureAuth()`;
  - anonymous token refresh and stale-user classification.
- `src/contexts/AuthContext.tsx`
  - auth initialization;
  - `onIdTokenChanged` handling;
  - UID changes and loading state.
- `src/hooks/useChatController.ts`
  - initial conversation creation;
  - conversation list loading;
  - selection/reset behavior when UID changes or startup flags refresh.
- `src/screens/QuietRoomScreen.tsx`
  - screen initialization and current conversation wiring.
- conversation API and Firestore ownership rules in the Gabriel backend.
- any `AsyncStorage` keys or local state used to remember the active conversation.

Answer explicitly:

1. Is Firebase Auth persistence restoring the same anonymous user in the QA release build?
2. Does the mobile app persist the active conversation ID locally?
3. If not, how does it choose a conversation at launch?
4. Does startup always create a fresh conversation before existing conversations finish loading?
5. Can feature-flag refresh or auth initialization reset the chat after it was restored?
6. Does a force-refreshed anonymous token cause a false UID/session reset?
7. Are conversation records queried using the correct restored UID?
8. Is the most recent conversation ordering deterministic?

## Phase 3: Add diagnostic visibility

Add temporary or developer-only diagnostics sufficient to distinguish identity and conversation behavior.

Capture at minimum:

- app launch identifier;
- platform and build number;
- auth initialization start/end;
- current UID and `isAnonymous` state;
- whether Firebase restored an existing user or created a new one;
- conversation-list request start/end and count;
- previous locally remembered conversation ID, if one exists;
- selected conversation ID and selection reason;
- new-conversation creation and reason;
- UID changes during startup;
- feature-flag refresh effects on chat state.

Do not log message contents or sensitive profile data. UIDs and conversation IDs may be shortened or hashed in normal logs if needed.

## Phase 4: Implement the smallest correct fix

Choose the fix only after the failure is classified.

Potential fixes may include:

- correcting Firebase Auth persistence initialization;
- waiting for auth restoration before chat initialization;
- preventing eager creation of a new conversation while existing conversations load;
- persisting the active conversation ID per UID;
- restoring that conversation only when it still belongs to the current UID and exists;
- otherwise selecting the most recently updated conversation;
- making chat resets dependent on a real UID change rather than generic startup refreshes;
- preventing feature-flag refresh from replacing a successfully restored chat.

Safety rules:

- Never load a conversation belonging to a different UID.
- Never treat a registered-user auth failure as permission to create an anonymous identity.
- Do not make deleted-anonymous-session recovery reopen history belonging to the deleted UID.
- Do not create duplicate conversations during concurrent startup effects.
- Explicit New Conversation behavior must remain unchanged.

## Phase 5: Automated coverage

Add focused tests that distinguish auth persistence from conversation restoration.

### Required tests

1. **Valid anonymous cold relaunch**
   - create one anonymous user;
   - create a conversation with a unique marker;
   - terminate and relaunch without clearing data;
   - assert the UID is unchanged;
   - assert the same conversation and messages are visible.

2. **No duplicate startup conversation**
   - relaunch with an existing conversation;
   - assert startup does not create an extra blank conversation.

3. **Explicit new conversation**
   - verify the user can intentionally start a new conversation after restoration.

4. **Deleted anonymous user**
   - preserve the QR-MOB-031 expectation: a deleted Auth user receives one new UID and a fresh conversation.

5. **Registered user**
   - verify registered-user persistence remains unchanged and never downgrades silently.

Prefer a real release-style QA Detox test for UI restoration plus a lower-level Firebase emulator test for UID persistence and startup concurrency.

Important: Detox launch helpers often clear app state by default. This test must use a relaunch mode that preserves application data and Firebase persistence between launches.

## Phase 6: QA acceptance proof

Run the final build on at least the originally affected QA platform.

Capture:

- build/version;
- UID before and after process termination;
- conversation ID before and after;
- Firestore proof that the marker conversation persisted;
- screenshot before termination;
- screenshot after relaunch showing the same messages;
- confirmation that no extra anonymous user or blank conversation was created.

Run the flow three consecutive times without clearing app data.

When practical, perform one smoke pass on the other mobile platform.

## Success criteria

This task is complete when:

- the intended anonymous persistence behavior is explicitly confirmed;
- the original QA observation is reproduced or convincingly explained;
- it is known whether the failure was identity persistence, data persistence, or conversation selection;
- a valid anonymous user retains the same UID across app termination and relaunch;
- the most recently active conversation reopens with its existing messages visible;
- startup does not create an unintended blank conversation;
- QR-MOB-031 deleted-user recovery still creates exactly one fresh identity;
- registered-user behavior does not regress;
- automated coverage preserves both normal persistence and stale-session recovery;
- real-device QA evidence is recorded in this folder.

## Expected deliverables

- investigation notes in `docs/qr-mob-032-anonymous-session-persistence/investigation.md`;
- final QA proof in `docs/qr-mob-032-anonymous-session-persistence/qa-proof.md`;
- focused automated tests;
- implementation changes only after the observed behavior is classified;
- an update to `docs/anonymous-session-behavior.md` if the confirmed product rule changes;
- a completion update in `docs/project-tracker.md`.
