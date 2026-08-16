# Anonymous Session Behavior

## Purpose

Quiet Room should be usable immediately without requiring account creation. The mobile app therefore creates and persists a Firebase anonymous user as the default identity for a person who has not signed in.

This document defines the expected mobile behavior and the business rules that should remain true as authentication, retention, and account features evolve.

## Core product rules

1. **The app must open into a usable session without an account prompt.**
   - On first launch, the app creates a Firebase anonymous user.
   - The anonymous Firebase UID is the ownership key for conversations and other user-scoped data.

2. **An anonymous session should persist across normal app restarts.**
   - Firebase Auth state is persisted with React Native `AsyncStorage`.
   - Relaunching the app should reuse the same anonymous UID while that Firebase Auth user remains valid.
   - A normal restart must not create a new anonymous user simply because the app process ended.

3. **Only one active anonymous identity should be created for one recovery event.**
   - Token refresh and stale-session recovery are single-flight operations.
   - Concurrent API consumers must converge on the same replacement UID rather than creating multiple anonymous accounts.

4. **Registered accounts must never silently become anonymous.**
   - Automatic stale-session recovery applies only when the current Firebase user is anonymous.
   - Authentication failures for email, Google, or Apple users must surface as authentication failures.
   - A registered user may enter a new anonymous session only through an explicit product action such as logout or completed account deletion.

5. **Logging out intentionally starts a fresh anonymous session.**
   - Logout signs the registered user out and creates a new anonymous user.
   - The logged-out experience remains usable immediately.

6. **Deleting a registered account intentionally starts a fresh anonymous session.**
   - Account deletion is allowed only for a registered user.
   - After the backend account deletion succeeds, the app creates a new anonymous identity.

## Startup flow

On application startup:

1. Wait for Firebase Auth persistence to finish loading.
2. If a registered user exists, keep that user.
3. If an anonymous user exists, force-refresh its ID token to verify that the Firebase Auth record still exists.
4. If the anonymous token is valid, keep the same UID.
5. If the token fails with a recognized stale-session error, replace the deleted anonymous user with one new anonymous user.
6. If no Firebase user exists, restore a previous native Google session when available; otherwise create a new anonymous user.

The app remains on the initialization screen until this initial identity is resolved.

## Running-app stale-session recovery

The backend may delete old anonymous Firebase Auth users under a separate retention process. A mobile app can still be running with the deleted identity cached locally.

When an authenticated request needs a token:

1. Anonymous users receive a forced token refresh.
2. The following Firebase errors are treated as evidence that the anonymous identity is stale:
   - `auth/id-token-expired`
   - `auth/invalid-refresh-token`
   - `auth/invalid-user-token`
   - `auth/token-expired`
   - `auth/user-not-found`
   - `auth/user-token-expired`
3. The app signs out the stale identity and creates exactly one replacement anonymous user.
4. The failed operation may continue with the replacement user's token.
5. Auth-dependent UI updates to the replacement UID without unnecessarily unmounting an already initialized chat.
6. The message that triggered recovery and its response must remain visible when recovery succeeds.

## Data and conversation boundary

A replacement anonymous UID is a **new identity**, not a restoration of the deleted identity.

- Conversations and other data owned by the deleted UID are not migrated automatically.
- After recovery, the user begins a fresh conversation under the replacement UID.
- The client must not attach new messages to a conversation owned by the old UID.
- A successful recovery means the app is usable again; it does not mean anonymous history was recovered.

This loss boundary is acceptable only because anonymous sessions are temporary and are not guaranteed long-term storage. Any user-facing promise about durable history must be tied to a registered account and an explicitly implemented migration or linking flow.

## Retention and cleanup boundary

QR-MOB-031 implemented client recovery after an anonymous Firebase Auth user has already been deleted. It did **not** define or execute the full anonymous-user cleanup policy.

The retention system is a separate concern and must decide:

- how old an anonymous user must be before becoming eligible for deletion;
- which activity timestamp determines age;
- whether recent conversations or other data prevent deletion;
- which Firestore documents are deleted with the Auth user;
- dry-run, batch-size, observability, and rollback requirements;
- whether registered accounts are categorically excluded.

Until that policy is finalized, cleanup should remain guarded, targeted, observable, and incapable of deleting registered users.

## Account upgrade behavior

The current mobile sign-in methods authenticate with email, Google, or Apple credentials. They should be treated as a transition from the anonymous experience to a registered account, but the product must not assume that anonymous data is preserved unless an explicit link or migration succeeds.

Required rules for any future upgrade implementation:

- Never discard or overwrite registered-account data with anonymous data without an explicit merge policy.
- Do not claim that anonymous conversations will follow the user to the registered account unless this is tested and guaranteed.
- Handle credential collisions deliberately, especially when the target email or provider already belongs to an account.
- Make the final owning UID and migration result observable and testable.
- A failed upgrade must leave the user in a valid, understandable authentication state.

Defining and implementing the complete upgrade, retention, and cleanup lifecycle remains tracked separately under QR-MOB-011.

## Failure behavior

- Non-stale token or network errors should propagate normally; they must not create a replacement identity.
- A stale-session recovery failure should surface as an actionable request failure rather than looping indefinitely.
- The application must not repeatedly create anonymous users during one failed operation.
- If the authenticated user changes to a registered account while anonymous recovery is in flight, recovery must stop rather than replacing the registered user.

## Verification requirements

Changes to this behavior should cover at least:

- clean first launch creates one anonymous UID;
- cold relaunch preserves a valid anonymous UID;
- deleted anonymous user is replaced on cold launch;
- deleted anonymous user is replaced in the same running process;
- concurrent token consumers produce exactly one replacement UID;
- the replacement token successfully authenticates a request;
- registered-user token failures never silently downgrade to anonymous;
- logout creates a fresh anonymous session;
- successful registered-account deletion creates a fresh anonymous session;
- recovered chat remains mounted and shows the triggering message and response.

## Implementation references

- `src/lib/firebase.ts`
  - Firebase Auth persistence
  - startup authentication
  - stale anonymous-session error classification
  - single-flight token refresh and recovery
  - logout and post-deletion anonymous reset
- `src/contexts/AuthContext.tsx`
  - application auth state
  - UID changes and registered/anonymous state
  - initialization and explicit login/logout actions
- `docs/qr-mob-031-anonymous-session-recovery/qa-proof.md`
  - controlled same-process QA proof and accepted QA builds
- `docs/project-tracker.md`
  - QR-MOB-031 completion record
  - QR-MOB-011 broader anonymous lifecycle work
