# Privacy V2 Progress Tracker

## Purpose
Track the execution status of the privacy workstreams defined in `docs/privacy-v2/`.

## Status Values
- not started
- ready
- in progress
- blocked
- ready for review
- merged
- dropped

## Active Workstreams

| Task | Mobile Branch | Backend Branch | Task Folder | Owner | Status | Latest milestone | PRs | Notes |
|---|---|---|---|---|---|---|---|---|
| 01/02/07 Disclosure stream | `codex/privacy/task-01-data-inventory` | — | `../quiet-room-mobile-task-01-data-inventory` | Codex | ready for review | Task 01 implemented; pending final log-retention number from infra/ops | — | covers data inventory, privacy policy alignment, and store submission prep; Task 01 is otherwise complete, with final policy/store wording still waiting on deployed log-retention days |
| 03 AI consent | `codex/privacy/task-03-ai-consent` | — | `../quiet-room-mobile-task-03-ai-consent` | Codex | ready | plan complete | — | mobile-owned unless backend consent persistence is required |
| 04/05 Account deletion stream | `codex/privacy/task-05-mobile-deletion` | `codex/privacy/task-04-backend-deletion` | `../privacy-task-04` | Codex | in progress | emulator-backed backend smoke plus Android release Detox account-deletion smoke now pass for deletion success, deleted-user sign-in rejection, and one-time failure/retry | — | backend owns delete endpoint and shared test hooks; mobile owns in-app deletion flow; backend now has `DELETE /api/account`, `GET /test/user-data`, `POST /test/create-user`, `POST /test/seed-conversations`, and `POST /test/account-deletion-mode` wired for emulator-safe development; local Android QA smoke now verifies deletion success, deleted-auth-user rejection on re-login, and retryable failure behavior end to end |
| 06 iOS login compliance | `codex/privacy/task-06-ios-login` | — | `../quiet-room-mobile-task-06-ios-login` | Codex | blocked | decision needed | — | choose Sign in with Apple vs hide Google on iOS |
| 08 Model gating parity | `codex/privacy/task-08-model-gating-parity` | — | `../quiet-room-mobile-task-08-model-gating-parity` | Codex | ready | plan complete | — | add backend branch later only if a shared feature-flag test hook is needed |

## Account Deletion Stream Notes

Recommended local structure:

```text
../privacy-task-04/
  quiet-room-mobile/   -> branch: codex/privacy/task-05-mobile-deletion
  gabriel-backend/     -> branch: codex/privacy/task-04-backend-deletion
```

Ownership split:
- `gabriel-backend` owns `DELETE /api/account` and shared `/test/*` hooks
- `quiet-room-mobile` owns in-app deletion flow and Playwright mobile coverage
