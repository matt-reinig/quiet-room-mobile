# QR-MOB-002 Android Keyboard Spacing Plan

## Goal

Fix the Android chat UI spacing issue where the bottom composer/input area looks cramped, overlaps, or overhangs when the software keyboard is open.

This task is specifically about keyboard-open behavior. The previous Android bottom-navigation composer work handled the closed-keyboard system navigation inset; do not treat that earlier fix as enough proof for this item.

## Current Tracker Context

Tracker item: `QR-MOB-002`

Original note:

- Tyler has a screenshot showing the bottom UI somewhat overhanging.
- Reproduce on Android, especially smaller/taller phone layouts.
- Add enough bottom padding or keyboard-aware spacing so the input/nav area does not overlap or overhang.

Tyler evidence now captured:

- `docs/qr-mob-002-android-keyboard-spacing/evidence/tyler-keyboard-short-input.jpg`
- `docs/qr-mob-002-android-keyboard-spacing/evidence/tyler-keyboard-multiline-input.jpg`

Both screenshots are `945x2048` Android screenshots with the software keyboard open.

Observed problem from the screenshots:

- The Android keyboard suggestion strip starts before the composer row has fully cleared the keyboard.
- In the short-input screenshot, the lower border of the text input and the bottom of the Send button are clipped/covered by the keyboard area.
- In the multi-line screenshot, the expanded composer is cramped against the keyboard, the bottom text/caret area is partially obscured, and the Send button sits too low.
- Prompt cues remain visible above the composer in both screenshots, so the immediate issue is the keyboard-open footer/composer clearance, not the prompt cue control itself.
- The status bar shows a real Android phone state with cellular/Wi-Fi indicators and bottom system navigation, so this should be treated as real-device evidence rather than emulator-only behavior.

## Branch And Worktree

- Mobile branch: `codex/qr-mob-002-android-keyboard-spacing`
- Worktree: `/Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-qr-mob-002-android-keyboard-spacing`
- Base branch: `origin/develop`
- Initial base commit: `59ac002` (`Update project tracker for QR-MOB-004 QA deploy`)

## Known Code Areas

Primary file:

- `src/screens/QuietRoomScreen.tsx`
- `app.json`
- `e2e/quiet-room.composer-flow.test.js`
- `e2e/quiet-room.chat-layout.test.js`
- `docs/android-emulator-troubleshooting.md`
- `task-2-progress.md`

Relevant behavior:

- `Keyboard.addListener()` tracks `keyboardDidShow` / `keyboardDidHide` on Android.
- `keyboardInset` is set from `event.endCoordinates.height`.
- `composerBottomPadding` currently adds `COMPOSER_ROW_PADDING_BOTTOM + keyboardInset + ANDROID_KEYBOARD_CLEARANCE` when Android keyboard is open.
- The composer row is rendered in normal screen flow after `messagesWrap`, not inside an explicit `KeyboardAvoidingView`.
- `styles.inputRow` owns the footer chrome and receives the dynamic `paddingBottom`.
- `app.json` sets Android `softwareKeyboardLayoutMode` to `resize`.

Existing tests to extend or use:

- `e2e/quiet-room.composer-flow.test.js`
- `e2e/quiet-room.chat-layout.test.js`

Existing useful scripts:

- `npm run mobile:verify:local-qa`
- `npm run native:sync:local-qa`
- `npm run detox:build:debug`
- `npm run detox:test:composer:5556`
- `npm run smoke:android:local-qa`

## Prior Evidence To Preserve

There is older local evidence in `task-2-progress.md` and `docs/android-emulator-troubleshooting.md`.

Important takeaways:

- Earlier emulator work showed that AVD/IME configuration can produce misleading keyboard behavior.
- One prior failure mode had the Android soft keyboard visibly open while Detox still reported unchanged composer frames.
- Prior app-code experiments around Android keyboard behavior were eventually treated with caution because they could make a narrow emulator assertion pass while drifting away from real-device behavior.
- The existing guidance is to verify AVD identity, AVD config, and keyboard settings before letting emulator-only evidence drive app layout changes.

For QR-MOB-002, Tyler's screenshot should be treated as the product signal. Emulator evidence is useful only after the AVD and keyboard setup are known-good.

## Hypothesis

Tyler's screenshots show the keyboard/suggestion strip covering the lower edge of the composer row, so the leading hypothesis is now that the Android keyboard-open footer is not clearing the IME/suggestion-strip boundary reliably.

