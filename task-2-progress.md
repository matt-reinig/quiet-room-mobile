# Task 2 Progress

Goal: bring up `quiet-room-mobile` on this Mac against QA first, then move into Android emulator validation.

## Plan

- [x] Restore transferred mobile-only local files into the live repo.
- [x] Install JavaScript dependencies in `quiet-room-mobile`.
- [x] Clear app-level validation issues so the project typechecks cleanly.
- [ ] Install Android prerequisites on this Mac.
- [x] Install Android prerequisites on this Mac.
- [x] Launch Expo and generate/run the Android build on an emulator.
- [ ] Verify a basic QA-backed app flow.

## Status

- Restored `quiet-room-mobile/.env`.
- Restored `quiet-room-mobile/google-services.json`.
- Installed npm dependencies successfully with `/opt/homebrew/bin/npm install`.
- Confirmed the transferred mobile env points to QA/cloud endpoints for `EXPO_PUBLIC_API_BASE`, `EXPO_PUBLIC_STREAMING_BASE`, and `EXPO_PUBLIC_WEB_APP_URL`.
- Confirmed `app.config.js` resolves `./google-services.json` when present.
- Fixed the current TypeScript blocker in `src/components/MessageBubble.tsx` by removing stale props no longer accepted by `MessageVoiceButton`.
- Re-ran `npm run typecheck` successfully.
- Re-ran `npx expo config --json` successfully and confirmed `android.googleServicesFile=./google-services.json`.
- Confirmed this Mac is still missing the Android toolchain pieces we need for Task 2:
  - `adb`
  - Android Studio / Android SDK
  - a working JDK in `JAVA_HOME`
- Installed `watchman` with Homebrew.
- Installed `openjdk@17` with Homebrew and switched shell config toward the Homebrew JDK instead of the blocked `zulu@17` installer path.
- Installed Homebrew `android-commandlinetools`.
- Populated `~/Library/Android/sdk` with:
  - `platform-tools`
  - `emulator`
  - `platforms;android-35`
  - `build-tools;35.0.0`
  - `system-images;android-35;google_apis_playstore;arm64-v8a`
  - `cmdline-tools;latest`
- Confirmed from a fresh shell:
  - `java` resolves to Homebrew OpenJDK 17
  - `adb` resolves to `~/Library/Android/sdk/platform-tools/adb`
  - `emulator` resolves to `~/Library/Android/sdk/emulator/emulator`
- Created Android emulator `QuietRoom_API_35`.
- Booted the emulator successfully and confirmed `adb` sees `emulator-5554` as `device`.
- Ran `npx expo run:android` successfully.
- Expo/Gradle auto-installed additional required Android packages during first build:
  - `build-tools;36.0.0`
  - `platforms;android-36`
  - `ndk;27.1.12297006`
  - `cmake;3.22.1`
- Android build finished successfully and installed `android/app/build/outputs/apk/debug/app-debug.apk`.
- Confirmed the installed app is running:
  - package: `com.quietroom.mobile`
  - version: `1.0.0`
  - top resumed activity: `com.quietroom.mobile/.MainActivity`
- Metro bundler started successfully and the app opened through the Expo dev client URL on the emulator.
- Current runtime logs show warnings but no obvious fatal Android or React Native exceptions:
  - Firebase Auth persistence is still memory-only until the app explicitly wires AsyncStorage into `initializeAuth`
  - `expo-av` is deprecated upstream
  - the app is still using React Native Legacy Architecture
- Test run status on this Mac:
  - `npm run typecheck` passed
  - `./gradlew testDebugUnitTest` passed
  - there are currently no app-owned files under `android/app/src/test` or `android/app/src/androidTest`
  - updated Detox config to use local Android build outputs and Mac-friendly defaults
  - added Android Detox instrumentation wiring in `android/app/build.gradle`, `android/build.gradle`, and `android/app/src/androidTest/java/com/quietroom/mobile/DetoxTest.java`
  - `detox build -c android.att.debug` passed
  - `detox test -c android.att.debug e2e/quiet-room.smoke.test.js --record-logs all` passed
  - note: `--reuse` on a fresh device session failed earlier because the instrumentation APK was not installed yet; the non-`--reuse` run installed it and passed
- Keyboard/emulator investigation:
  - the original emulator `QuietRoom_API_35` (`emulator-5554`) failed the composer keyboard-lift test with no change in the composer frame:
    - `initialComposerFrame.y = 2227`
    - `focusedComposerFrame.y = 2227`
  - compared this Mac's current AVD against the transferred working AVD from the old machine:
    - old machine AVD: `Pixel`, API 34, `google_apis`
    - current problematic AVD: `Pixel 8`, API 35, `google_apis_playstore`
  - created a closer local clone AVD named `Pixel34AVD_2_Mac` using:
    - device profile: `pixel`
    - system image: `system-images;android-34;google_apis;arm64-v8a`
    - cold-boot / no-snapshot behavior
    - `hw.gpu.mode=host`
  - booted `Pixel34AVD_2_Mac` successfully as `emulator-5556`
  - re-ran the composer keyboard test specifically against `emulator-5556`:
    - `detox test -c android.att.debug e2e/quiet-room.composer-flow.test.js --record-logs all --take-screenshots failing`
    - result: still failed the current frame-shift assertion
    - frame values on `emulator-5556`:
      - `initialComposerFrame.y = 1747`
      - `focusedComposerFrame.y = 1747`
  - important difference on the new AVD:
    - the failure screenshot at `artifacts/android.att.debug.2026-04-04 05-57-42Z/.../testFnFailure.png` visibly shows the Android soft keyboard rendered on screen
    - this suggests the new AVD is closer to a trustworthy keyboard-debugging setup, even though the specific Detox assertion still needs to be revisited
  - current interpretation:
    - the old `QuietRoom_API_35` AVD looks like an emulator/profile issue
    - the new `Pixel34AVD_2_Mac` AVD does render the keyboard, so emulator keyboard testing on this Mac appears viable
    - the existing composer test is likely too strict because it assumes the composer `y` frame must move, but on the new AVD the keyboard is visible without Detox reporting a changed composer frame
  - adjusted Android chat keyboard handling in `src/screens/QuietRoomScreen.tsx` to stop stacking manual `keyboardInset` padding on top of Android `adjustPan`
  - verification after the patch on `emulator-5556`:
    - `npm run typecheck` passed
    - re-ran `detox test -c android.att.debug e2e/quiet-room.composer-flow.test.js --record-logs all --take-screenshots failing`
    - composer frame now changes in the expected direction:
      - `initialComposerFrame.y = 1747`
      - `focusedComposerFrame.y = 925`
    - latest failure screenshot now shows the composer resting just above the keyboard instead of leaving a large blank white gap
    - the remaining Detox failure moved later in the test to message visibility after send, so the keyboard-lift problem appears materially improved

