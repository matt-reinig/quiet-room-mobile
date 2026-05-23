# QR-MOB-002 Progress

## 2026-05-22

Status: implementation verified on Pixel and Galaxy-style Android emulator; backend response path still needs a separate local-env fix for full second-send Detox completion.

Created a dedicated mobile worktree for QR-MOB-002:

- Worktree: `/Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-qr-mob-002-android-keyboard-spacing`
- Branch: `codex/qr-mob-002-android-keyboard-spacing`
- Base: `origin/develop`
- Base commit: `59ac002` (`Update project tracker for QR-MOB-004 QA deploy`)

Initial findings:

- The main `quiet-room-mobile` checkout is dirty with unrelated files, so QR-MOB-002 should proceed in this clean worktree.
- `src/screens/QuietRoomScreen.tsx` already tracks keyboard visibility and keyboard height.
- Android keyboard-open composer padding currently includes the full `keyboardInset` plus `ANDROID_KEYBOARD_CLEARANCE`.
- Existing Detox coverage in `e2e/quiet-room.composer-flow.test.js` checks that the composer lifts with the keyboard and supports a second send, but it does not yet assert the send button/composer bottom geometry tightly enough for Tyler's overhang report.
- `app.json` currently sets Android `softwareKeyboardLayoutMode` to `resize`.
- `task-2-progress.md` and `docs/android-emulator-troubleshooting.md` preserve older evidence that emulator keyboard behavior can be misleading; QR-MOB-002 should not patch app layout from emulator-only weirdness unless the AVD/IME setup is verified.
- Tyler provided two real-device Android screenshots:
  - `docs/qr-mob-002-android-keyboard-spacing/evidence/tyler-keyboard-short-input.jpg`
  - `docs/qr-mob-002-android-keyboard-spacing/evidence/tyler-keyboard-multiline-input.jpg`
- The screenshots show the keyboard/suggestion strip covering the lower edge of the composer row, not an oversized blank footer from too much padding.
- The short-input screenshot clips the text-input bottom border and the lower portion of the Send button.
- The multi-line screenshot shows the expanded composer cramped against the keyboard, with the bottom text/caret area and Send button sitting too low.

Planning decisions:

- Treat Tyler's screenshot / real Android behavior as the source of truth.
- Use emulator evidence only after checking AVD identity, API level, screen profile, navigation mode, and IME settings.
- Verify generated native Android soft-input behavior after `native:sync:local-qa`.
- If a code fix is needed, start with Android keyboard-open footer/composer clearance and preserve Android keyboard-closed safe-area behavior.
- Tighten Detox geometry checks around the composer input and send button rather than relying only on "composer y moved up."
- Compare local one-line and multi-line keyboard-open screenshots directly against Tyler's two images before deciding the fix is good.

Next steps:

1. Finish local worktree runtime setup from `docs/quiet-room-mobile-worktree-setup-guide.md`.
2. Confirm generated Android soft-input mode after native sync.
3. Capture emulator identity and IME settings before trusting keyboard behavior.
4. Reproduce the keyboard-open Android layout on an emulator.
5. Capture before screenshots and frame logs for one-line and multi-line composer input.
6. Compare local screenshots against Tyler's evidence images.
7. Patch the Android keyboard-open spacing only if evidence points to app layout.
8. Add or tighten Detox assertions for the keyboard-open composer/send-button geometry.
9. Run focused verification and update the tracker with evidence.

Commands to run once local-only files are present:

```bash
cd /Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-qr-mob-002-android-keyboard-spacing
npm install
npm run mobile:verify:local-qa
npm run native:sync:local-qa
npm run typecheck
npm run detox:test:composer:5556
```

Worktree setup source:

- Follow `docs/quiet-room-mobile-worktree-setup-guide.md` for the env overlay, Firebase file, signing file, and native regeneration steps.

Open questions:

- Tyler's exact Android device, OS version, navigation mode, and keyboard app.
- Whether the screenshot came from QA or prod.
- Whether the issue is only keyboard-open or also visible during keyboard-dismiss animation. The provided screenshots both show keyboard-open state.
- Whether the issue requires voice/model controls or prompt cues to be visible.
- Whether the current generated Android manifest is already using resize mode in this worktree after native sync.

Implementation pass:

