# Mobile Streaming Verification

This is the focused emulator-side check for the two mobile behaviors that matter here:

- text chat streams before the full response completes
- tapping the assistant voice button reaches native playback

## Preconditions

- Use the attached emulator config (`emulator-5556`) after your current task is finished.
- Keep `quiet-room-mobile/.env` pointed at the backend you want to test.
  - Current default in this repo is QA.
  - If you want backend logs for `/api/chat/stream` and `/api/voice_stream`, switch to a local backend first.
  - For the exact local-backend setup, including the Firebase project matching requirement, see `docs/mobile-local-backend-testing.md`.
- From repo root, follow the backend/frontend expectations in `testing.md` when running against local services.

## One-time build

From `quiet-room-mobile/`:

```powershell
npm run detox:build:debug
```

This uses `scripts/prepare-detox-build.ps1` and stages the APKs in `D:\Temp\quiet-room-mobile-detox`.

## Recommended preflight

From `quiet-room-mobile/`:

```powershell
npm run mobile:doctor:5556
```

Use this before the streaming test if the emulator looks unhealthy or if Android system UI has stolen focus.

## Focused streaming run

From `quiet-room-mobile/`:

```powershell
npm run detox:test:streaming:5556
```

This runs `e2e/quiet-room.streaming-smoke.test.js` against the attached emulator.

## What the Detox test checks

1. Sends a prompt in the native app.
2. Verifies an assistant message row appears before the send button returns to `Send`.
   - This is the key text-streaming assertion.
3. Waits for the response to finish.
4. Taps the assistant voice button.
5. Waits for the button accessibility label to change to `Pause voice`.
   - This confirms native playback started.

## Useful fallback runs

If the focused test fails and you want to separate general app issues from streaming-specific ones:

```powershell
npm run detox:test:composer:5556
npm run mobile:doctor:5556
```

## Artifacts

The Detox scripts are configured with:

- `--record-logs all`
- `--take-screenshots failing`

Doctor artifacts land under `quiet-room-mobile/test-artifacts/`.

## Current file map

- `e2e/quiet-room.streaming-smoke.test.js`
- `e2e/testIds.js`
- `src/hooks/useChatController.ts`
- `src/components/MessageVoiceButton.tsx`

