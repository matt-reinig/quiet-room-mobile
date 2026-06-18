# QR-MOB-027 Production Rollout Plan

## Goal

Coordinate the full Quiet Room production rollout across:

- Gabriel backend production deployment.
- Quiet Room mobile production branch promotion.
- Split-profile enablement for all production users.
- Production smoke verification from a mobile-user perspective.

This task intentionally sits above QR-MOB-025. QR-MOB-025 remains the backend deploy/default-model slice; QR-MOB-027 is the cross-repo production rollout plan and execution checklist.

## Current Branch Snapshot

Captured on 2026-06-18.

### Gabriel Backend

- QA branch: `origin/develop-from-main`
- Production branch: `origin/main`
- QA deployed SHA: `a70292e`
- Current QA proof:
  - Sonnet 4.6 is the default main chat route through `anthropic_fast_chat`.
  - Profile builder defaults to `PROFILE_BUILDER_PROVIDER=anthropic` and `PROFILE_BUILDER_MODEL=claude-sonnet-4-6`.
  - Recent QA profile-builder logs prove Anthropic/Sonnet execution and split-memory writes.

### Quiet Room Mobile

- QA/release-development branch: `origin/develop`
- Production branch: `origin/master`
- `origin/develop` is 87 commits ahead of `origin/master`.
- `origin/master` is 4 commits ahead of `origin/develop`.
- Shared merge base: `8ed6056`.
- Rehearsal merge of `origin/develop` into `origin/master` hit two documentation conflicts:
  - `docs/mobile-internal-testflight-runbook.md`
  - `docs/privacy-v2/progress-tracker.md`

Important mobile version difference:

- `origin/master`: iOS build `13`, Android `versionCode 6`.
- `origin/develop`: iOS build `28`, Android `versionCode 21`.

Important mobile behavior differences in `develop` include model-catalog picker support, report consent, modal/safe-area fixes, keyboard fixes, selectable message text, and the `expo-audio` voice playback switch.

## Rollout Scope

### 1. Backend Prod Rollout

- Reconfirm `origin/develop-from-main` is still the intended backend QA source.
- Rehearse and test the merge into `main`.
- Prepare prod Lambda environment before deploy:
  - `ANTHROPIC_API_KEY` present.
  - `ANTHROPIC_MAX_TOKENS=4096`.
  - `PROFILE_BUILDER_PROVIDER=anthropic`.
  - `PROFILE_BUILDER_MODEL=claude-sonnet-4-6`.
  - `PROFILE_BUILDER_ALLOW_EMPTY_CORE=true`.
- Merge/promote backend QA to `main`.
- Run `./deploy-prod.sh` from `main`.
- Verify all three prod Lambdas:
  - `gabriel_lambda_prod`
  - `gabriel-profile-builder_prod`
  - `gabriel_streaming_lambda_prod`
- Verify prod `/health` for all three Function URLs.

### 2. Split Profile For All Production Users

Enable both prod feature flags for everyone:

- `new_profile_memory_write`
- `new_profile_memory_read`

Expected behavior:

- Existing users without split memory keep falling back to legacy profile reads.
- On the next eligible profile-builder run, split memory is written.
- After split memory exists, chat reads split memory.
- If split memory is missing or empty, legacy profile remains the fallback.

Verification:

- Confirm prod flag docs evaluate on for a production tester.
- Trigger or observe a prod profile-builder run.
- Confirm CloudWatch logs include `profile_builder.split_memory_completed`.
- Confirm Firestore has:
  - `users/{uid}/meta/spiritual_profile_core`
  - `users/{uid}/meta/spiritual_profile_recent`
  - `users/{uid}/meta/spiritual_profile_meta`
  - `users/{uid}/meta/spiritual_profile_history/entries/*`
- Confirm a subsequent chat uses split memory, ideally via logged `profile_source=split_memory` or equivalent proof.

### 3. Mobile Production Branch Rollout

- Use a clean worktree from `origin/master`.
- Merge `origin/develop` into the production branch.
- Resolve the known documentation conflicts by preserving both:
  - master-only production/TestFlight history.
  - newer develop rollout and QA notes.
- Run repo verification:
  - `npm ci` if dependencies are stale.
  - `npm run typecheck`.
  - `npm run mobile:verify:prod`.
  - `npm run native:sync:prod`.
  - iOS prod status/preflight.
  - Android prod status/preflight.
- Decide whether to ship production binaries immediately or stage them after backend prod smoke.

### 4. Mobile Production Smoke

From the production app or production-config build, verify:

- Anonymous or known production sign-in works.
- Feature flags load.
- Model catalog/default model behavior is sane.
- Chat sends and receives a response.
- Conversation history loads.
- Report-response flow works.
- Voice playback works.
- Account/about/support/privacy links still resolve.

### 5. Store Release Follow-Through

If production binaries are part of the same rollout:

- Bump iOS build and Android version code above already uploaded production values.
- Build and upload iOS TestFlight production candidate.
- Build and upload Android Play production/internal candidate.
- Record proof:
  - App Store upload success lines.
  - Play edit id and uploaded version code.
  - Final branch SHA and store metadata values.

## Approval Gates

Do not run these without explicit approval:

- Prod Lambda env mutation.
- Prod backend deploy.
- Prod feature flag upserts.
- Mobile `master` push.
- App Store Connect upload.
- Google Play upload.

## Open Questions

- Should mobile production branch promotion happen in the same rollout as the backend prod deploy, or should it be a follow-up after backend prod smoke?
- Should split-profile flags go directly to 100 percent in prod, or should they start with an allowlisted production tester and then move to everyone after proof?
- What production tester UID should be used for split-profile verification and mobile smoke?
