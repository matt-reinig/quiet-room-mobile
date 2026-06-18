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

Commit inventory for the pre-rollout review lives in `docs/qr-mob-027-production-commit-inventory.md`.

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
- `origin/develop` is 90 commits ahead of `origin/master`.
- `origin/master` is 4 commits ahead of `origin/develop`.
- Shared merge base: `8ed6056`.
- Rehearsal merge of `origin/develop` into `origin/master` hit two documentation conflicts:
  - `docs/mobile-internal-testflight-runbook.md`
  - `docs/privacy-v2/progress-tracker.md`

Important mobile version difference:

- `origin/master`: iOS build `13`, Android `versionCode 6`.
- `origin/develop`: iOS build `28`, Android `versionCode 21`.

Important mobile behavior differences in `develop` include model-catalog picker support, report consent, modal/safe-area fixes, keyboard fixes, selectable message text, and the `expo-audio` voice playback switch.

## Execution Status

Updated on 2026-06-18.

### Completed Without Approval-Gated Production Changes

- Reconfirmed backend promotion source: `origin/main` at `34f95ec`, `origin/develop-from-main` at `a70292e`.
- Verified the existing backend merge rehearsal in `../worktrees/Gabriel-qr-mob-025-prod-main-rollout`:
  - `git diff --cached --check`
  - `.venv/bin/python -m pytest tests/test_chat_models.py tests/test_model_broker.py tests/test_model_catalog.py tests/test_profile_builder_provider_routing.py tests/test_profile_builder_split_memory.py tests/test_chat_stream_prompt.py`
  - `.venv/bin/python -m pytest --ignore=tests/test_lambda_entrypoint.py`
- Created the mobile production promotion candidate in `../worktrees/quiet-room-mobile-prod-master-rollout` on branch `codex/quiet-room-mobile-prod-master-rollout`.
- Merged current `origin/develop` at `74375fa` into the production branch candidate based on `origin/master` at `1cab1e6`.
- Resolved the two expected documentation conflicts by preserving the newer develop notes and the existing production/TestFlight history.
- Committed the local mobile merge as `33b0779` (`Merge develop into production rollout branch`).
- Reused ignored local prod env, Firebase, and Android signing files from the main mobile checkout for verification only.
- Ran mobile production verification:
  - `npm ci`
  - `npm run typecheck`
  - `npm run mobile:verify:prod`
  - `npm run native:sync:prod`
  - `bash ./scripts/prepare-ios-testflight.sh --version 1.0.0 --build-number 28`
  - `npm run ios:testflight:status:prod`
  - `npm run ios:testflight:preflight:prod`
  - `npm run android:play:status:prod`
  - `npm run android:play:preflight:prod`

### Backend Production Deploy Completed

- Explicit approval received on 2026-06-18 for the backend production deploy.
- Promoted backend `origin/develop-from-main` at `a70292e` to `origin/main` with merge commit `f191fd8` (`Promote QA backend to production`).
- Ran `./deploy-prod.sh` from local branch `main` at `f191fd8`.
- Built and pushed prod ECR image `054769575180.dkr.ecr.us-east-1.amazonaws.com/gabriel-backend-prod:f191fd8`.
- Updated prod Lambdas:
  - `gabriel_lambda_prod`
  - `gabriel-profile-builder_prod`
  - `gabriel_streaming_lambda_prod`
- Confirmed all three prod Lambdas report `Active`, `LastUpdateStatus=Successful`, and image `gabriel-backend-prod:f191fd8`.
- Updated prod Lambda env readiness while preserving existing prod variables:
  - `ANTHROPIC_API_KEY` present on all three prod Lambdas.
  - `ANTHROPIC_MAX_TOKENS=4096` on all three prod Lambdas.
  - `PROFILE_BUILDER_PROVIDER=anthropic`, `PROFILE_BUILDER_MODEL=claude-sonnet-4-6`, and `PROFILE_BUILDER_ALLOW_EMPTY_CORE=true` on `gabriel-profile-builder_prod`.
- Verified prod `/health` returned HTTP 200 for all three Function URLs.

### Mobile Production Deploy Completed

- Explicit approval received on 2026-06-18 for the mobile production deploy.
- Pushed the mobile production candidate to `origin/master` at `98b99f5`.
- Production binary source commit: `98b99f5` (`Record backend production deploy proof`).
- iOS production deploy:
  - Ran `npm run ios:testflight:deploy:prod`.
  - Archived `QuietRoom` build `28` to `build/ios-prod-b28.xcarchive`.
  - Verified archive entitlements:
    - `application-identifier: SV7SPMY2Q8.com.quietroom.mobile`
    - `com.apple.developer.applesignin: Default`
  - App Store Connect upload completed with `Uploaded QuietRoom` and `** EXPORT SUCCEEDED **`.
- Android production deploy:
  - Ran `bash ./scripts/with-mobile-env.sh prod prod bash -lc 'cd android && ./gradlew bundleRelease'`.
  - Built signed AAB `android/app/build/outputs/bundle/release/app-release.aab`.
  - AAB SHA256: `e00c9c96df522f0a4a2a1850ebfbcb79c6c2d575978cada8888f5fc4229cfd5f`.
  - Uploaded to Google Play package `com.quietroom.mobile` internal track through Play edit `04628924593668462994`.
  - Uploaded Android `versionCode 21`.
  - Track readback confirmed `PROD internal 21`, `versionCodes ["21"]`, `status draft`.

### Still Approval-Gated

- Prod feature flag upserts have not been run.
- Production mobile smoke from the uploaded app builds has not been run.
- App Store review submission / public production release has not been run.
- Play production rollout beyond the internal draft release has not been run.

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

- Confirm prod flag docs evaluate on for production smoke user `newuser@example.com`.
- Trigger or observe a prod profile-builder run for `newuser@example.com`.
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

From the production app or production-config build, use `newuser@example.com` to verify:

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

- Should split-profile flags go directly to 100 percent in prod, or should they start with an allowlisted production tester and then move to everyone after proof?