Possible causes:

- Android `softwareKeyboardLayoutMode: "resize"` may not be fully effective with the current edge-to-edge setup.
- The keyboard event height or safe-area bottom inset may not include the keyboard suggestion strip / Samsung keyboard chrome in the way this layout expects.
- The input row may be positioned at the resized viewport boundary while the keyboard still draws over the bottom portion.
- The current Android keyboard-open padding branch may not be applied in Tyler's shipped build, or the generated native project may differ from the current tracked Expo config.

An older alternate hypothesis was that the app might be adding too much keyboard padding. These screenshots do not look like that failure mode. They show clipping/under-clearance, so any fix should be evaluated against the actual screenshot shape before reducing Android keyboard padding.

Secondary hypotheses to rule out:

- Tyler's screenshot may show a real-device safe-area/navigation inset issue that is separate from keyboard height.
- Prompt cues, voice/model controls, or multi-line composer state may make the footer too tall only in specific chat states.
- The generated native Android manifest may not reflect `softwareKeyboardLayoutMode: "resize"` if native projects are stale.
- An emulator may be misconfigured to show hardware keyboard behavior or stale IME settings.
- Samsung keyboard suggestion-strip behavior may differ from the emulator keyboard.

## Reproduction Plan

1. Ask for or recover Tyler's screenshot metadata if available:
   - device model
   - Android version
   - navigation mode
   - keyboard app
   - whether the screenshot was QA, prod, or local build
   - whether the screenshots came from the same session/build

2. Set up a local Android QA build in the QR-MOB-002 worktree:
   - follow `docs/quiet-room-mobile-worktree-setup-guide.md`
   - install dependencies if `node_modules/` is absent
   - copy local-only env/Firebase/signing files from a trusted working checkout
   - run `npm run mobile:verify:local-qa`
   - run `npm run native:sync:local-qa`

3. Reproduce on at least one Android emulator:
   - use the existing `Pixel34AVD_2` path if it is already configured
   - also use a smaller or more constrained phone profile if practical
   - enable gesture navigation for at least one pass
   - record AVD name, API level, screen size, density, and navigation mode
   - check `show_ime_with_hard_keyboard` before trusting keyboard screenshots

4. Run and inspect the existing composer test:
   - `npm run detox:test:composer:5556`
   - preserve the printed `composer-frames` output
   - capture screenshots with the keyboard open

5. Capture manual keyboard-open screenshots:
   - fresh chat with prompt cues visible
   - keyboard opened by tapping the composer
   - short input and multi-line input
   - model/voice controls visible if enabled
   - send button fully visible and tappable
   - second send still works after the first response
   - compare against Tyler's short-input and multi-line evidence images

6. If Tyler's screenshot is available, compare the local screenshot against it:
   - composer vertical position
   - footer height
   - bottom gap or overhang shape
   - keyboard top position
   - suggestion-strip top position
   - Android navigation/gesture area

## Implementation Direction

Prefer the smallest Android-specific layout fix that handles keyboard-open behavior without disturbing the already-fixed keyboard-closed bottom inset behavior.

Likely directions to evaluate from the screenshot evidence:

- Ensure the keyboard-open Android footer clears the top of the keyboard suggestion strip by a small, stable margin.
- Verify whether `keyboardInset` is measured correctly on the target Android profile before trusting the current padding branch.
- Consider moving the Android keyboard-open clearance to a wrapper/translation strategy if bottom padding inside the footer row still lets the keyboard cover the row's bottom edge.
- Preserve the multi-line composer expand affordance and Send button alignment when the composer grows.

Earlier directions to keep in mind but not assume:

- Treat Android `keyboardInset` as a signal that the keyboard is visible, not necessarily as extra padding to add to the footer.
- Keep a modest Android keyboard-open clearance, such as `COMPOSER_ROW_PADDING_BOTTOM + ANDROID_KEYBOARD_CLEARANCE`, if the viewport is already resized.
- Preserve `COMPOSER_ROW_PADDING_BOTTOM + insets.bottom` for Android when the keyboard is closed.
- Avoid broad screen redesigns, new global wrappers, or unrelated prompt/message layout changes unless frame evidence shows they are required.

Do not change iOS keyboard behavior unless an iOS regression is found while verifying.

Recommended code-shaping if a layout patch is needed:

- Extract the composer bottom-padding decision into a tiny named helper or documented branch inside `QuietRoomScreen.tsx`.
- Keep these states visibly separate:
  - iOS keyboard open
  - Android keyboard open
  - Android keyboard closed
  - default/iOS keyboard closed
- Add a short comment only if it explains why Android does not add the raw keyboard height when `softwareKeyboardLayoutMode` is resize.

## Decision Gates

Use these gates before editing app code:

1. If Tyler's screenshot or a real Android device reproduces the issue, patch app layout and verify on emulator plus the closest available real-device path.
2. If only one emulator reproduces the issue, first fix or replace the AVD and IME setup; do not patch app layout from that evidence alone.
3. If the generated Android project does not reflect resize behavior, regenerate native projects before changing React Native layout.
4. If the issue appears only with multi-line input, focus the fix on composer height and footer padding, not message-list behavior.
5. If the issue appears only with prompt cues/model/voice controls visible, verify whether the footer stack is too tall before changing keyboard math.
6. If local reproduction looks like Tyler's screenshots, prioritize a composer-clearance fix over emulator setup theory.

## Specific Planning Tasks

1. Worktree readiness:
   - follow `docs/quiet-room-mobile-worktree-setup-guide.md`
   - confirm env/Firebase files exist
   - run `npm run mobile:verify:local-qa`
   - run `npm run native:sync:local-qa`

2. Baseline code audit:
   - confirm `app.json` Android `softwareKeyboardLayoutMode` is `resize`
   - after native sync, inspect generated Android manifest for the effective soft-input mode
   - log the current `composerBottomPadding` branches in the plan/progress notes

3. Baseline automated proof:
   - run `npm run typecheck`
   - run `npm run detox:test:composer:5556`
   - preserve `composer-frames` and `second-send-state` output
   - collect failing screenshots if the current test fails

4. Baseline manual proof:
   - capture keyboard-open screenshot with one-line input and compare to `tyler-keyboard-short-input.jpg`
   - capture keyboard-open screenshot with multi-line input and compare to `tyler-keyboard-multiline-input.jpg`
   - capture keyboard-closed screenshot to guard the prior Android bottom-navigation fix

5. Patch only after the evidence points to app layout:
   - adjust Android keyboard-open footer/composer clearance
   - keep Android keyboard-closed `insets.bottom` behavior
   - avoid changing shared iOS math

6. Lock the behavior:
   - tighten `e2e/quiet-room.composer-flow.test.js` frame checks
   - consider a focused `keyboard-open` test if composer-flow becomes too broad
   - update `docs/qr-mob-002-android-keyboard-spacing/progress.md`
   - update `docs/project-tracker.md`

## Test Plan

Code checks:

- `npm run typecheck`
- `npm run mobile:verify:local-qa`

Native setup:

- `npm run native:sync:local-qa`

Android verification:

- `npm run detox:test:composer:5556`
- targeted manual emulator check with keyboard open
- before/after screenshots
- frame evidence for composer input and send button

Recommended Detox assertion additions:

- keyboard-open composer input remains visible
- keyboard-open send button remains visible
- lower edge of composer input sits above the keyboard/screen occlusion boundary in the focused state
- lower edge of Send button sits above the keyboard/screen occlusion boundary in the focused state
- keyboard-open footer/composer height remains within a sane range
- send button and composer input share a coherent vertical row
- second send still succeeds after keyboard focus

Useful measurements to print:

- screen frame
- composer wrapper frame
- composer input frame
- send button frame
- prompt cue toggle frame when visible
- initial and focused frame deltas

Regression checks:

- `e2e/quiet-room.chat-layout.test.js` or equivalent closed-keyboard check still passes
- one iOS smoke/layout check if the implementation changes shared layout math

## Acceptance Criteria

- Android keyboard-open state is reproduced or the nearest available emulator evidence is documented.
- The composer input and send button do not overlap, overhang, or feel cramped while the keyboard is open.
- Keyboard-closed Android bottom inset behavior remains correct.
- The user can send at least two messages in the same chat after opening the keyboard.
- Before/after screenshots and Detox frame logs are captured.
- The plan records whether Tyler's screenshot was matched, approximated, or still unavailable.
- The tracker is updated with the branch, verification commands, and final result.

## Non-Goals

- Reworking chat visual design.
- Changing prompt cue content or message bubble styling.
- Shipping store builds.
- Modifying backend behavior.
- Reopening the closed-keyboard Android navigation issue unless regression evidence points there.
