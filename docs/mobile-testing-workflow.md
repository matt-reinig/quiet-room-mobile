# Mobile Testing Workflow

## Current position

The mobile workflow is now selector-first and AI-assisted, not manual-first.

The React Native app stays focused on product behavior, while emulator normalization, device diagnosis, and automation orchestration live in `scripts/`.

For the broader rationale and the selector-driven direction, see `docs/mobile-ai-testing-workflow.md`.
For the QR-MOB-029 E2E audit, current coverage matrix, and release-smoke recommendation, see `docs/e2e-current-state.md`.

## Current tooling

From `quiet-room-mobile/`:

```powershell
npm run smoke:android:qa
npm run smoke:ios:qa
npm run mobile:start:5556
npm run mobile:doctor:5556
npm run mobile:anchor:5556
```

## Tool roles

- `smoke:android:qa` / `smoke:ios:qa`
  - regenerate native projects for the selected QA variant
  - build a release-style Detox app
  - run the primary prompt/response smoke spec
- `mobile:start:5556`
  - boots or reuses the emulator
  - normalizes Android settings
  - brings Metro up
  - launches the app
- `mobile:doctor:5556`
  - decides whether the failure is emulator-level or app-level
  - captures XML, screenshot, and recent logcat
- `mobile:anchor:5556`
  - keeps the old coarse scroll smoke check available
  - should not be treated as the final oracle for subtle RN motion issues

## Testing boundary

Use stable `testID` selectors in the app whenever possible.
The selector contract lives in `src/testIds.ts`.

For the focused native streaming verification flow, see `docs/mobile-streaming-verification.md`.
For emulator runs against a backend on your machine, see `docs/mobile-local-backend-testing.md`.

Use `uiautomator` only for coarse validation such as:

- app booted to the expected screen
- a system dialog is blocking the run
- a screenshot or XML dump is needed for diagnosis

Do not use `uiautomator` as the main source of truth for:

- anchored scroll behavior
- keyboard transitions
- immediate post-send layout changes
- interaction timing

## Supplemental Maestro smoke

Detox remains the recommended primary harness.

The optional Maestro proof of concept is intentionally shallow and assumes a build is already installed:

```powershell
MAESTRO_APP_ID=com.quietroom.mobile.qa maestro test maestro/quiet-room-smoke.yaml
```

Use it only as a quick installed-app shell check. Use Detox for prompt/response, backend, auth, layout, persistence, and selector-rich behavior.
