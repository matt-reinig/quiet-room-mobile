# Android Emulator Troubleshooting Notes

## Why this exists

These notes document the Android emulator setup/debugging work on the Mac laptop after moving over from Windows, especially around the Quiet Room chat keyboard behavior.

The key conclusion is important:

- The app at the relevant `master` state behaved well on a real Android phone.
- The bad keyboard behavior was primarily observed on the emulator.
- Because of that, emulator setup/configuration became the main suspect rather than app code.

## Main symptom

On Android emulator, tapping into the composer in an existing conversation near the bottom of the chat caused unstable keyboard/layout behavior:

- sometimes the latest message sat behind the keyboard/composer
- sometimes the content jumped upward too far
- repeated taps into the same composer position could land the chat content in different places

This was especially misleading because some narrower layout tests could pass while the repeated-tap experience still felt wrong.

## Important context discovered later

We eventually clarified that:

- real Android hardware was the more trustworthy reference point
- the imported emulator setup from the old machine was incomplete at first
- the full AVD transfer later appeared here:
  - `/Users/mjreinig/projects/Gabriel_App/gabriel-laptop-transfer-20260403-173122/Pixel34AVD_2.avd 2`

That changed the diagnosis. Once we knew `master` already felt good on a real Android device, it no longer made sense to keep “fixing” emulator-only problems in app code.

## Emulator/AVD state we inspected

### Running emulator

- Running device: `emulator-5554`
- Running AVD name: `Pixel34AVD_2`

Command used:

```bash
adb -s emulator-5554 emu avd name
```

### Imported AVD characteristics

Local config used by the running AVD:

- file: `/Users/mjreinig/.android/avd/Pixel34AVD_2.avd/config.ini`
- API level: `android-34`
- image: `system-images/android-34/google_apis/arm64-v8a/`
- screen: `1080x1920`
- device profile: generic `pixel`

### Comparison AVD on this Mac

There was also a cleaner locally-created AVD:

- file: `/Users/mjreinig/.android/avd/QuietRoom_API_35.avd/config.ini`
- API level: `android-35`
- image: `system-images/android-35/google_apis_playstore/arm64-v8a/`
- screen: `1080x2400`
- device profile: `pixel_8`

This comparison mattered because the imported AVD and the locally-created AVD were not equivalent.

### Emulator input settings

We inspected keyboard-related settings on the running emulator:

```bash
adb -s emulator-5554 shell settings get secure default_input_method
adb -s emulator-5554 shell settings get secure show_ime_with_hard_keyboard
```

Observed values during debugging:

- input method: `com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME`
- `show_ime_with_hard_keyboard = 1`

That second setting is especially suspicious for desktop-emulator-only keyboard weirdness.

## App-code changes we tried

These were tried while treating the bug like an app/layout issue:

- switched Expo Android `softwareKeyboardLayoutMode` from `pan` to `resize`
- added Android-specific keyboard inset handling in `QuietRoomScreen.tsx`
- added Android-only composer focus handling
- added Android-only list bottom padding/inset logic
- added Android-only scroll correction logic meant to preserve the bottom message above the keyboard
- added experimental E2E tests for keyboard layout, bottom-stick behavior, and repeatability

What we learned:

- some of these changes could make a narrow assertion pass
- they did not produce stable repeated behavior on the emulator
- they made the app drift away from the known-good behavior on real Android hardware

## What the repeatability testing showed

The most useful test was not “does the composer move up” but “does the same conversation open to the same place every time?”

During repeated composer-focus cycles in the same bottom-of-chat state, we saw samples like:

```text
composerY: 886, 886, 886
latestAssistantBottom: 384, 331, 796
```

That meant:

- the composer itself was stable
- the chat content under it was not
- the emulator experience was genuinely inconsistent

## Decision and current recommendation

The right call was to revert the Android keyboard experiments in app code and move the focus back to emulator setup.

Recommended approach going forward:

1. Keep the app on the known-good Android behavior from `master` unless a bug reproduces on real hardware.
2. Treat emulator-specific keyboard issues as emulator/AVD configuration problems first.
3. Prefer a clean locally-created AVD over a partially transferred/imported one when establishing a baseline.
4. If using the transferred AVD, compare its config carefully against a fresh local AVD.
5. Check emulator keyboard settings before changing app layout code.

## Concrete things to verify next time

### AVD identity

```bash
emulator -list-avds
adb -s emulator-5554 emu avd name
```

### AVD config

```bash
sed -n '1,220p' ~/.android/avd/Pixel34AVD_2.avd/config.ini
sed -n '1,220p' ~/.android/avd/QuietRoom_API_35.avd/config.ini
```

### Keyboard/IME settings

```bash
adb -s emulator-5554 shell settings get secure default_input_method
adb -s emulator-5554 shell settings get secure show_ime_with_hard_keyboard
```

### Metro/dev connectivity

```bash
curl -s http://127.0.0.1:8081/status
adb -s emulator-5554 reverse tcp:8081 tcp:8081
```

## Practical takeaway

The main lesson from this debugging round is:

- do not let emulator-only keyboard weirdness drive app layout changes when real Android hardware already behaves correctly

Use the emulator as the main test surface only after the AVD and IME setup are known-good and representative of the phone behavior we actually want.