## iOS simulator bring-up

### 2026-04-04 summary

- Installed and activated the full Xcode toolchain on this Mac.
- Installed an iOS simulator runtime and verified `xcrun simctl list devices available`.
- Installed CocoaPods successfully and confirmed `pod` is available locally.
- Generated the local iOS native project with Expo prebuild and completed `pod install`.
- Added local iOS Detox support in `.detoxrc.js` and `package.json`.
- Verified the app builds, installs, and launches on the iOS simulator.

### Native/app changes made

- Updated `app.config.js` so a local `GoogleService-Info.plist` can be picked up later without changing Android behavior.
- Added an iOS-specific workaround in `ios/Podfile` to force the vendored `fmt` pod to `c++17` under current Xcode tooling.
- Added iOS Detox config and scripts:
  - `detox:build:ios`
  - `detox:test:ios:smoke`
  - `detox:test:ios:chat-layout`
- Added iOS-oriented test helpers and selector updates in the `e2e/` suite.
- Added a dedicated `e2e/quiet-room.keyboard-layout.test.js` coverage path for focused composer layout on iOS.

### iOS UI fixes made

- Tightened the iOS-only spacing between the header and crucifix in `src/screens/QuietRoomScreen.tsx`.
- Fixed iOS keyboard overlap by reserving bottom space when the keyboard is visible in `src/screens/QuietRoomScreen.tsx`.
- Restored iOS-only padding/gutters in the conversations drawer in `src/components/ConversationsModal.tsx`.
- Fixed the iOS conversations row kebab menu by anchoring it from a stable wrapper and rendering the floating menu as a screen-level overlay.
- Added an iOS stacking fix for the model picker menu so it can render above nearby UI, including the voice badge.
- Added Detox-only autofill suppression in `src/components/LoginModal.tsx` to avoid iOS password-save UI interfering with tests.

### iOS test results on this Mac

- Manual simulator status:
  - `com.quietroom.mobile` launches on `iPhone 17`
  - Metro connects successfully
  - the Quiet Room shell renders correctly
- iOS Detox tests confirmed passing during today’s work:
  - `e2e/quiet-room.smoke.test.js`
  - `e2e/quiet-room.chat-layout.test.js`
  - `e2e/quiet-room.crucifix-modal.test.js`
  - `e2e/quiet-room.scroll-anchor.test.js`
  - `e2e/quiet-room.composer-flow.test.js`
  - `e2e/quiet-room.keyboard-layout.test.js`
- Important verified keyboard metrics on `iPhone 17`:
  - composer frame changed from `y = 779` to `y = 479` when focused with the software keyboard visible
  - keyboard layout test logged `promptGap = 59`
  - chat layout test still passed with `openingGap = 16`

### iOS findings

- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is still empty in `quiet-room-mobile/.env`, so Google sign-in remains intentionally deferred on iOS.
- The iOS simulator can use `http://localhost:5000` directly for local backend testing; no Android-style `10.0.2.2` mapping is needed.
- The iOS software keyboard must be available for keyboard-layout Detox checks to be meaningful.
- A bad/parallel Detox run can spawn a second simulator device and produce misleading failures unrelated to app layout.
- The simulator preference that made keyboard testing reliable was:
  - `defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false`

### Remaining iOS issues / follow-up

- `e2e/quiet-room.conversations-menu.test.js` is currently flaky on iOS even though the floating menu fix works manually and has passed before.
- `e2e/quiet-room.streaming-smoke.test.js` still needs more work on iOS, especially around native voice playback expectations.
- The model picker / voice badge layering fix is in code, but it has not yet been cleanly locked down with automated verification.
- Team should still decide whether the generated local `ios/` directory should remain local/generated or be committed.

## Next

1. Do a manual in-emulator sanity pass against QA to confirm the first visible screen and at least one basic app flow.
2. Continue iOS stabilization by tackling the flaky conversations-menu Detox path and then revisiting streaming/voice coverage.
3. Decide whether to keep the generated `android/` and `ios/` directories checked in for this repo or treat them as local/generated state.
4. Optionally run additional Detox coverage beyond smoke on both platforms, especially login and streaming flows.
5. Optionally tighten the remaining runtime warning around Firebase Auth persistence.