- Copied the local-only env/Firebase/signing inputs into the worktree from the main `quiet-room-mobile` checkout.
- Installed dependencies with `npm install`.
- Verified local QA config with `npm run mobile:verify:local-qa`; result had no warnings or failures and resolved API base `http://10.0.2.2:5002`.
- Regenerated native projects with `npm run native:sync:local-qa`.
- Confirmed generated Android manifest uses `android:windowSoftInputMode="adjustResize"` for `MainActivity`.
- Updated `src/screens/QuietRoomScreen.tsx` so Android keyboard-open handling moves the footer itself above the reported keyboard inset instead of only adding raw keyboard height as internal footer padding.
- Added Android fallback keyboard signals from composer focus/press/text-entry using `Keyboard.metrics()` and a conservative screen-height fallback. This covers the Galaxy AVD behavior where Android reported `mInputShown=true` but React Native did not reliably deliver the keyboard show event.
- Increased `ANDROID_KEYBOARD_CLEARANCE` from `20` to `32` so the composer/input and Send button have room above Android keyboard suggestion-strip chrome.
- Added a separate Android keyboard offset clearance of `96` so the whole composer row clears the IME suggestion strip.
- Hid prompt cues while the Android keyboard is active so the footer has enough vertical room in the keyboard-open state.
- Preserved Android keyboard-closed behavior: `COMPOSER_ROW_PADDING_BOTTOM + insets.bottom`.
- Preserved iOS keyboard-open behavior: `COMPOSER_ROW_PADDING_BOTTOM + keyboardInset`.
- Changed feature-flag load failure logging from `console.error` to `console.warn` in `src/contexts/FeatureFlagsContext.tsx`; the provider already falls back to defaults, and this prevents local Android debug redboxes from blocking layout testing.
- Tightened `e2e/quiet-room.composer-flow.test.js` to log focused input/send/screen frames and assert that the keyboard-open composer input and Send button remain above the screen bottom and share coherent row alignment.

Focused verification:

```bash
npm run typecheck
# passed

npm run mobile:verify:local-qa
# passed, no warnings or failures

npm run native:sync:local-qa
# passed; generated Android manifest has adjustResize

npm run detox:build:debug
# passed; debug app and androidTest APKs built successfully
```

Emulator layout evidence:

- AVD: `Pixel34AVD_2`
- Device: `emulator-5554`, model `sdk_gphone64_arm64`
- Android: `14`
- Size: `1080x1920`
- Density: `420`
- Navigation mode: `2` (gesture navigation)
- `show_ime_with_hard_keyboard`: `1`

Focused Detox command:

```bash
npm run detox:test:composer:5556
```

Result: failed after the layout assertions because the local backend/app returned `No assistant content returned.` and the test timed out waiting for the first assistant message. The keyboard-open geometry evidence printed before that failure:

```json
{
  "focusedComposerFrame": { "x": 42, "y": 886, "width": 786, "height": 130 },
  "focusedSendFrame": { "x": 849, "y": 901, "width": 189, "height": 115 },
  "initialComposerFrame": { "x": 42, "y": 1747, "width": 786, "height": 131 },
  "initialSendFrame": { "x": 849, "y": 1762, "width": 189, "height": 115 },
  "screenFrame": { "x": 0, "y": 0, "width": 1080, "height": 1920 }
}
```

Evidence interpretation:

- Focused composer bottom: `1016`.
- Focused Send bottom: `1016`.
- Both are well above the 1920px screen bottom and are aligned with each other.
- This is the intended corrected shape relative to Tyler's screenshots, where the keyboard/suggestion strip clipped the input and Send button bottoms.
- Remaining verification gap: a manual before/after screenshot pass on a physical Android phone or the exact Tyler device/keyboard app is still the strongest final proof.

Galaxy S22-style emulator verification:

- Found local AVD: `Galaxy_S22_Plus_Bottom_Inset_Repro`.
- AVD config: `1080x2340`, density `390`, Android 35 Google Play image, hardware keyboard disabled.
- Runtime device: `emulator-5554`, model `sdk_gphone64_arm64`.
- Runtime Android: `15` / API `35`.
- Runtime size/density: `1080x2340`, `390`.
- Runtime `show_ime_with_hard_keyboard`: `1`.
- Runtime `navigation_mode`: `0`.

Initial Galaxy blockers found and fixed:

