# Task 17 - Production App Release Rollout Plan

## Goal

Promote the current production-ready Quiet Room mobile and Gabriel backend work into the production branches, deploy the backend, prepare the production mobile store candidates, and complete release-candidate smoke validation before public store submission.

This task exists to coordinate the final rollout across the two repos:

- backend: `Gabriel`
- mobile app: `quiet-room-mobile`

---

## Why This Task Exists

The privacy, account deletion, AI consent, reporting, and store-disclosure work spans both repos. Production rollout needs to be deliberate because branch state, deployed backend state, mobile store build state, Firebase config, and store-console state can all differ.

The key risk is assuming that a branch being current means production is current. This task separates:

- branch promotion
- merge conflict resolution
- backend deployment
- mobile release-candidate build/upload
- exact-build smoke validation
- final store-console submission readiness

---

## Important Boundary

This task is a production rollout plan, not an automatic deploy instruction.

Do not merge, push, deploy, or upload store builds until the release owner explicitly confirms the go-ahead for that step.

Do not use a dirty `Gabriel` worktree for the production merge or production deploy. Use a clean temporary worktree from `origin/main` so unrelated local changes are not accidentally promoted.

---

## Current Starting State

Observed on 2026-04-24 after fetching remotes:

- `quiet-room-mobile` is clean on `develop` and up to date with `origin/develop`.
- `quiet-room-mobile` production branch is `master`.
- `quiet-room-mobile` GitHub default branch is `master`.
- `quiet-room-mobile` current metadata is version `1.0.0`, iOS build `13`, Android versionCode `6`.
- `Gabriel` main worktree is on `main` and up to date with `origin/main`, but has uncommitted local changes and untracked files.
- local `Gabriel` branch `develop-from-main` is stale.
- `origin/develop-from-main` is the current backend QA/integration branch and is ahead of local `develop-from-main`.
- `Gabriel` GitHub default branch is currently `develop-from-main`, but production deployment expects the repo branch to be `main`.

Known `Gabriel` branch comparison:

- `origin/develop-from-main` contains backend privacy/release work including account deletion, AI consent persistence, operational logging minimization, and response reports.
- `origin/main` contains macOS/Linux production Lambda deploy scripts.
- the merge must preserve `deploy-prod.sh` from `main`.
- `deploy.sh` exists on both sides and should be reconciled, not blindly overwritten.

---

## Required Outputs

This task must produce all of the following:

1. clean backend production merge from `origin/develop-from-main` into `main`
2. clean mobile production merge from `develop` into `master`
3. backend test evidence before deploy
4. backend production deploy evidence after deploy
5. mobile production preflight evidence for iOS and Android
6. production store-candidate build/upload evidence
7. exact-build smoke-test notes
8. final go/no-go checklist before store submission

---

## Scope

### In scope

- branch freshness checks
- clean production merge worktrees
- backend merge conflict resolution
- backend tests
- backend Lambda production deployment
- mobile production branch promotion
- mobile production preflights
- production iOS TestFlight/App Store Connect candidate preparation
- production Android Play candidate preparation
- exact-build release-candidate smoke checks

### Out of scope

- changing product behavior during the rollout unless a blocker is discovered
- committing unrelated local changes from dirty worktrees
- changing store disclosure answers unless validation proves they are stale
- bypassing App Store Connect or Play Console review requirements

---

## Implementation Plan

### Step 1 - Freeze and fetch both repos

Before merging anything, fetch both repos and record branch state.

From `quiet-room-mobile`:

```bash
git fetch --prune origin
git status --short --branch
git log --oneline --decorate --graph --left-right --cherry-pick origin/master...origin/develop -n 80
```

From `Gabriel`:

```bash
git fetch --prune origin
git status --short --branch
git log --oneline --decorate --graph --left-right --cherry-pick origin/main...origin/develop-from-main -n 80
```

Deliverable:

- explicit confirmation that the branch tips are still the intended release tips
- explicit list of dirty local changes that must not be included

---

### Step 2 - Create a clean backend production merge worktree

Because the main `Gabriel` worktree has local changes, create a clean worktree from `origin/main`.

Example:

```bash
cd /Users/mjreinig/projects/Gabriel_App
git -C Gabriel worktree add ../Gabriel-prod-rollout origin/main
cd Gabriel-prod-rollout
git switch -c prod-rollout-from-develop-main
```

Then merge the current backend integration branch:

```bash
git merge --no-ff origin/develop-from-main
```

Expected conflict area:

- `deploy.sh`
- deploy docs if both sides changed them

Merge rule:

- keep `deploy-prod.sh` available for production
- keep the QA deploy behavior in `deploy.sh`
- make `docs/deploy.md` and `docs/prod-roll-process.md` match the final scripts

Deliverable:

- clean backend merge commit ready to become `main`

---

### Step 3 - Run backend verification before deploy

Run the backend test set from the clean rollout worktree.

Suggested minimum:

```bash
python -m pytest tests/test_backend_import_safe.py tests/test_logging_helpers.py tests/test_report_response.py
python -m pytest tests/test_backend_contracts_baseline.py
```

Also confirm production deploy prerequisites:

```bash
git branch --show-current
docker buildx version
aws sts get-caller-identity
```

