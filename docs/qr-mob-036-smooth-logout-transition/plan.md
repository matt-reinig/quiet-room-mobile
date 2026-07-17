# QR-MOB-036 – Implementation Plan

## Outcome

Treat registered-user logout as one identity transition that begins on the logout tap and ends only when the replacement anonymous user, that user's feature flags, and that user's conversation destination are ready. During that interval, render one stable **Switching to guest...** surface and keep the registered and partially hydrated guest screens hidden.

This remains a mobile-only change. Firebase can continue to emit its real intermediate `user = null` state; the UI will stop treating that internal state as a renderable destination.

## Readiness Contract

The transition must follow this state sequence:

| Phase | Auth state | Guest flags | Guest conversations | Visible UI |
| --- | --- | --- | --- | --- |
| Idle | Registered user | Registered-user values | Registered conversation | Normal registered screen |
| Signing out | Registered or null | Not relevant | Old data clearing underneath | One logout transition surface |
| Establishing guest | Anonymous target UID known | Loading/resetting | Loading/resetting | The same transition surface |
| Guest hydration | Anonymous target UID resolved | Ready or failed safely to defaults for that UID | List and selected conversation resolved for that UID | The same transition surface |
| Complete | Anonymous target UID resolved | Ready for target UID | Ready for target UID | Final guest screen |
| Failed | Registered, null, or anonymous state reconciled from Firebase | Not assumed ready | Not assumed ready | Retryable transition error; no chat content |

Completion must be keyed to the anonymous UID returned by the current logout attempt. A stale request or readiness result from the registered UID or an earlier attempt must not complete the transition.

## Implementation Steps

### 1. Establish a failing baseline

1. Make this worktree runnable using `docs/privacy-v2/10-quiet-room-mobile-worktree-setup-guide.md`: install dependencies, copy the existing ignored local QA/Firebase/signing inputs, verify local-QA config, and regenerate native projects rather than copying `ios/` or `android/`.
2. Add a focused `e2e/quiet-room.logout-transition.test.js` that signs in a disposable registered user, seeds or opens recognizable registered content, taps Logout, and observes the transition to guest.
3. Add stable test IDs for the ordinary chat shell, conversation-preparation surface, and logout-transition surface. Keep the production UI unchanged at this step.
4. Capture the current failure on at least Android: the normal empty chat shell becomes visible before **Preparing messages...**. Save the Detox logs and screenshots as baseline evidence.

The baseline is important because a final test that only waits for the guest screen could pass against today's flickering behavior.

### 2. Add an explicit auth transition state

In `src/contexts/AuthContext.tsx`, keep login-form busy state separate from a new identity-transition state. Use a discriminated state shaped approximately like:

```ts
type SessionTransition =
  | { kind: "logout_to_guest"; phase: "auth"; attemptId: number }
  | { kind: "logout_to_guest"; phase: "hydrating"; attemptId: number; targetUid: string }
  | { kind: "logout_to_guest"; phase: "error"; attemptId: number; message: string }
  | null;
```

Expose the transition, a retry action, and a guarded completion action through `useAuth()`.

The logout operation should:

1. allocate a new attempt ID and enter `auth` before awaiting Firebase;
2. call the existing `resetToAnonymousSession()` path;
3. reconcile the returned anonymous user with the normal auth subscription;
4. enter `hydrating` with the returned anonymous UID;
5. catch anonymous-sign-in failures and enter `error` instead of leaving `loading` stuck;
6. ignore completion/error callbacks from superseded attempt IDs.

Keep `src/lib/firebase.ts` responsible for Firebase and native Google sign-out mechanics. Do not hide the temporary null Firebase user or preserve the registered user artificially; the presentation layer should own visual continuity.

### 3. Make feature-flag readiness identity-aware

`FeatureFlagsContext` currently preserves initialized values while it refreshes for a changed user. That can allow registered-user flag values to appear briefly for the guest.

Update `src/contexts/FeatureFlagsContext.tsx` to track which UID its current result belongs to:

