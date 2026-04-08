# Mobile iOS Google OAuth Plan

This is the follow-on slice for enabling Google OAuth on iOS in `quiet-room-mobile`.

It is related to Task 2, but it was not part of the original Task 2 acceptance bar.
Task 2 got the mobile app, Android flow, and iOS simulator into a healthy state first.
The iOS Google sign-in path was intentionally deferred until the simulator baseline was stable.

## Current state

What is already in place:

- the app already supports Google-to-Firebase login once it has a Google ID token
- Android already has a native Google sign-in path via `@react-native-google-signin/google-signin`
- iOS already has a browser-based Google auth path wired through `expo-auth-session/providers/google`
- the app scheme is already set to `quietroommobile`
- the generated local `ios/` project already exists on this Mac
- `app.config.js` already knows how to include a local `GoogleService-Info.plist` if we add one later

Current blockers in local state:

- `quiet-room-mobile/.env` is still missing `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `quiet-room-mobile/GoogleService-Info.plist` is still missing locally
- iOS Google sign-in has not been manually verified on the simulator yet

## Relevant code paths

- login UI and platform routing:
  - `src/components/LoginModal.tsx`
- Firebase auth handoff after Google returns an ID token:
  - `src/lib/firebase.ts`
- Google env wiring:
  - `src/config/env.ts`
- optional iOS native service-file pickup:
  - `app.config.js`

## First implementation slice

### 1. Add the missing iOS OAuth client id

Add this to local `quiet-room-mobile/.env`:

```env
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
```

Where it should come from:

- the iOS OAuth client for bundle id `com.quietroom.mobile`
- preferably from the same Firebase / Google project already used by the app

Notes:

- the current env already has Android and web Google client ids
- until the iOS client id is present, the iOS Google sign-in button should be treated as not ready

### 2. Decide whether to add local iOS Firebase native config now

If we want full Firebase-native iOS file parity, add a local:

- `quiet-room-mobile/GoogleService-Info.plist`

If we do add it:

- keep it local or secret-managed, not committed
- `app.config.js` will pick it up automatically if it exists at the repo root
- optionally point to a different local path with:
  - `EXPO_PUBLIC_IOS_GOOGLE_SERVICES_FILE=...`

### 3. Refresh the iOS native app after config changes

From `quiet-room-mobile`:

```zsh
/opt/homebrew/bin/npx expo prebuild --platform ios
cd ios
pod install
cd ..
/opt/homebrew/bin/npx expo run:ios --simulator "iPhone 17"
```

If the native project is already current, `expo run:ios` may be enough by itself.

### 4. Manually verify the iOS Google flow

First-pass verification:

1. Launch the app on the simulator.
2. Open the sign-in modal.
3. Confirm the Google button is enabled on iOS.
4. Complete Google sign-in.
5. Confirm Firebase auth now shows a non-anonymous user.
6. Close and relaunch the app to see whether the signed-in session restores as expected.

### 5. Add automation only after the manual pass works

Once manual verification is stable:

- add an iOS Detox auth smoke test
- keep the test focused on modal open -> Google auth start -> successful signed-in state
- if Google OAuth is flaky in automation, keep email/password and guest coverage passing and treat Google auth as a targeted follow-up

## Acceptance

This effort is in a good first-pass state when:

- the app has a valid `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- the Google sign-in button is enabled on iOS
- a simulator sign-in completes successfully
- Firebase receives the Google ID token and the app leaves anonymous auth
- sign-out still returns the app to anonymous auth cleanly

## Open questions

- whether `GoogleService-Info.plist` is needed immediately for our chosen iOS flow, or only for later native/EAS parity work
- whether the team wants to keep using the current browser-based iOS flow or switch to fully native iOS Google sign-in later
- whether iOS Google auth should remain a local/dev-only validation step for now or become part of Detox coverage
