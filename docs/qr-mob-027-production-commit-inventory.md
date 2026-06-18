# QR-MOB-027 Production Commit Inventory

## Purpose

This document lists the commits expected to enter production as part of QR-MOB-027 before the actual rollout trigger is pulled.

Captured on 2026-06-18.

## Branch Snapshot

### Gabriel Backend

- Production branch: `origin/main` at `34f95ec`
- QA branch to promote: `origin/develop-from-main` at `a70292e`
- New backend commits queued for prod: 14

### Quiet Room Mobile

- Production branch: `origin/master` at `1cab1e6`
- QA/development branch to promote: `origin/develop` at `d69b095`
- Shared merge base: `8ed6056`
- New mobile commits queued for prod from `develop`: 88
- Mobile production-branch-only commits to preserve during merge: 4

## Gabriel Commits Queued For Prod

These are the commits in `origin/main..origin/develop-from-main`.

| Commit | Date | Description |
| --- | --- | --- |
| `f79e1ac` | 2026-05-21 | Scrubs bare timestamp metadata from chat output so internal temporal fields do not leak into user-facing responses. |
| `af881be` | 2026-05-22 | Improves retry recovery when the model returns internal or malformed output. |
| `1addee1` | 2026-05-22 | Adds always-on guardrails for internal metadata output, independent of targeted QA flags. |
| `30fe7c4` | 2026-05-28 | Adds backend-owned model catalog routing so clients can consume backend model availability/defaults. |
| `0760a33` | 2026-05-28 | Documents the QR-MOB-006 QA deploy path and validation evidence. |
| `f4bff7c` | 2026-05-28 | Documents the QR-MOB-006 QA store deploy follow-through. |
| `497c843` | 2026-05-31 | Adds voice/TTS observability so playback and TTS behavior can be correlated safely. |
| `83edd1a` | 2026-05-31 | Tightens Sonnet timestamp handling and temporal reasoning prompt behavior. |
| `4839c02` | 2026-06-03 | Adds report-content consent snapshots for feedback/report-response flows. |
| `81dc46d` | 2026-06-03 | Documents voice playback history and related rollout context. |
| `0ebd257` | 2026-06-06 | Adds the QR-MOB-018 dynamic persona/profile eval plan. |
| `04abf8e` | 2026-06-14 | Tightens Sonnet scripture translation prompts. |
| `4f5ce3f` | 2026-06-14 | Defaults main chat and profile builder to Sonnet 4.6, including Anthropic profile-builder routing. |
| `a70292e` | 2026-06-17 | Corrects Psalm 131 Grail wording in the Sonnet scripture prompt/tests. |

## Quiet Room Mobile Commits Queued For Prod

These are the commits in `origin/master..origin/develop`.

