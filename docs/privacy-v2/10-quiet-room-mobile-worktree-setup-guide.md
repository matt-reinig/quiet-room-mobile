# Task 10 — Quiet Room Mobile Worktree Setup Guide

## Goal

Document the full setup needed to make a `quiet-room-mobile` worktree actually runnable on this machine.

Plain `git worktree add ...` is not enough for this repo because several critical inputs are intentionally not committed:
- env overlays
- Firebase service files
- Android signing vars
- generated `/ios` and `/android` folders
- local backend and emulator wiring

---

## Why A Generic Git Worktree Guide Is Not Enough

This repo depends on local-only files and regenerated native output.

If you create a new worktree and immediately run Detox or native builds, the most common failures are:
- missing `.env` overlays
- missing `GoogleService-Info*.plist` or `google-services*.json`
- missing signing vars for release builds
- stale or absent `/ios` and `/android`
- local backend scripts pointing at the wrong sibling path from the new worktree location

---

## Recommended Folder Layout

For a mobile-only task:

```text
../worktrees/
  quiet-room-mobile-task-03-ai-consent/
```

For paired mobile/backend work:

```text
../privacy-task-03/
  quiet-room-mobile/
  Gabriel/
```

That paired layout matters because some helper scripts assume the backend is a sibling folder.

---

## Create The Worktree

From the main mobile repo:

```bash
git worktree add -b codex/privacy/task-03-ai-consent \
  /Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-task-03-ai-consent \
  develop
```

Verify it:

```bash
git worktree list
```

For a paired task folder, create both siblings explicitly:

```bash
mkdir -p /Users/mjreinig/projects/Gabriel_App/privacy-task-03

git -C /Users/mjreinig/projects/Gabriel_App/quiet-room-mobile worktree add \
  -b codex/privacy/task-03-ai-consent \
  /Users/mjreinig/projects/Gabriel_App/privacy-task-03/quiet-room-mobile \
  develop

git -C /Users/mjreinig/projects/Gabriel_App/Gabriel worktree add \
  -b codex/privacy/task-03-ai-consent-backend \
  /Users/mjreinig/projects/Gabriel_App/privacy-task-03/Gabriel \
  develop-from-main
```

That gives you the sibling layout the local mobile scripts expect:

```text
/Users/mjreinig/projects/Gabriel_App/privacy-task-03/
  quiet-room-mobile/
  Gabriel/
```

---

## Install Dependencies Inside The Worktree

Each worktree needs its own dependency install because `node_modules/` is ignored and not shared automatically.

```bash
cd /Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-task-03-ai-consent
npm install
```

---

## Copy The Local-Only Files The Worktree Needs

These files are ignored by git and will not appear in a fresh worktree unless you copy or recreate them.

Usually needed:
- `.env`
- `.env.local.qa`
- `.env.qa`
- `.env.prod`
- `.env.android.signing`
- `android-upload-key.jks`
- `GoogleService-Info.qa.plist`
- `GoogleService-Info.prod.plist`
- `google-services.qa.json`
- `google-services.prod.json`

If the base repo already has the right local files, copy them into the worktree:

```bash
cp /path/to/original/quiet-room-mobile/.env* ./ 2>/dev/null || true
cp /path/to/original/quiet-room-mobile/android-upload-key.jks ./ 2>/dev/null || true
cp /path/to/original/quiet-room-mobile/GoogleService-Info*.plist ./ 2>/dev/null || true
cp /path/to/original/quiet-room-mobile/google-services*.json ./ 2>/dev/null || true
```

Do not copy `/ios` or `/android` from another worktree. Re-generate them in place instead.

---

## Verify The Runtime Config Before Building

Use the repo scripts, not guesswork:

```bash
npm run mobile:config:local-qa
npm run mobile:verify:local-qa
```

Useful combinations:
- `qa local`
- `qa qa`
- `prod prod`

The wrapper script `scripts/with-mobile-env.sh` loads:
- base env from `.env`
- overlay env from `.env.local.qa`, `.env.qa`, or `.env.prod`
- signing vars from `.env.android.signing` when present

If `mobile:verify:*` fails, stop there and fix env or Firebase files before generating native projects.

---

## Rebuild Native Projects In Every Worktree

`/ios` and `/android` are ignored in git:

```text
/ios
/android
```

That means every worktree needs its own native sync step.

For local QA:

```bash
npm run native:sync:local-qa
```

For hosted QA:

```bash
npm run native:sync:qa
```

For prod:

```bash
npm run native:sync:prod
```

What this does:
- runs `expo prebuild --clean`
- patches Android Gradle for Detox
- patches the iOS Podfile
- runs `pod install`
- patches iOS signing settings

If you skip this, the worktree may have no native project at all, or may still reflect the wrong app variant.

---

## Android Emulator And Local Backend Details

The local Android path is split across two different hostnames on purpose:
- app running in the emulator uses `http://10.0.2.2:<port>`
- host-side test helpers use `http://127.0.0.1:<port>`

The account deletion script wires those automatically for `qa local`:

```bash
npm run smoke:android:account-deletion:local-qa
```

It also tries to discover the backend port from:

```text
$GABRIEL_BACKEND_ROOT/.gabriel-port
```

Important worktree gotcha:

`run-android-account-deletion.sh` defaults the backend root to `"$ROOT_DIR/../Gabriel"`.

If the mobile worktree lives under:

```text
.../worktrees/quiet-room-mobile-task-03-ai-consent
```

then the default backend lookup becomes:

```text
.../worktrees/Gabriel
```

which is often wrong.

Use one of these fixes:

1. Put the backend beside the mobile worktree in the same task folder.
2. Export `GABRIEL_BACKEND_ROOT` before running the script.
3. Export `LOCAL_BACKEND_PORT` directly if you only need the port.

Example:

```bash
export GABRIEL_BACKEND_ROOT=/Users/mjreinig/projects/Gabriel_App/Gabriel
npm run smoke:android:account-deletion:local-qa
```

---

## Detox Notes

These scripts already encode the safest path:
- `npm run smoke:android:local-qa`
- `npm run smoke:android:account-deletion:local-qa`
- `npm run detox:test:response-smoke:5556`

The Android smoke wrappers do all of this in order:
1. verify env
2. sync native variant
3. build Detox target
4. run Detox with the IPv4 server hook

Prefer those wrappers over ad hoc manual commands.

---

## Release Build Notes

If the task needs signed Android release builds or store prep, the worktree also needs:
- `.env.android.signing`
- `android-upload-key.jks`
- correct Firebase files for the chosen variant

Use these checks before a release build:

```bash
npm run mobile:verify:qa
npm run android:play:preflight:qa
```

or:

```bash
npm run mobile:verify:prod
npm run android:play:preflight:prod
```

---

## Fast Start Checklist

In a new worktree:

1. `npm install`
2. copy `.env*` and Firebase service files
3. run `npm run mobile:verify:local-qa`
4. run `npm run native:sync:local-qa`
5. if using local backend scripts from a standalone worktree, export `GABRIEL_BACKEND_ROOT`
6. run the task-specific smoke or Detox command

---

## Definition Of Done

A worktree is considered ready only when:
- local env files are present
- Firebase service files are present
- config verification passes
- native projects have been regenerated in that worktree
- backend-relative scripts resolve correctly from that folder layout
- the intended smoke or Detox command runs from the worktree without path fixes mid-run