- Port `8081` was initially served by a stale Metro process from the `issue-48-gpt-5-5-reasoning-none/quiet-room-mobile` worktree, so the emulator was not using this QR-MOB-002 bundle.
- Corrected Metro to serve from `/Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-qr-mob-002-android-keyboard-spacing`.
- `.env.local.qa` points the emulator at `EXPO_PUBLIC_API_BASE=http://10.0.2.2:5002`.
- Host backend health check passes at `http://127.0.0.1:5002/health`.
- `http://127.0.0.1:5002/api/feature_flags` returns `401 Missing ID token` without an app user token; with the warning-only fallback, this no longer blocks layout verification.

Focused Galaxy Detox command:

```bash
DETOX_ATTACHED_DEVICE=emulator-5554 npm run detox:test:composer:5556
```

Result: failed after the layout assertions because the local backend/app returned `No assistant content returned.` and the test timed out waiting for the first assistant message. The keyboard-open geometry evidence printed before that failure:

```json
{
  "focusedComposerFrame": { "x": 39, "y": 1400, "width": 807, "height": 122 },
  "focusedSendFrame": { "x": 866, "y": 1414, "width": 175, "height": 107 },
  "initialComposerFrame": { "x": 39, "y": 2063, "width": 807, "height": 122 },
  "initialSendFrame": { "x": 866, "y": 2077, "width": 175, "height": 107 },
  "screenFrame": { "x": 0, "y": 0, "width": 1080, "height": 2340 }
}
```

Manual Galaxy evidence:

- `adb shell dumpsys input_method` confirmed `mInputShown=true` and `mServedView=com.facebook.react.views.textinput.ReactEditText`.
- Final short-input screenshot: `docs/qr-mob-002-android-keyboard-spacing/evidence/emulator-galaxy-s22/manual-clean-keyboard-short-final.png`
- The final screenshot shows the one-line composer and Send button fully visible above the keyboard suggestion strip on the `1080x2340` Galaxy-style AVD.

Earlier captured artifacts retained for comparison/debugging:

- `docs/qr-mob-002-android-keyboard-spacing/evidence/emulator-galaxy-s22/after-patch-keyboard-closed.png`
- `docs/qr-mob-002-android-keyboard-spacing/evidence/emulator-galaxy-s22/after-patch-feature-override-closed.png`
- `docs/qr-mob-002-android-keyboard-spacing/evidence/emulator-galaxy-s22/manual-clean-keyboard-short-after-clearance-offset.png`

Remaining verification gap:

- The visual keyboard spacing fix is verified locally on the Galaxy-style AVD.
- Full Detox still does not complete its second-send flow because the local backend/app returns `No assistant content returned.` after send. That is separate from the keyboard layout assertion and likely tied to the local backend/auth/test response environment.
- A physical Android pass on Tyler's exact device/keyboard app remains the strongest final proof before closing QR-MOB-002.

## 2026-05-23

Status: post-QA Android and iOS spacing revision is staged on current `origin/develop` for QA store deployment.

Why this changed after the first QA deploy:

- The first Android fix was merged/deployed to the QA Android store, but real-device review showed too much yellow/beige space between the composer and the keyboard.
- User screenshot `/Users/mjreinig/Downloads/Screenshot_20260522-222739.png` showed the extra gap clearly with the keyboard open.
- The earlier `+96` Android footer lift solved clipping but overshot the visual target on a real phone.

Android revision:

- Removed the separate `ANDROID_KEYBOARD_OFFSET_CLEARANCE = 96` behavior.
- Kept the composer offset tied to the actual IME inset with `Math.max(0, keyboardInset - insets.bottom)`.
- The calculation subtracts the bottom system inset once because React Native's Android keyboard height includes the navigation/safe-area portion; without that subtraction, Pixel gesture navigation and the Galaxy 3-button profile produced different yellow/beige bands.
- Added `keyboardInsetFromScreenY(height, screenY)` so Android prefers the keyboard top coordinate when React Native exposes it, with reported height as the fallback.
- Reduced Android keyboard-open internal bottom clearance from the earlier `32px` extra clearance to `4px`, for `20px` total footer padding with `COMPOSER_ROW_PADDING_BOTTOM`.
- Preserved Android keyboard-closed behavior: `COMPOSER_ROW_PADDING_BOTTOM + insets.bottom`.
- Confirmed the visible app-controlled clearance is now the same between Pixel and Galaxy: no separate yellow/beige band between the composer footer and the Gboard suggestion strip. The keyboard app, suggestion strip, and navigation chrome can still differ by emulator/device.

Android emulator evidence:

