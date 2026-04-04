# Mobile Local Backend Testing

This is the practical setup for running the React Native app against a backend on your machine instead of the default QA endpoints.

Use this when you need one or more of these:

- backend logs for `/api/chat/stream`, `/api/voice_stream`, or `/api/feature_flags`
- verification of backend changes before deployment
- emulator-side Detox coverage against local code

## Core rule

The Android emulator cannot reach your machine with `localhost`.

From the mobile app, use:

```env
EXPO_PUBLIC_API_BASE=http://10.0.2.2:5000
EXPO_PUBLIC_STREAMING_BASE=
```

From the backend itself, bind normally on port `5000`.

## Important auth constraint

The mobile app in this repo is currently configured for the QA Firebase project in [`.env`](/d:/Gabriel%20App/quiet-room-mobile/.env).

That means a local backend must verify QA Firebase ID tokens too. If you start the backend with the default prod service account from [`Gabriel/.env`](/d:/Gabriel%20App/Gabriel/.env), mobile startup can stall and authenticated calls like `/api/feature_flags` can return `401`.

For local mobile testing, make sure the backend and app point at the same Firebase project.

In practice for the current repo defaults:

- mobile app: QA Firebase config
- local backend: QA Firebase admin credentials
- backend env: `GABRIEL_ENV=qa`
- feature flag env: `FEATURE_FLAG_ENV=qa`

## Backend startup

From [`Gabriel`](/d:/Gabriel%20App/Gabriel), start the backend with the local URLs and the Firebase admin credentials that match the mobile app.

Minimum overrides:

```powershell
$env:GABRIEL_ENV = "qa"
$env:FEATURE_FLAG_ENV = "qa"
$env:PROFILE_BUILDER_LAMBDA_URL = "http://127.0.0.1:5000/internal/profile-builder"
$env:STREAMING_LAMBDA_URL = "http://127.0.0.1:5000/api/chat/stream"
$env:BACKEND_LOG_PATH = "logs/backend-dev.log"
```

You also need `FIREBASE_SERVICE_ACCOUNT_JSON` for the same Firebase project the app is using.

Then run:

```powershell
cd d:\Gabriel App\Gabriel
.venv\Scripts\python.exe gabriel_backend.py
```

Quick health check:

```powershell
Invoke-WebRequest http://127.0.0.1:5000/health
```

Expected result:

```json
{"status":"ok"}
```

## Mobile app override

Create a temporary [`.env.local`](/d:/Gabriel%20App/quiet-room-mobile/.env.local) in [`quiet-room-mobile`](/d:/Gabriel%20App/quiet-room-mobile):

```env
EXPO_PUBLIC_API_BASE=http://10.0.2.2:5000
EXPO_PUBLIC_STREAMING_BASE=
EXPO_PUBLIC_RENDER_MODE=native
```

`EXPO_PUBLIC_STREAMING_BASE` should stay empty here so both chat and voice route through the same local backend.

## Recommended verification paths

### Manual emulator checks

From [`quiet-room-mobile`](/d:/Gabriel%20App/quiet-room-mobile):

```powershell
npm run mobile:start:5556
npm run mobile:doctor:5556
```

Use this when you want a quick sanity check and recent logcat output.

### Attached-emulator Detox

For focused native streaming checks, use the smoke test in [`quiet-room.streaming-smoke.test.js`](/d:/Gabriel%20App/quiet-room-mobile/e2e/quiet-room.streaming-smoke.test.js).

Debug is useful for iteration:

```powershell
npm run detox:build:debug
npx detox test -c android.att.debug --device-name emulator-5556 e2e/quiet-room.streaming-smoke.test.js --record-logs all --take-screenshots failing
```

Release is the more reliable proof when env overrides matter, because it uses bundled JS instead of depending on Metro state:

```powershell
npx detox build -c android.att.release
npx detox test -c android.att.release --device-name emulator-5556 e2e/quiet-room.streaming-smoke.test.js --record-logs all --take-screenshots failing
```

If your attached emulator has a different id, replace `emulator-5556` with the actual device name from:

```powershell
adb devices
```

## What success looks like

For the streaming smoke run, local backend logs should show:

- `GET /api/feature_flags` with `200`
- `POST /api/chat/stream` with `200`
- `GET /api/voice_stream?...` with `200`

That combination confirms:

- auth/bootstrap succeeded against the local backend
- text streaming used the local chat route
- voice playback used the local `GET /api/voice_stream` route

## Common failure cases

### `405` on voice playback

Likely cause:

- the app is still pointed at a backend that only supports `POST /api/voice_stream`

Check:

- the mobile build actually contains the local API override
- the backend you are hitting includes the new `GET /api/voice_stream`

### `401` on `/api/feature_flags`

Likely cause:

- backend Firebase admin credentials do not match the mobile app Firebase project

This was the main local-testing failure during verification.

### Debug build still looks pointed at QA

Likely cause:

- Metro or debug runtime is still serving JS built with older env values

Use the release Detox path when you need a clean proof that the app is using the local API base.

## Cleanup

When you are done:

- remove [`.env.local`](/d:/Gabriel%20App/quiet-room-mobile/.env.local)
- stop the local backend
- rebuild/relaunch the app if you want to return to the default QA endpoints

## Related docs

- [`docs/mobile-testing-workflow.md`](/d:/Gabriel%20App/quiet-room-mobile/docs/mobile-testing-workflow.md)
- [`docs/mobile-streaming-verification.md`](/d:/Gabriel%20App/quiet-room-mobile/docs/mobile-streaming-verification.md)
- [`testing.md`](/d:/Gabriel%20App/testing.md)