- clear user-specific values and reasons when the UID changes;
- expose a `readyUserUid` or equivalent identity-aware readiness value;
- set readiness for the target UID after a successful fetch;
- on fetch failure, install safe defaults and mark the target UID ready so logout does not hang indefinitely;
- prevent a late response for the prior UID from overwriting the target UID's state.

While a logout transition is active, `FeatureFlagsGate` must not replace the transition with **Loading settings...** or prevent `QuietRoomScreen` from mounting and hydrating. Let the screen-level transition surface take visual priority.

### 4. Make conversation readiness identity-aware

Extend `useChatController` with a readiness value tied to the UID whose data was loaded, for example `readyUserUid`.

Readiness for a UID means:

- the initial conversation-list request completed or failed into the existing safe empty state;
- the active conversation selection decision completed;
- if a conversation was selected, its messages finished loading or failed into a usable, non-spinning state;
- no request from a previous UID can mark the new UID ready.

Clear the readiness owner immediately when `user?.uid` changes. Preserve all QR-MOB-031 anonymous-recovery and QR-MOB-032 remembered-conversation behavior; this step reports when those paths are settled rather than changing their selection rules.

Use request IDs or cancellation checks already present in the hook to ensure a registered-user response cannot repopulate state after logout.

### 5. Render one transition surface and complete atomically

In `QuietRoomScreen`:

1. continue invoking `useChatController` during the transition so guest hydration can run underneath;
2. render the logout transition surface before the existing `shouldBlockForConversations` branch;
3. hide all registered and guest chat content while the transition is active;
4. complete the transition only when:
   - `user.uid` equals the transition's anonymous `targetUid`;
   - `user.isAnonymous` is true;
   - feature flags are ready for that UID; and
   - chat/conversation state is ready for that UID;
5. render the final guest screen on the next state change without showing **Preparing messages...** in between.

Use a small reusable transition component with:

- spinner and **Switching to guest...** during `auth` and `hydrating`;
- a stable test ID;
- a concise error message and Retry button during `error`;
- normal safe-area handling on Android and iOS.

The logout press handler should await or explicitly catch `logout()` so rejected promises cannot become unhandled.

### 6. Add deterministic failure coverage

Add narrowly scoped Detox-only failure controls for these cases:

- replacement anonymous sign-in fails after the registered session has signed out;
- the first attempt fails and Retry succeeds;
- feature-flag loading fails and safely resolves to defaults;
- conversation-list or selected-conversation loading fails without leaving the transition stuck.

Prefer launch arguments or an existing test endpoint over production delays. Any client-side failure hook must be inert unless a Detox session explicitly enables it. Do not add arbitrary timing delays to the real logout path.

### 7. Refactor the existing helper and document evidence

Update `e2e/helpers.js::ensureGuestSession()` to wait for the new transition contract rather than merely waiting for the conversations button to disappear. This prevents unrelated tests from racing the guest bootstrap.

Add a repo-native runner, based on `scripts/run-android-account-deletion.sh`, for the focused local-QA logout test so API base, Auth emulator host, test key, native sync, build, and Detox invocation are reproducible.

Record implementation notes, exact commands, results, and artifact paths under `docs/qr-mob-036-smooth-logout-transition/verification.md` before changing the tracker to Done.

## Planned File Map

- `src/contexts/AuthContext.tsx`: transition state machine, retry, guarded completion, error handling.
- `src/lib/firebase.ts`: only minimal error propagation or test injection needed around the existing reset-to-anonymous operation.
- `src/contexts/FeatureFlagsContext.tsx`: UID-owned values and readiness.
- `src/components/FeatureFlagsGate.tsx`: prevent competing loader ownership during logout.
- `src/hooks/useChatController.ts`: UID-owned full conversation readiness.
- `src/screens/QuietRoomScreen.tsx`: readiness coordination and the single transition surface.
- `src/components/SessionTransitionView.tsx`: focused loading/error presentation if extraction keeps the screen readable.
- `src/testIds.ts` and `e2e/testIds.js`: transition and shell selectors.
- `e2e/quiet-room.logout-transition.test.js`: happy path, forbidden intermediate states, retry/error cases.
- `e2e/helpers.js`: readiness-aware `ensureGuestSession()`.
- `scripts/run-android-logout-transition.sh`: repeatable local-QA Android runner.
- `docs/qr-mob-036-smooth-logout-transition/verification.md`: final evidence.