- Pixel AVD `Pixel34AVD_2`, Android 14, `1080x1920`, density `420`, gesture navigation, `show_ime_with_hard_keyboard=1`.
- Pixel final screenshot after equalized calculation: `docs/qr-mob-002-android-keyboard-spacing/evidence/pixel34-keyboard-equalized-final.png`.
- Pixel result: Gboard suggestion strip is visible, the composer sits directly above it, the text field is not covered, and the yellow/beige gap is gone.
- Galaxy AVD `Galaxy_S22_Plus_Bottom_Inset_Repro`, Android 15/API 35, `1080x2340`, density `390`, `show_ime_with_hard_keyboard=1`.
- Galaxy final screenshot after equalized calculation: `docs/qr-mob-002-android-keyboard-spacing/evidence/galaxy-s22-keyboard-equalized-final.png`.
- Galaxy result: `adb shell dumpsys input_method` confirmed `mInputShown=true` and `mServedView=com.facebook.react.views.textinput.ReactEditText`; Gboard suggestion strip is visible, the composer sits directly above it, and the yellow/beige gap is gone.

iOS revision:

- User clarified that the unwanted beige area on iOS was the resting band below the composer, not the space above the text area.
- This is now handled structurally instead of by recoloring: the main Quiet Room screen uses `SafeAreaView` from `react-native-safe-area-context` with iOS `edges={["top"]}` so the main screen no longer reserves a separate bottom safe-area band under the composer.
- iOS keyboard-open behavior still uses the keyboard inset path.
- iOS keyboard-closed/resting behavior now keeps a smaller proportional bottom clearance: `COMPOSER_ROW_PADDING_BOTTOM + IOS_RESTING_COMPOSER_BOTTOM_CLEARANCE`.
- `IOS_RESTING_COMPOSER_BOTTOM_CLEARANCE` is `20`, so total resting bottom padding is `36px`.
- The `36px` resting bottom padding intentionally matches the active voice-mode top spacing from the voice badge row: `composerMetaRow.minHeight 28 + composerWrap.gap 8`.
- The voice-mode badge space above the text area was preserved; the badge row and input top spacing were not removed.

Validation before QA store deployment:

```bash
npm run typecheck
```

Result: passed.

## 2026-05-23 QA Store Deployment

Source branch and merge:

- Release worktree: `/private/tmp/quiet-room-mobile-qr-mob-002-develop-merge`
- Branch: `codex/qr-mob-002-qa-ios-android-spacing`
- Merged/pushed to `origin/develop` at `b7ed619` (`Equalize QA composer keyboard spacing`).
- Pushed feature branch `origin/codex/qr-mob-002-qa-ios-android-spacing` at the same commit.

Pre-deploy validation:

```bash
npm run typecheck
npm run mobile:verify:qa
npm run native:sync:qa
npm run android:play:preflight:qa
npm run ios:testflight:preflight:qa
npm run android:play:status:qa
npm run ios:testflight:status:qa
```

Results:

- Typecheck passed.
- QA env verification passed with no warnings/failures.
- Native sync completed for QA Android/iOS.
- Android Play preflight passed for `com.quietroom.mobile.qa`, versionCode `12`.
- iOS TestFlight preflight passed for `com.quietroom.mobile.qa`, build `20`, with `CFBundleVersion: 20`, `MARKETING_VERSION: 1.0.0`, and `CURRENT_PROJECT_VERSION: 20`.

Android QA Play deployment:

```bash
bash ./scripts/with-mobile-env.sh qa qa bash -lc 'cd android && ./gradlew bundleRelease'
```

Result: `BUILD SUCCESSFUL`.

Android artifact:

- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- SHA256: `905a4ca06a409af75fa79fb4de91c281a103f45e19fc137b3dee3ca3eb8e4a85`
- Package: `com.quietroom.mobile.qa`
- versionCode: `12`

Play upload result:

- Created Play edit `15087252310441301604`.
- Uploaded AAB versionCode `12`.
- Updated `internal` track as draft release `QA internal 12`.
- Committed Play edit `15087252310441301604`.
- Readback edit `07637720695111139590` confirmed `internal` track release `QA internal 12`, `versionCodes: ["12"]`, `status: draft`.
- The upload script exited non-zero only after successful readback because the cleanup `DELETE` response had an empty body; the Play edit had already been committed and read back.

iOS QA TestFlight deployment attempt:

```bash
ENTRY_FILE=index.ts npm run ios:testflight:deploy:qa
```

Results:

- Initial deploy attempt failed in the React Native bundle phase because Xcode resolved the entry file through `/tmp/.../index.ts` while Metro rooted the repo at `/private/tmp/...`. The relative `ENTRY_FILE=index.ts` override fixed that bundling issue.
- The rerun archived successfully as `build/ios-qa-b20.xcarchive`.
- Archive entitlements were verified:
  - `application-identifier: SV7SPMY2Q8.com.quietroom.mobile.qa`
  - `com.apple.developer.applesignin: Default`
- Xcode export/upload then failed with `exportArchive Failed to Use Accounts`.
- Re-exporting the successful archive with App Store Connect API-key auth also failed: `No Accounts with App Store Connect Access`.
- Direct `xcrun altool --upload-app` with the same API key failed with `NOT_AUTHORIZED` / invalid bearer token for key `6KX54B4HT2`.

iOS signed artifact prepared:

```bash
xcodebuild -exportArchive \
  -archivePath build/ios-qa-b20.xcarchive \
  -exportPath build/testflight-export-qa-b20-local \
  -exportOptionsPlist build/exportOptions-qa-b20-export.plist \
  -allowProvisioningUpdates
```

Result: `** EXPORT SUCCEEDED **`.

- IPA: `build/testflight-export-qa-b20-local/QuietRoomQA.ipa`
- SHA256: `b10ee7bc2226faa7299f729dd87d02fd3df5eae63f7e947a5b5ec9a410ab1f41`
- Bundle id: `com.quietroom.mobile.qa`
- Build number: `20`

Remaining blocker:

- Android QA is deployed to Play internal testing as draft release `QA internal 12`.
- iOS QA build `20` was initially archived and exported locally, but App Store Connect upload was blocked until local Xcode account access was restored.
- Resolved below on the successful 2026-05-23 iOS upload retry.

Additional iOS upload retry:

- Retried the runbook Xcode upload path from the existing archive:

```bash
xcodebuild -exportArchive \
  -archivePath build/ios-qa-b20.xcarchive \
  -exportPath build/testflight-export-qa-b20-upload-retry \
  -exportOptionsPlist build/exportOptions-qa-b20.plist \
  -allowProvisioningUpdates
```

- Result: failed again with `exportArchive Failed to Use Accounts`.
- Interpretation: the remaining iOS blocker is still local Apple/Xcode App Store Connect account access, not the QR-MOB-002 app build. Do not switch to App Store Connect API upload for Apple; restore the Xcode account session and retry the same archive/export path.
- A subsequent retry at 2026-05-23 11:25 local time failed the same way: `exportArchive Failed to Use Accounts`.
- A subsequent retry at 2026-05-23 11:26 local time also failed with `exportArchive Failed to Use Accounts`. The Xcode distribution log says: `Failed to find an account with App Store Connect access for team ... teamID='SV7SPMY2Q8'` and `App Store Connect access for "SV7SPMY2Q8" is required. Ensure that your Apple Account usernames and passwords are correct in Accounts settings.`

Successful iOS upload retry:

- Retried the same Xcode upload path from the existing archive after local App Store Connect/Xcode account access was restored:

```bash
xcodebuild -exportArchive \
  -archivePath build/ios-qa-b20.xcarchive \
  -exportPath build/testflight-export-qa-b20-upload-retry \
  -exportOptionsPlist build/exportOptions-qa-b20.plist \
  -allowProvisioningUpdates
```

- Result: passed.
- Upload output:
  - `Starting upload`
  - `Waiting for App Store Connect analysis response`
  - `Uploaded package is processing.`
  - `Upload succeeded.`
  - `Uploaded QuietRoomQA`
  - `** EXPORT SUCCEEDED **`
- Distribution log bundle: `/var/folders/hw/11f0794j5xj1d4v03w96dlb40000gn/T/QuietRoomQA_2026-05-23_11-53-14.977.xcdistributionlogs`
- Post-upload status check:

```bash
npm run ios:testflight:status:qa
```

Result: confirmed `Quiet Room QA`, bundle `com.quietroom.mobile.qa`, iOS build `20`, version `1.0.0`, Firebase project `gabriel-qa-89f20`, and QA backend URLs.

Final QA store status:

- Android QA: uploaded to Play internal testing as draft release `QA internal 12`.
- iOS QA: uploaded to App Store Connect/TestFlight as `Quiet Room QA` build `20`; Apple processing may still need to finish before the build can be assigned to testers.
