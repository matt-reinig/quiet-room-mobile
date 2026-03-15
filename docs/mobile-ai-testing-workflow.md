# Mobile AI Testing Workflow

## Goal

Keep the React Native app on its current path and move testing toward an AI-first workflow.

This is a process pivot, not an app rewrite.

The app is already far enough along that the right move is to minimize product churn and invest in better automation boundaries instead.

## What changed

1. The app now exposes stable `testID` selectors for the main Quiet Room surfaces.
2. Emulator health checks live in scripts instead of being guessed from screenshots alone.
3. `uiautomator` is demoted to coarse smoke validation.
4. The preferred long-term path is a real RN E2E harness that drives those selectors.

## Preferred test stack

1. `scripts/start-mobile-dev-5556.ps1`
   - starts or reuses `emulator-5556`
   - normalizes animation and IME settings
   - ensures Metro is reachable
   - launches the app
2. `scripts/doctor-emulator-5556.ps1`
   - tells us whether we are debugging the app or a sick emulator
   - captures XML, screenshot, and relevant logcat lines
3. Stable `testID` selectors in the app
   - this is the contract AI-driven tests should use
4. Future mobile E2E harness
   - Detox is still the recommended destination

## Why this is better than the old loop

The old loop depended too heavily on:

- `adb shell input tap x y`
- `uiautomator dump`
- screenshot interpretation
- system dialogs not stealing focus

That is acceptable for emergency smoke checks but it is the wrong primary interface for app-level behavior like:

- anchored scroll behavior
- prompt cue flows
- conversation drawer behavior
- login surface behavior
- keyboard and composer flows

## Current selector contract

The RN app now exposes stable selectors for these areas:

- screen shell
- header controls
- conversations drawer open button
- about button
- profile button
- crucifix button
- message list
- opening greeting message
- user and assistant message rows
- prompt cues root, toggle, panel, and options
- composer input and send button
- fullscreen composer controls
- conversations drawer and conversation actions
- login modal, tabs, and auth inputs/buttons

Source of truth:

- `src/testIds.ts`

## Validation hierarchy

Use this order:

1. AI-driven selector-based tests once the harness is in place
2. emulator doctor check when results look suspicious
3. `uiautomator` smoke checks for coarse diagnostics only
4. manual verification only as fallback

Manual checks are no longer the preferred loop.
They are just the fallback when the emulator or harness is inconclusive.

## How to use the current tooling

From `quiet-room-mobile/`:

```powershell
npm run mobile:start:5556
```

If the device starts behaving strangely:

```powershell
npm run mobile:doctor:5556
```

If you need the older coarse anchor validator:

```powershell
npm run mobile:anchor:5556
```

## What the doctor script tells us

The doctor script separates these failure classes:

- emulator/system ANR
- input method chooser interfering with tests
- Metro/redbox connectivity issue
- app-level settings/load failure
- app visible and ready for higher-level testing

That keeps us from wasting time fixing app code when Android itself is the problem.

## Near-term plan

1. Keep mobile product changes small.
2. Use the new `testID` contract as the stable automation interface.
3. Stop adding app-side debug hooks for test-only state.
4. Add a proper RN E2E harness next.
5. Move the scroll regression onto that harness once it exists.

## Practical recommendation

For this app, the correct pivot is:

- keep React Native
- keep the current UI work
- improve emulator health tooling
- expose stable selectors
- move toward selector-driven AI testing

That gives us a better process without throwing away the 70% of the app that is already in place.
