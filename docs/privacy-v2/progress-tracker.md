# Privacy V2 Progress Tracker

## Purpose
Track the execution status of the privacy workstreams defined in `docs/privacy-v2/`.

## Status Values
- not started
- ready
- in progress
- blocked
- ready for review
- qa
- merged
- dropped

## Active Workstreams

| Task | Mobile Branch | Backend Branch | Task Folder | Owner | Status | Latest milestone | PRs | Notes |
|---|---|---|---|---|---|---|---|---|
| 01/02/07 Disclosure stream | `codex/privacy/task-01-data-inventory` | — | `../quiet-room-mobile-task-01-data-inventory` | Codex | qa | Task 01 implemented; pending QA plus final log-retention number from infra/ops | — | covers data inventory, privacy policy alignment, and store submission prep; Task 01 is otherwise complete, with final policy/store wording still waiting on deployed log-retention days |
| 03 AI consent | `codex/privacy/task-03-ai-consent` | `codex/privacy/task-03-ai-consent-backend` | `../privacy-task-03` | Codex | qa | paired mobile/backend local-QA run is passing, including Android Detox coverage for block-before-consent, accept-and-resume, cold-relaunch persistence, and authenticated backend persistence | — | guest consent gate and local persistence are implemented; authenticated consent now persists through `/api/account/ai-consent` and is visible through `/test/user-data` plus `/test/ai-consent`; worktree-specific setup details are tracked in `10-quiet-room-mobile-worktree-setup-guide.md` |
| 04/05 Account deletion stream | `codex/privacy/task-05-mobile-deletion` | `codex/privacy/task-04-backend-deletion` | `../privacy-task-04` | Codex | qa | Task 05 mobile deletion flow and Android QA smoke coverage are complete; paired backend test hooks are wired and ready for QA | — | backend owns delete endpoint and shared test hooks; mobile owns in-app deletion flow; backend now has `DELETE /api/account`, `GET /test/user-data`, `POST /test/create-user`, `POST /test/seed-conversations`, and `POST /test/account-deletion-mode` wired for emulator-safe development; local Android QA smoke verifies deletion success, deleted-auth-user rejection on re-login, and retryable failure behavior end to end |
| 06 iOS login compliance | `codex/privacy/task-06-ios-login` | — | `../worktrees/quiet-room-mobile-task-06-ios-login` | Codex | qa | Apple sign-in is implemented and the iOS Detox compliance spec passes on simulator | — | Sign in with Apple selected; Expo config, Firebase Apple credential exchange, login UI, native iOS regeneration, and `e2e/quiet-room.ios-login-compliance.test.js` are complete in the dedicated worktree |
| 08 Model gating parity | `codex/privacy/task-08-model-gating-parity` | — | `../worktrees/quiet-room-mobile-task-08-model-gating-parity` | Codex | qa | full model-gating matrix is implemented and passing in iOS Detox, including stale-model fallback and live feature-flag refresh | — | mobile now derives allowed chat models from `GET /api/feature_flags`, hides chat chrome for the single-model/no-voice state, supports launch-url flag overrides for deterministic Detox permutations, and normalizes Android-only local host aliases to `localhost` on iOS simulator |
| 12 Policy site/account deletion update | `develop` (`57ab67a`) | — | `../quiet-room-mobile` | Codex | merged | privacy/account-deletion/support site updates and About modal privacy links are committed directly to `develop`; production Vercel site is deployed and all public routes return 200 | direct commit to `develop` | refreshed data inventory and public `/privacy`, `/account-deletion`, and `/support` copy now reflect the profile icon deletion flow, concrete support path, OpenAI sharing/consent behavior, and 90-day metadata-first log retention/deletion exceptions; About modal no longer exposes build/API details and links to Privacy Policy, Support, and Account Deletion; iOS About modal visual Detox test passed |

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
