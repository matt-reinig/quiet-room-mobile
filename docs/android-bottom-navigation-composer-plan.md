# Android Bottom Navigation Composer Fix Plan

## Goal

Fix the Android mobile UI issue where the bottom message composer is partially covered by the Android system navigation / gesture area.

This plan is intentionally scoped to the bottom composer safe-area behavior. Do not redesign the broader chat layout or spacing unless that is directly required to fix the bottom navigation overlap.

Related GitHub issue: #2

## Observed Problem

On a Samsung Galaxy S22+ test device, the message input and Send button sit too close to the bottom of the screen and appear partially covered by the Android navigation area.

This makes the composer feel cramped and partially unusable.

## Reported Device

- Device: Samsung Galaxy S22+
- Model: SM-S906U
- Android device with bottom navigation / gesture area visible
- Reported from a real user device screenshot

## Android Studio Reproduction Strategy

The goal is not to perfectly emulate Samsung One UI. The goal is to create an Android emulator that is close enough to reproduce the same class of bottom system-inset behavior and verify the fix locally.

### Create a Galaxy S22+-like Android Virtual Device

Use Android Studio Device Manager to create a custom AVD if an exact Galaxy S22+ profile is not available.

Recommended emulator profile:

```text
AVD name: Galaxy_S22_Plus_Bottom_Inset_Repro
Device type: Phone
Screen size: 6.6 inches
Resolution: 1080 x 2340
Density: 390-393 dpi
Orientation: Portrait
RAM: 4096 MB or higher
System image: Google Play image, API 35 or API 36
Navigation mode after boot: Gesture navigation
```

Notes:

- Prefer a Google Play system image over a bare AOSP image so the emulator behaves more like a normal consumer Android device.
- If Android Studio only offers rounded density values, use the closest available value around 390 dpi.
- Samsung One UI behavior may not match stock Android exactly, so emulator verification should be followed by a QA build check on the real Galaxy S22+ if possible.

### Enable Gesture Navigation

After the emulator boots, switch it to gesture navigation if it is not already enabled.

Expected path, wording may vary by API level:

```text
Settings -> System -> Gestures -> System navigation -> Gesture navigation
```

This matters because the original screenshot shows the bottom navigation / gesture area affecting the composer.

## Reproduction Steps

1. Launch the Galaxy S22+-like emulator.
2. Run the Quiet Room mobile app on the emulator.
3. Navigate to the main chat screen.
4. Confirm whether the bottom composer overlaps, touches, or sits too close to the Android navigation area.
5. Capture a before screenshot.
6. Open the keyboard and verify whether the composer remains usable.
7. Capture any keyboard-related issue if present.

## Code Areas to Investigate

Focus on the chat screen and bottom composer layout.

Check for:

- `SafeAreaView` usage.
- `react-native-safe-area-context` usage.
- Whether the composer uses `useSafeAreaInsets()`.
- Whether `insets.bottom` is applied to the composer container.
- Absolute positioning on the composer.
- Hardcoded `bottom`, `paddingBottom`, or fixed-height values.
- Parent containers using fixed heights or viewport assumptions that ignore Android system insets.
- `KeyboardAvoidingView` / Android keyboard behavior.
- Android-specific `windowSoftInputMode` behavior if configured.

## Preferred Fix Direction

Implement the smallest scoped fix that makes the composer respect the Android bottom system inset.

Likely direction:

```tsx
const insets = useSafeAreaInsets();
const bottomPadding = Math.max(insets.bottom, 12);

return (
  <View style={[styles.composerContainer, { paddingBottom: bottomPadding }]}>
    {/* composer content */}
  </View>
);
```

Guidance:

- Apply the inset padding to the composer area, not necessarily the entire screen.
- Preserve existing iOS safe-area behavior.
- Avoid adding excessive global padding that shifts the full chat screen upward.
- Do not create a broad layout redesign as part of this fix.
- If `insets.bottom` returns `0` on some Android devices, keep a small minimum bottom padding so the composer still has breathing room.

## Test Plan

### Android Studio Emulator

Test on the Galaxy S22+-like emulator:

- Keyboard closed.
- Keyboard open.
- Gesture navigation enabled.
- Portrait orientation.

Expected result:

- The input and Send button are fully visible above the Android navigation area.
- The composer is fully tappable.
- The composer remains usable when the keyboard opens.

### Additional Android Check

If quick, test one smaller Android emulator to make sure the fix does not create excessive bottom padding on smaller screens.

Suggested secondary emulator:

```text
Pixel-style phone
1080 x 2400 or similar
API 35 or API 36
Gesture navigation enabled
```

### iOS Regression Check

Run one iOS simulator or real iOS device check.

Expected result:

- Existing iOS safe-area behavior is preserved.
- The composer does not gain excessive bottom spacing.
- Keyboard behavior still works.

### Real Device Validation

After the emulator fix is verified, send a QA build to the original Galaxy S22+ tester if possible.

Expected result:

- The original user no longer sees the composer clipped or overlapped by the bottom Android navigation area.

## Acceptance Criteria

- Bottom message composer is no longer clipped or overlapped by the Android navigation / gesture bar.
- Text input is fully visible and tappable.
- Send button is fully visible and tappable.
- Composer works with keyboard closed.
- Composer works with keyboard open.
- Fix is verified on the Galaxy S22+-like Android Studio emulator.
- Fix does not regress iOS composer safe-area behavior.
- Before/after screenshots are attached to the PR or issue comment.

## Non-Goals

- Redesigning the welcome screen spacing.
- Reworking prompt cue card layout.
- Changing typography, colors, or general chat screen hierarchy.
- Solving unrelated Android device-specific styling issues.

## PR Notes

When opening the PR, include:

- Link to issue #2.
- Before screenshot from the emulator or original device.
- After screenshot from the emulator.
- Any real-device validation from the Galaxy S22+ tester if available.
- Short explanation of how Android bottom insets are handled after the fix.