Deliverable:

- passing backend test notes
- AWS account confirmation for production
- Docker/buildx readiness confirmation

---

### Step 4 - Push backend production branch

After tests pass and the release owner approves, update `main`.

Preferred approach:

```bash
git push origin HEAD:main
```

Deliverable:

- `origin/main` contains the backend production merge
- merge commit SHA recorded for deploy

---

### Step 5 - Deploy backend production

Deploy only from a clean checkout where `git branch --show-current` returns `main`.

Production script:

```bash
./deploy-prod.sh
```

Post-deploy verification:

```bash
aws lambda get-function --function-name gabriel_lambda_prod --region us-east-1 --query '[Configuration.LastUpdateStatus,Code.ImageUri]' --output text
aws lambda get-function --function-name gabriel-profile-builder_prod --region us-east-1 --query '[Configuration.LastUpdateStatus,Code.ImageUri]' --output text
aws lambda get-function --function-name gabriel_streaming_lambda_prod --region us-east-1 --query '[Configuration.LastUpdateStatus,Code.ImageUri]' --output text
```

Deliverable:

- all three production Lambdas show `Successful`
- all three production Lambdas point at the same intended SHA image
- production `/health` responds successfully

---

### Step 6 - Promote mobile `develop` into `master`

From `quiet-room-mobile`, confirm the worktree is clean and promote `develop` to `master`.

Suggested flow:

```bash
git checkout master
git pull --ff-only origin master
git merge --no-ff origin/develop
```

Then run quick repo checks before pushing:

```bash
npm run typecheck
npm run mobile:verify:prod
```

After approval:

```bash
git push origin master
```

Deliverable:

- `origin/master` contains the mobile release candidate
- mobile release commit SHA recorded

---

### Step 7 - Run mobile production preflights

From `quiet-room-mobile` on `master`, confirm the production config and store build state.

```bash
npm run mobile:verify:prod
npm run ios:testflight:preflight:prod
npm run android:play:preflight:prod
```

If native projects need to be regenerated for the production candidate:

```bash
npm run native:sync:prod
```

If native sync changes version/build metadata, rerun the relevant prepare and preflight scripts after sync.

Deliverable:

- production app identity confirmed as `Quiet Room`
- iOS bundle id confirmed as `com.quietroom.mobile`
- Android package id confirmed as `com.quietroom.mobile`
- prod Firebase files confirmed
- prod backend URLs confirmed
- Android upload key readiness confirmed
- iOS privacy manifest confirmed for the production target/output

---

### Step 8 - Build and upload production store candidates

#### iOS

Use the production TestFlight/App Store Connect path documented in `docs/mobile-internal-testflight-runbook.md`.

Minimum before upload:

```bash
npm run ios:testflight:preflight:prod
```

Record:

- version
- build number
- bundle id
- App Store Connect destination
- upload result

#### Android

Use the production Play path documented in `docs/mobile-play-internal-testing-runbook.md`.

Minimum before build:

```bash
npm run android:play:preflight:prod
```

Build:

```bash
bash ./scripts/with-mobile-env.sh prod prod bash -lc 'cd android && ./gradlew bundleRelease'
```

Record:

- version
- versionCode
- package id
- AAB path
- SHA256
- Play upload result

Deliverable:

- production iOS candidate uploaded or ready for upload
- production Android candidate uploaded or ready for upload

---

### Step 9 - Smoke the exact production candidates

Smoke test the exact build artifacts that will go to store review.

Minimum smoke:

- install and open app
- confirm production backend/Firebase config
- sign in or guest flow as appropriate
- accept AI consent before first message
- send one message and confirm one response renders
- report one response if the feature is enabled in the candidate
- verify About links for Privacy Policy, Support, and Account Deletion
- verify signed-in account deletion path: profile icon -> `Delete Account`
- iOS only: confirm Sign in with Apple is visible and usable
- Android only: confirm the release manifest still does not request microphone, storage/media, camera, contacts, location, overlay, or notification permissions

Deliverable:

- smoke notes tied to exact iOS build number and Android versionCode

---

### Step 10 - Final store submission go/no-go

Before store submission or broader release, confirm:

- backend production Lambdas are on the intended SHA
- mobile `master` is on the intended release SHA
- iOS and Android candidates point at production backend/Firebase
- public URLs return `200`
- store disclosure worksheet still matches the final build
- App Store Connect privacy answers are entered
- Play Data safety and app-content answers are entered
- reviewer notes are ready
- rollback path is understood

Deliverable:

- final go/no-go decision

---

## Rollback Notes

Backend rollback should use the previous known-good Lambda image SHA if a production issue appears after deploy.

Mobile rollback depends on store state:

- before submission: upload a corrected candidate
- during review: remove/reject the candidate and upload a corrected build
- after public release: submit an expedited/hotfix build if needed

Do not delete or rewrite release branch history as a rollback mechanism.

---

## Completion Criteria

This task is complete when:

- `Gabriel/main` contains the intended backend work
- backend production deployment is complete and verified
- `quiet-room-mobile/master` contains the intended mobile work
- production iOS and Android candidates are prepared/uploaded
- exact candidate smoke validation is recorded
- store submission can proceed from a known, documented state
