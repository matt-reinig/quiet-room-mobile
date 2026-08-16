# QR-MOB-022 - Apple Production Release Prep

## Goal

Prepare the first production Quiet Room App Store release all the way through release-candidate validation, store metadata readiness, privacy/disclosure checks, and build uploads, but stop before the final App Review submission step.

## Boundary

Do everything needed to get to a review-ready production release, except clicking the final submit-for-review action in App Store Connect.

## Current Starting State

- We have a dedicated release worktree at `../worktrees/quiet-room-mobile-qr-mob-022-prod-release`.
- The release branch has already been merged with `origin/develop`.
- The branch keeps the prod app identity: `Quiet Room` / `com.quietroom.mobile`.
- The repo already contains the release wiring for prod iOS and Android scripts, privacy policy work, disclosure docs, and store note docs.
- The fresh worktree still needs the sibling env and signing files copied in before the prod verification scripts can run cleanly.

## Plan

1. Keep the work isolated in the dedicated release worktree.
2. Verify prod config, signing, and native readiness.
3. Regenerate the native prod targets if the generated iOS/Android trees are missing or stale.
4. Rerun the prod preflight checks until the release inputs are aligned.
5. Build and upload the exact prod iOS candidate through App Store Connect/TestFlight.
6. Build and upload the exact prod Android candidate through Play.
7. Smoke-test the exact candidates against production backend/Firebase.
8. Record the release evidence and update the tracker docs.
9. Stop short of the final App Review submission.

## Success Criteria

- Prod config is verified from the release worktree.
- Prod native targets are regenerated and healthy.
- iOS and Android prod candidates are built and uploaded.
- Exact-build smoke checks are recorded.
- Store submission can proceed, but the final submit action has not been taken yet.
