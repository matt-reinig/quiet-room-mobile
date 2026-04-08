# Mobile iOS Simulator Testing Plan

This is the follow-on plan for getting iOS simulation and testing to the same general level as the current Android workflow in `quiet-room-mobile`.

The goal is not to build a separate iOS-only process.
The goal is to extend the current Expo + selector + Detox workflow so the same app behaviors can be verified on both platforms.

## Current reality

### Machine state on this Mac

As of 2026-04-03:

- `xcode-select -p` points at `/Library/Developer/CommandLineTools`
- `xcodebuild` is unavailable because full Xcode is not active
- `xcrun simctl` is unavailable
- `pod` is not installed

That means this Mac cannot run an iOS simulator yet.

### Repo state

What already exists:

- Expo app config includes an iOS target in `app.json`
- package scripts already include `npm run ios`
- local dev API defaults are already iOS-aware in `src/config/env.ts`
  - Android uses `http://10.0.2.2:5000`
  - iOS uses `http://localhost:5000`
- Detox tests already target stable `testID` selectors
- `.detoxrc.js` is already Mac-friendly, but only for Android

What is missing today:

- no checked-in local `ios/` native project
- no iOS Detox app/device/config entries
- no local `GoogleService-Info.plist`
- no iOS-specific app bootstrap notes

Important auth note:

- native Google sign-in setup is currently more complete on Android than iOS
- the env layer already exposes `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- the repo still needs iOS-native Firebase/Google config if full native Google sign-in is required on the simulator

Because of that, first-pass iOS testing should focus on:

- app launch
- guest flow
- email/password flow
- chat/send/layout behavior

Do not make native Google sign-in the phase-one blocker unless that is the exact feature you need to validate.

## Recommended phases

## Phase 1: Toolchain bring-up

Goal:

- make this Mac capable of launching an iOS simulator from the repo

Checklist:

1. Install the full Xcode app.
2. Switch the active developer directory to Xcode:
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
3. Launch Xcode once and finish the first-run setup.
4. Install at least one simulator runtime in Xcode Settings.
5. Install CocoaPods.
6. Verify:
   - `xcodebuild -version`
   - `xcrun simctl list devices available`
   - `pod --version`

Acceptance:

- `xcodebuild` works
- `simctl` lists available devices
- CocoaPods works

### Copy/paste commands

Use these in order on this Mac:

1. Install Xcode from the App Store.
2. Then run:

```zsh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
```

3. Open Xcode and install an iOS runtime in `Xcode` -> `Settings` -> `Platforms`.
4. Install CocoaPods:

```zsh
/opt/homebrew/bin/brew install cocoapods
```

5. Verify:

```zsh
xcode-select -p
xcodebuild -version
xcrun simctl list devices available
pod --version
```

Expected direction of travel:

- `xcode-select -p` should become `/Applications/Xcode.app/Contents/Developer`
- `xcodebuild -version` should print an Xcode version instead of the Command Line Tools error
- `xcrun simctl list devices available` should list simulator devices
- `pod --version` should print a version instead of `command not found`

## Phase 2: Generate and launch the iOS native app

Goal:

- prove the app can boot on an iOS simulator before adding automation

Recommended path:

1. Keep `quiet-room-mobile/.env` pointed at QA first.
2. From `quiet-room-mobile`, generate or refresh native iOS state with Expo:
   - `npx expo run:ios`
   - or `npx expo prebuild --platform ios`
3. Let Expo create the local `ios/` directory.
4. Let CocoaPods install the native dependencies.
5. Launch on a single known simulator model and keep that model fixed while stabilizing the workflow.

Suggested first simulator target:

- a recent non-Pro iPhone model, such as `iPhone 16`

Why:

- consistent frame baselines help when converting layout tests
- smaller device classes reveal UI pressure faster than large Pro Max layouts

Acceptance:

- the app builds without native dependency errors
- the app opens on the simulator
- the initial shell loads against QA

### Copy/paste commands

After Phase 1 is complete:

```zsh
source ~/.zprofile
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/mjreinig/projects/Gabriel_App/quiet-room-mobile
/opt/homebrew/bin/npm install
/opt/homebrew/bin/npx expo run:ios --simulator "iPhone 16"
```

If Expo needs a more explicit prebuild path:

```zsh
source ~/.zprofile
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/mjreinig/projects/Gabriel_App/quiet-room-mobile
/opt/homebrew/bin/npx expo prebuild --platform ios
cd ios
pod install
cd ..
/opt/homebrew/bin/npx expo run:ios --simulator "iPhone 16"
```

If you want to see which simulator names are available first:

```zsh
xcrun simctl list devices available
```

## Phase 3: Manual simulator QA pass

Goal:

- verify the user-visible app behavior manually before trusting automation

First-pass checks:

- app launches to the main shell
- guest session works
- email sign-in modal opens
- composer can send a message
- assistant response renders
- voice playback button appears
- conversations panel opens
- crucifix modal opens and closes

Why this matters:

- it separates “Detox problem” from “real iOS app problem”
- it catches simulator-only UI issues early

Acceptance:

- one clean manual pass completes without platform-specific breakage

Suggested manual pass:

1. Confirm the shell opens.
2. Open the sign-in modal.
3. Stay on guest or use email/password, not Google, for the first iOS pass.
4. Send one message.
5. Confirm the assistant response appears.
6. Open and close the conversations panel.
7. Open and close the crucifix modal.

## Phase 4: Local backend validation on iOS

Goal:

- reproduce the Android local-backend workflow on the iOS simulator

Important difference from Android:

- the iOS simulator can use `http://localhost:5000`
- no `10.0.2.2` override is needed for simulator-to-host traffic

