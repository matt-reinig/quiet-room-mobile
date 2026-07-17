# QR-MOB-036 – Smooth Logout-to-Guest Transition

## Goal

Make logout feel like one deliberate transition from a registered account to the replacement guest session, without briefly rendering an empty conversation, switching to a second loading screen, or exposing content from the account that just signed out.

## Reported Behavior

When a registered user taps **Logout**, the app currently appears to:

1. log out and immediately show an empty conversation screen;
2. replace that screen with a loading indicator; and
3. finally render the real guest screen.

This creates a visually unstable handoff even when authentication succeeds.

## Current Technical Finding

The sequence is explained by three independently managed state transitions on current `develop`:

1. `QuietRoomScreen.handleContinueAsGuest()` closes the profile menu and starts `logout()` without awaiting or representing the transition in screen state.
2. `resetToAnonymousSession()` calls Firebase `signOut(auth)` and then `signInAnonymously(auth)`. The auth subscription observes the real intermediate `user = null` event.
3. While `user` is null, `useChatController` clears conversations and `shouldBlockForConversations` is false, so the normal chat shell renders with no active conversation. Once the new anonymous user arrives, conversation hydration begins and `shouldBlockForConversations` becomes true, replacing the empty shell with the full-screen **Preparing messages...** indicator. The final guest UI renders only after hydration completes.

The issue is therefore a client-side transition-coordination gap, not evidence that logout failed or that a backend response is returning an empty conversation.

## Intended Product Behavior

- Tapping **Logout** immediately dismisses the profile menu and enters one stable, intentional transition state.
- The prior registered conversation is no longer visible after logout begins.
- Firebase may still pass through `user = null` internally, but that implementation detail must not render as an empty chat screen.
- The same transition surface remains visible until the replacement anonymous identity and the guest conversation decision are ready.
- The guest destination follows existing QR-MOB-032 behavior: restore that anonymous UID's remembered/recent conversation when one exists; otherwise show the normal new-guest conversation state.
- The transition should not bounce between differently worded full-screen loaders.

## Proposed Implementation Boundary

Use an explicit logout/session-transition state shared across the auth and chat readiness boundary. The final implementation may keep that state in `AuthContext` or coordinate it at the app/screen gate, but it must not infer completion from only `signInAnonymously()` returning. Completion means both of these are true:

1. the replacement anonymous user is the resolved auth user; and
2. `useChatController` has completed the initial conversation hydration decision for that user.

Prefer one app-level transition surface over clearing and remounting multiple unrelated screens. Keep the existing Firebase sign-out/sign-in semantics unless implementation evidence shows a narrower auth change is necessary.

Likely files:

- `src/contexts/AuthContext.tsx`
- `src/lib/firebase.ts`
- `src/hooks/useChatController.ts`
- `src/screens/QuietRoomScreen.tsx`
- `src/components/FeatureFlagsGate.tsx` only if loader ownership is consolidated there
- `src/testIds.ts` and `e2e/testIds.js`
- a focused Detox logout-transition spec or focused additions to account/auth coverage

## Error Behavior

- If sign-out or replacement anonymous sign-in fails, do not leave the app permanently blocked behind a spinner.
- Do not silently display stale registered conversation content as if it belonged to the guest.
- Surface a retryable, user-readable error with a safe retry path.
- Preserve the actual resolved Firebase user state; do not claim guest mode until anonymous sign-in has succeeded.

## Constraints

- Keep this mobile-only unless new evidence proves a backend change is required.
- Preserve QR-MOB-031 stale-anonymous-session recovery behavior.
- Preserve QR-MOB-032 anonymous UID and active-conversation persistence behavior.
- Preserve registered-user logout semantics, including native Google sign-out on Android.
- Do not delete the registered account or its conversations.
- Do not show registered conversation content after logout begins.
- Do not solve the visual issue with arbitrary delays.
- Do not change QA or production store state without separate approval.

## Success Criteria

1. From a registered account with a visible existing conversation, tapping **Logout** never renders an empty normal chat shell between identities.
2. The logout flow shows at most one intentional transition surface before the final guest screen.
3. No registered message, conversation title, profile state, or registered-only control is visible after logout begins.
4. The final screen belongs to the newly resolved anonymous Firebase user.
5. An anonymous user with restorable history lands on the conversation selected by existing QR-MOB-032 rules; a guest without history lands on the normal new-chat state.
6. Logout failure and anonymous-sign-in failure both exit the busy state through a clear retryable error path.
7. Repeated logout trials pass on Android and iOS without intermediate empty-chat frames or loader-to-loader flicker.
8. Focused automated coverage captures the visible state sequence and fails against the current behavior before passing with the fix.
9. Existing anonymous recovery, cold-relaunch continuity, account deletion, login, and conversation-hydration checks continue to pass.

## Verification Plan

- Add a deterministic test hook/test ID for the single transition surface and assert the allowed visible-state sequence.
- In Detox, sign in with a disposable registered user, open or seed a visible conversation, tap logout, and sample/assert throughout the transition:
  - registered content disappears immediately;
  - the transition surface remains stable;
  - the ordinary empty chat shell is never visible during the handoff;
  - the final guest UI is usable.
- Run the focused test on Android and iOS release configurations.
- Run the existing account-deletion and anonymous-continuity coverage as regressions.
- Record exact commands, results, and artifact paths in this task's documentation before marking the tracker item done.

## Out of Scope

- Redesigning the login/profile menu.
- Changing anonymous retention policy or cleanup behavior.
- Deleting or merging conversation history across registered and anonymous identities.
- Backend auth or conversation API changes without evidence they are required.
- QA store deployment or production release.
