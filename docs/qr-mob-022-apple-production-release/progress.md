# QR-MOB-022 - Progress

## Current Status

We have the release worktree created and the branch is merged with `origin/develop` in commit `19b8490`.

## What Has Happened So Far

- Created a separate worktree at `../worktrees/quiet-room-mobile-qr-mob-022-prod-release`.
- Branched it from `origin/master` as `codex/qr-mob-022-prod-release`.
- Merged `origin/develop` into the release branch.
- Resolved the only merge conflicts in:
  - `docs/mobile-internal-testflight-runbook.md`
  - `docs/privacy-v2/progress-tracker.md`
- Copied the sibling release env files into this worktree:
  - `.env`
  - `.env.prod`
  - `.env.qa`
  - `.env.android.signing`
- Re-ran the prod verification probes from the fresh worktree.

## What The First Probes Showed

- `npm run mobile:verify:prod` resolves the correct prod app identity:
  - app name: `Quiet Room`
  - bundle/package id: `com.quietroom.mobile`
  - release env: `prod`
  - API and streaming URLs are correct
  - Firebase project is correct
  - but the fresh worktree is still missing the generated prod Google services files
- `npm run ios:testflight:status:prod` cannot run yet because this worktree does not have a generated `ios/` tree.
- `npm run android:play:status:prod` shows the prod version metadata, but also confirms the native Android build files and upload keystore still need the prod sync step in this worktree.

## Next Steps

1. Run `npm run native:sync:prod`.
2. Rerun `npm run mobile:verify:prod`, `npm run ios:testflight:preflight:prod`, and `npm run android:play:preflight:prod`.
3. Build and upload the prod iOS candidate.
4. Build and upload the prod Android candidate.
5. Run the exact-build smoke checks.
6. Update the tracker docs with the release evidence.
7. Leave the final App Review submission untouched.
