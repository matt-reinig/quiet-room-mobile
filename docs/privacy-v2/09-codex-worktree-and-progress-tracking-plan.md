# Task 09 — Codex Worktree And Progress Tracking Plan

## Goal

Define a repeatable way to run each privacy task in its own Codex-driven worktree, keep branch naming consistent, reduce task collision, and track progress in one place.

This v2 version also defines how paired mobile/backend streams should use emulator-backed infrastructure when the task touches account creation or deletion.

---

## One Task = One Execution Stream

Each major privacy stream should get:
- its own git branch
- its own worktree or paired task folder
- its own Codex session
- its own progress row in the tracker

For paired-repo work, use one task folder containing both repos side-by-side.

---

## Paired-Repo Task Guidance

Some privacy streams span both the mobile repo and the Gabriel backend repo.

When that happens, create a task-level folder that contains both repos side-by-side instead of forcing one repo to own the whole stream.

### Example — Account deletion stream

```text
../privacy-task-04/
  quiet-room-mobile/   -> branch: codex/privacy/task-05-mobile-deletion
  gabriel-backend/     -> branch: codex/privacy/task-04-backend-deletion
  notes.md             -> optional local notes
```

### Ownership rule

For account deletion:
- `gabriel-backend` owns:
  - `DELETE /api/account`
  - `/test/user-data`
  - `/test/create-user`
  - `/test/seed-conversations`
  - shared test-endpoint gating
- `quiet-room-mobile` owns:
  - in-app deletion entry point
  - confirmation modal
  - deletion request call
  - local-state cleanup
  - Playwright mobile flow

The mobile branch should not invent backend endpoint contracts in parallel with the backend branch.
The backend branch defines the API contract first.

---

## Emulator-First Rule For Deletion Work

If a task touches account creation, account deletion, or destructive user-data flows, prefer emulator-backed infrastructure during development and Playwright automation.

For the account deletion stream, the preferred path is:

Playwright / mobile test app
-> test backend
-> Firebase Auth Emulator
-> Firestore Emulator

This avoids any risk to:
- production auth users
- production Firestore data
- your real account
- other real user accounts

Deletion work should not rely on prod-backed verification.

---

## Progress Tracker Rule

Use `docs/privacy-v2/progress-tracker.md` as the durable source of truth.

For paired-repo streams, keep one row that includes:
- mobile branch
- backend branch
- shared task folder
- ownership notes

---

## Recommended Immediate Next Move

For the deletion stream:
1. create paired task folder
2. point backend branch at emulator-backed infrastructure
3. keep mobile pointed at the paired test backend
4. run Playwright only against that safe path

---

## Definition Of Done

- each task has a clear worktree/task-folder strategy
- paired-repo streams have clear ownership
- deletion work has an emulator-first rule written down
- progress is tracked in `progress-tracker.md`