Recommended temporary override:

Create `quiet-room-mobile/.env.local` with:

```env
EXPO_PUBLIC_API_BASE=http://localhost:5000
EXPO_PUBLIC_STREAMING_BASE=
EXPO_PUBLIC_RENDER_MODE=native
```

Use the same backend-side Firebase alignment rules already documented for Android local testing.

Acceptance:

- `/api/feature_flags` succeeds
- `/api/chat/stream` succeeds
- `/api/voice_stream` succeeds
- one real chat roundtrip works from the simulator against the local backend

### Copy/paste commands

Backend terminal:

```zsh
cd /Users/mjreinig/projects/Gabriel_App/Gabriel
source .venv/bin/activate
export GABRIEL_ENV=qa
export FEATURE_FLAG_ENV=qa
export PROFILE_BUILDER_LAMBDA_URL=http://127.0.0.1:5000/internal/profile-builder
export STREAMING_LAMBDA_URL=http://127.0.0.1:5000/api/chat/stream
export BACKEND_LOG_PATH=logs/backend-dev.log
python gabriel_backend.py
```

Mobile override:

```zsh
cd /Users/mjreinig/projects/Gabriel_App/quiet-room-mobile
cat > .env.local <<'EOF'
EXPO_PUBLIC_API_BASE=http://localhost:5000
EXPO_PUBLIC_STREAMING_BASE=
EXPO_PUBLIC_RENDER_MODE=native
EOF
```

Run the iOS app again:

```zsh
source ~/.zprofile
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/mjreinig/projects/Gabriel_App/quiet-room-mobile
/opt/homebrew/bin/npx expo run:ios --simulator "iPhone 16"
```

Cleanup when done:

```zsh
cd /Users/mjreinig/projects/Gabriel_App/quiet-room-mobile
rm -f .env.local
```

## Phase 5: Detox iOS parity

Goal:

- extend the existing Detox suite to run on an iOS simulator

Recommended strategy:

- keep Detox as the single native E2E system
- add iOS configs to `.detoxrc.js`
- reuse the existing selector contract from `src/testIds.ts`
- reuse the existing tests where possible

Work to add:

1. Add an iOS app entry in `.detoxrc.js`.
2. Add an iOS simulator device entry.
3. Add at least one iOS configuration such as `ios.sim.debug`.
4. Add package scripts for iOS build and smoke runs.
5. Start with the smallest stable test set.

Best first tests for iOS:

- `e2e/quiet-room.smoke.test.js`
- `e2e/quiet-room.chat-layout.test.js`
- `e2e/quiet-room.conversations-menu.test.js`
- `e2e/quiet-room.crucifix-modal.test.js`

Tests likely to need iOS-specific adjustment:

- `e2e/quiet-room.login-layout.test.js`
  - it currently uses a hard-coded frame threshold and keyboard behavior assumptions that may need an iOS baseline
- `e2e/quiet-room.composer-flow.test.js`
  - keyboard lift measurements may differ on iOS
- `e2e/quiet-room.streaming-smoke.test.js`
  - likely worth adding after the simpler iOS cases are stable

Acceptance:

- `detox build` succeeds for iOS
- at least one smoke test passes on an iOS simulator
- at least one layout/interaction test passes on an iOS simulator

## Phase 6: Optional native auth parity

Goal:

- support iOS-native Google sign-in only if needed

Likely work:

- add local `GoogleService-Info.plist`
- make Expo config conditional for iOS service config the same way Android is handled now
- confirm iOS Google client ids are correct
- verify the chosen iOS auth path on simulator and device

This should be a separate task because it is not required for:

- simulator boot
- guest flows
- local backend wiring
- most layout and message-flow testing

## Recommended first implementation slice

If you want the lowest-risk path, do this in order:

1. Install full Xcode and CocoaPods.
2. Prove `npx expo run:ios` works on a simulator against QA.
3. Do one manual chat/send sanity pass.
4. Add `ios.sim.debug` to Detox.
5. Make `quiet-room.smoke.test.js` pass on iOS.
6. Add one more non-auth UI test.
7. Only then decide whether native Google sign-in is worth wiring now.

## Open risks

- The repo currently treats `/ios` as generated local state in `.gitignore`, so the team should decide later whether to keep iOS native files generated locally or check them in.
- iOS keyboard/layout baselines will differ from Android, so some Detox assertions should become platform-aware rather than sharing one hard-coded threshold.
- Native Google sign-in may require extra iOS-specific config that is intentionally absent from the repo today.

## Definition of done for “good enough iOS parity”

This effort is in a healthy place when all of these are true:

- the Mac can boot a simulator reliably
- `quiet-room-mobile` launches on iOS against QA
- the app can also hit a local backend from the iOS simulator
- Detox can run at least a smoke test and one interaction/layout test on iOS
- native Google sign-in is either working or explicitly deferred