| Commit | Date | Description |
| --- | --- | --- |
| `965a34c` | 2026-04-24 | Documents the production internal store upload flow. |
| `8464cf4` | 2026-04-26 | Fixes iOS login and modal naming issues. |
| `0864034` | 2026-05-08 | Adds the GPT-5.5 QA model option. |
| `069a3bb` | 2026-05-11 | Documents iOS TestFlight deployment details. |
| `e23e3aa` | 2026-05-18 | Adds the contact identity cleanup plan. |
| `92ff35c` | 2026-05-18 | Updates the public Quiet Room contact email. |
| `da9ad05` | 2026-05-18 | Bumps Android Play version code. |
| `fbe2677` | 2026-05-18 | Adds the Apple external TestFlight build plan. |
| `f2284c2` | 2026-05-18 | Merges current `develop` context into the contact identity cleanup branch. |
| `fad7032` | 2026-05-18 | Adds Play Store listing and screenshot planning documentation. |
| `4cc503a` | 2026-05-19 | Merges the GPT-5.5 mobile model option into the release line. |
| `1459dbf` | 2026-05-19 | Bumps mobile store builds for the GPT-5.5 redeploy. |
| `43bbf6d` | 2026-05-19 | Bumps the iOS build for the production GPT-5.5 deploy path. |
| `090b723` | 2026-05-19 | Documents the GPT-5.5 store redeploy blocker. |
| `cedb43b` | 2026-05-19 | Fixes the production TestFlight internal-only upload flag so prod builds can be external-eligible. |
| `c75a3d3` | 2026-05-20 | Adds the Android bottom navigation composer fix plan. |
| `bda0bfb` | 2026-05-20 | Fixes Android bottom navigation composer inset behavior. |
| `55fd466` | 2026-05-21 | Adds the Quiet Room mobile project tracker. |
| `59ac002` | 2026-05-22 | Updates the project tracker for QR-MOB-004 QA deploy status. |
| `eb210a1` | 2026-05-22 | Adds selectable message text to the project tracker. |
| `e5b872a` | 2026-05-22 | Fixes Android keyboard composer spacing. |
| `1551fc0` | 2026-05-22 | Bumps Android QA version code. |
| `9d3f2fb` | 2026-05-22 | Tracks QR-MOB-002 QA Android deploy proof. |
| `ababbc1` | 2026-05-22 | Adds the GPT-5.5 profile-builder evaluation task. |
| `5ad5e0c` | 2026-05-22 | Restores the project tracker and adds the GPT-5.5 profile-builder eval task. |
| `da03b81` | 2026-05-22 | Adds the split-profile evaluation task to the tracker. |
| `e16d2b9` | 2026-05-22 | Adds feedback consent and conversation visibility tasks. |
| `c6ac5d5` | 2026-05-22 | Adds anonymous-user lifecycle evaluation task. |
| `3ef584d` | 2026-05-22 | Adds QA Firestore iOS sign-in alignment task. |
| `cee363f` | 2026-05-22 | Adds Firestore vs AWS storage architecture evaluation task. |
| `154ee9f` | 2026-05-22 | Adds CloudWatch report automation task. |
| `0f5d87c` | 2026-05-22 | Adds Play Store automation and voice cutoff tasks. |
| `b7ed619` | 2026-05-23 | Equalizes QA composer keyboard spacing across mobile layouts. |
| `fbfc91d` | 2026-05-23 | Documents QR-MOB-002 QA deploy status. |
| `5ada8bb` | 2026-05-23 | Documents QR-MOB-002 iOS QA upload proof. |
| `f33f4e1` | 2026-05-23 | Tightens Android header top spacing. |
| `dbcad6b` | 2026-05-23 | Lowers Android header controls slightly. |
| `07b91a7` | 2026-05-23 | Documents Android QA header spacing build deployment. |
| `a44285e` | 2026-05-23 | Fixes Android keyboard-active header spacing. |
| `f490ad1` | 2026-05-23 | Documents Android QA keyboard header fix deployment. |
| `37cca0e` | 2026-05-25 | Makes Android safe-area bands white. |
| `86ff6dc` | 2026-05-25 | Reserves composer metadata row spacing. |
| `296730a` | 2026-05-25 | Balances mobile composer spacing. |
| `0e0dd73` | 2026-05-25 | Bumps QA store builds. |
| `2fcfb62` | 2026-05-25 | Documents QA store deployment. |
| `6a9d2bf` | 2026-05-25 | Enables selectable message text. |
| `d13826a` | 2026-05-25 | Merges QR-MOB-002 spacing updates into `develop`. |
| `202385e` | 2026-05-25 | Merges QR-MOB-007 selectable message text into `develop`. |
| `df1c12b` | 2026-05-28 | Uses the backend model catalog in the chat picker. |
| `0c15b3a` | 2026-05-28 | Bumps QA store builds for model catalog deploy. |
| `caebb75` | 2026-05-28 | Documents QR-MOB-006 QA deploy in the tracker. |
| `daff56e` | 2026-05-28 | Fixes QA mobile release settings startup and environment handling. |
| `d15dcc5` | 2026-05-28 | Documents Android QA startup redeploy. |
| `31ac3d4` | 2026-05-31 | Adds Sonnet timestamp investigation to the project tracker. |
| `31bcc8f` | 2026-05-31 | Updates project tracker for QR-MOB-006 completion. |
| `5596308` | 2026-05-31 | Updates documentation. |
| `b947e93` | 2026-05-31 | Bumps iOS QA build for startup redeploy. |
| `1ce9577` | 2026-05-31 | Documents iOS QA startup redeploy. |
| `b8a7603` | 2026-06-01 | Updates split-profile evaluation model scope. |
| `078f04e` | 2026-06-01 | Narrows split-profile evaluation scope. |
| `b3db218` | 2026-06-01 | Adds split-profile model eval and marks Sonnet investigation done. |
| `d0f62e4` | 2026-06-01 | Documents QR-MOB-009 split-profile evaluation. |
| `59e9a8c` | 2026-06-01 | Merges QR-MOB-009 split-profile evaluation into `develop`. |
| `3f68ed0` | 2026-06-03 | Caches voice playback audio locally. |
| `ab05790` | 2026-06-03 | Adds report sharing consent scopes. |
| `3cf67e4` | 2026-06-03 | Merges current `develop` context into the feedback consent branch. |
| `303d439` | 2026-06-03 | Updates QR-MOB-018 tracker progress. |
| `65cfa60` | 2026-06-03 | Bumps QA store build counters. |
| `30cb939` | 2026-06-03 | Reverts local voice playback audio caching. |
| `82c766f` | 2026-06-03 | Bumps QA store builds after voice playback revert. |
| `64ce5b0` | 2026-06-03 | Adds QA iOS build 25 failure investigation task. |
| `8e906bd` | 2026-06-03 | Adds QR-MOB-020 iOS QA build 25 failure plan. |
| `33082ad` | 2026-06-03 | Documents QR-MOB-020 iOS QA recovery. |
| `8023497` | 2026-06-03 | Records QR-MOB-020 TestFlight upload proof. |
| `28d225b` | 2026-06-04 | Adds QR-MOB-021 voice playback diagnostics investigation. |
| `a385f00` | 2026-06-04 | Adds Apple production submission tracker task. |
| `c988115` | 2026-06-04 | Restores tracker and adds QR-MOB-022 Apple production submission task. |
| `bd55b43` | 2026-06-11 | Adds iOS modal close button safe-area task. |
| `84273f9` | 2026-06-11 | Adds feedback form keyboard overlap task. |
| `f8ae852` | 2026-06-11 | Updates QR-MOB-021 QA diagnostics status. |
| `c34d2e3` | 2026-06-11 | Fixes modal safe-area and keyboard handling. |
| `c9fae88` | 2026-06-11 | Merges QR-MOB-023 and QR-MOB-024 fixes. |
| `23a1611` | 2026-06-11 | Records QA iOS build 27 deploy proof. |
| `7093b4f` | 2026-06-13 | Switches voice playback to `expo-audio`. |
| `d4e409b` | 2026-06-14 | Adds QR-MOB-025 backend rollout tracker item. |
| `237869e` | 2026-06-14 | Adds web model catalog tracker item. |
| `d450dae` | 2026-06-18 | Updates QR-MOB-025 rollout readiness evidence. |
| `d69b095` | 2026-06-18 | Adds QR-MOB-027 production rollout plan. |

## Quiet Room Mobile Production-Branch Commits To Preserve

These commits are in `origin/develop..origin/master`. They are already on the mobile production branch and are not new changes from `develop`, but the production merge must preserve their intent.

| Commit | Date | Description |
| --- | --- | --- |
| `06d649b` | 2026-04-24 | Merges an earlier `origin/develop` state into the mobile production rollout branch. |
| `133cc51` | 2026-04-24 | Documents the production internal store upload flow. |
| `d098682` | 2026-05-11 | Documents iOS TestFlight deploys. |
| `1cab1e6` | 2026-05-18 | Adds the Apple external TestFlight build plan. |

## Review Notes

- Gabriel promotion is backend-only but requires prod Anthropic environment readiness before deploy.
- Mobile promotion is a real production branch rollout, not just a smoke test against the backend.
- The mobile merge must resolve the known documentation conflicts in `docs/mobile-internal-testflight-runbook.md` and `docs/privacy-v2/progress-tracker.md`.
- Split-profile production enablement is runtime state, not a git commit. It will be handled through the prod feature flags `new_profile_memory_write` and `new_profile_memory_read` after explicit approval.