## Verification Matrix

### Static and configuration checks

Run from this worktree:

```bash
npm install
npm run mobile:verify:local-qa
npm run typecheck
git diff --check
```

After native sync:

```bash
npm run native:sync:local-qa
```

Expected: local QA resolves to the QA Firebase project and local backend/Auth emulator endpoints; TypeScript and whitespace checks exit zero.

### Focused Android proof

Use the dedicated runner once added:

```bash
bash ./scripts/run-android-logout-transition.sh qa local android.att.release
```

Run at least ten logout cycles across the focused test. Each cycle must prove:

- the transition surface appears after the tap;
- registered content is immediately absent;
- the normal empty chat shell and **Preparing messages...** are never visible during the handoff;
- the transition surface does not disappear and reappear;
- the final guest screen is usable;
- the final authenticated UID is anonymous and is not the registered UID.

Capture all screenshots for the baseline and final focused run, not only failing screenshots.

### Focused iOS proof

With the same local-QA environment and regenerated iOS project:

```bash
bash ./scripts/with-mobile-env.sh qa local npx detox build -c ios.sim.release
bash ./scripts/with-mobile-env.sh qa local npx detox test -c ios.sim.release e2e/quiet-room.logout-transition.test.js --record-logs all --take-screenshots all
```

Repeat enough cycles to cover email/password logout and, where the simulator credentials permit, the Apple-authenticated presentation path. Verify safe-area layout and that the transition does not expose the iOS password-save prompt as an app-state failure.

### Failure and retry proof

For each controlled failure mode, verify:

- the spinner exits into the retryable error state within the bounded timeout;
- no registered conversation content returns;
- Retry creates a new attempt and stale callbacks from the failed attempt are ignored;
- successful retry reaches one final guest screen;
- feature-flag or conversation fallback does not leave a permanent loader.

### Regression suite

Run the focused adjacent flows on Android release configuration:

```bash
bash ./scripts/with-mobile-env.sh qa local npx detox test -c android.att.release \
  e2e/quiet-room.logout-transition.test.js \
  e2e/quiet-room.account-deletion.test.js \
  e2e/quiet-room.anonymous-continuity.test.js \
  e2e/quiet-room.auth-persistence.test.js \
  --record-logs all --take-screenshots failing
```

Run at least logout transition, anonymous continuity, and auth persistence on iOS release configuration as well.

The regression evidence must confirm:

- QR-MOB-031 recovery does not silently downgrade registered failures;
- QR-MOB-032 still restores the remembered/recent guest conversation on cold relaunch;
- account deletion still ends in a valid anonymous session;
- registered auth still persists across cold relaunch until explicit logout;
- subsequent login after logout still works.

### Manual visual review

On one Android emulator/device and one iOS simulator/device:

1. begin from a registered account with recognizable conversation content;
2. record the screen while tapping Logout;
3. confirm there is one stable transition surface with no empty-chat frame or loader wording change;
4. confirm the correct guest destination and usable composer;
5. repeat with a guest UID that has remembered history and one with no history.

Automated assertions are the release gate; manual video is supporting evidence for the absence of single-frame flicker.

## Completion Gate

QR-MOB-036 can move to Done only when:

1. the current behavior is captured as failing baseline evidence;
2. the implementation follows the UID-keyed readiness contract;
3. focused Android and iOS release-config tests pass;
4. failure/retry coverage proves the UI cannot remain stuck;
5. adjacent auth, deletion, recovery, and anonymous-continuity regressions pass;
6. `verification.md` contains exact commands and artifact paths;
7. no QA store upload, production deployment, backend mutation, or database mutation was performed without separate approval.
