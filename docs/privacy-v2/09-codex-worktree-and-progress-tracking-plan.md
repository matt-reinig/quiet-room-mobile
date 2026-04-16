# Task 09 — Codex Worktree And Progress Tracking Plan

## Goal

Define a repeatable way to run each privacy task in its own Codex-driven worktree, keep branch naming consistent, reduce task collision, and track progress in one place without bloating each task plan.

This document is the operating playbook that sits on top of the task plans in `docs/privacy-v2/`.

---

## Why This Exists

The privacy task docs describe what to build.
This document describes how to execute those tasks in parallel using Codex.

Without a shared execution pattern, parallel agent work tends to create:
- overlapping file edits
- unclear branch ownership
- inconsistent progress notes
- duplicated setup effort
- messy merges back into `develop`

The goal is to make each task feel isolated, reviewable, and easy to hand to Codex.

---

## Operating Model

### One task = one worktree

Each major task should get:
- its own git branch
- its own git worktree
- its own Codex session
- its own progress row in the tracking doc

This gives you clean isolation and makes it easier to:
- restart or discard work
- compare branches independently
- review diffs by task
- avoid one Codex run touching unrelated files

---

## Recommended Task Mapping

Use one worktree per major implementation stream, not necessarily one per document if two tasks are tightly coupled.

### Suggested initial split

#### Worktree A — Data inventory + policy alignment
Covers:
- `01-data-inventory-plan.md`
- `02-privacy-policy-update-plan.md`
- `07-store-submission-plan.md`

Reason:
- these are tightly coupled around disclosure truth

#### Worktree B — AI consent
Covers:
- `03-ai-consent-plan.md`

Reason:
- isolated product/UX + state flow

#### Worktree C — Backend deletion
Covers:
- `04-backend-account-deletion-plan.md`
- test endpoint pieces from `00-test-endpoints-and-playwright-strategy.md`

Reason:
- shared backend scope

#### Worktree D — Mobile deletion UX
Covers:
- `05-mobile-account-deletion-plan.md`

Reason:
- UI layer, depends on backend shape but can be developed separately after API contract is known

#### Worktree E — iOS login compliance
Covers:
- `06-ios-login-compliance-plan.md`

Reason:
- isolated auth/platform decision

#### Worktree F — Mobile model gating parity
Covers:
- `08-mobile-model-gating-parity-plan.md`

Reason:
- product parity stream, likely separate files and tests

You do not need to create all worktrees at once.
Start with the streams that are actually ready.

---

## Branch Naming Convention

Use explicit, sortable names.

Recommended format:

`codex/privacy/task-XX-short-name`

Examples:
- `codex/privacy/task-01-data-inventory`
- `codex/privacy/task-03-ai-consent`
- `codex/privacy/task-04-backend-deletion`
- `codex/privacy/task-05-mobile-deletion`
- `codex/privacy/task-06-ios-login`
- `codex/privacy/task-08-model-gating-parity`

Benefits:
- easy to identify origin and purpose
- easy to clean up later
- easy to map back to task docs

---

## Worktree Naming Convention

Recommended local worktree directory format:

`../quiet-room-mobile-task-XX-short-name`

Examples:
- `../quiet-room-mobile-task-03-ai-consent`
- `../quiet-room-mobile-task-04-backend-deletion`

This makes local navigation simple and keeps worktrees human-readable.

---

## Suggested Setup Flow Per Task

For each task stream:

### Step 1 — Create branch from develop

Use `develop` as the starting point unless the task explicitly depends on another unfinished task branch.

### Step 2 — Create worktree

Create a separate worktree bound to that branch.

### Step 3 — Open a dedicated Codex session

Give Codex only:
- the task plan document
- any directly related supporting docs
- relevant code areas

Do not dump the entire privacy program into every Codex session.
That increases noise and cross-task drift.

### Step 4 — Define expected deliverables

Tell Codex exactly what success means for that task, such as:
- implementation files changed
- Playwright tests added or updated
- test hooks added if required
- docs updated if needed

### Step 5 — Record progress immediately

As soon as the worktree exists, add or update its row in the progress tracker.

---

## Progress Tracking File

Create and maintain:

`docs/privacy-v2/progress-tracker.md`

This file is the single status dashboard for the privacy program.

---

## Progress Tracker Structure

Use a compact table first, then optional detailed notes underneath.

### Recommended table

| Task | Branch | Worktree | Owner | Status | Latest milestone | PR | Notes |
|---|---|---|---|---|---|---|---|
| 01/02/07 Disclosure stream | codex/privacy/task-01-data-inventory | ../quiet-room-mobile-task-01-data-inventory | Codex | not started | plan ready | — | waiting on kickoff |
| 03 AI consent | codex/privacy/task-03-ai-consent | ../quiet-room-mobile-task-03-ai-consent | Codex | not started | plan ready | — | — |
| 04 Backend deletion | codex/privacy/task-04-backend-deletion | ../quiet-room-mobile-task-04-backend-deletion | Codex | not started | plan ready | — | depends on test hook decisions |
| 05 Mobile deletion | codex/privacy/task-05-mobile-deletion | ../quiet-room-mobile-task-05-mobile-deletion | Codex | not started | plan ready | — | depends on API contract |
| 06 iOS login | codex/privacy/task-06-ios-login | ../quiet-room-mobile-task-06-ios-login | Codex | blocked | decision needed | — | pick Apple sign-in vs hide Google |
| 08 Model gating parity | codex/privacy/task-08-model-gating-parity | ../quiet-room-mobile-task-08-model-gating-parity | Codex | not started | plan ready | — | needs feature-flag test strategy |

---

## Allowed Status Values

Use only a small fixed set:
- not started
- ready
- in progress
- blocked
- ready for review
- merged
- dropped

Do not invent new statuses per task.
That makes the tracker harder to scan.

---

## Latest Milestone Guidance

This field should describe the current highest-value state in plain language.
Examples:
- plan ready
- test endpoint contract drafted
- backend delete endpoint implemented
- Playwright tests passing locally
- PR opened
- awaiting product decision

Keep this current. It is more useful than a generic percent complete value.

---

## PR Strategy

Recommended:
- one PR per worktree/stream
- keep PRs task-scoped
- do not mix unrelated privacy tasks in one PR unless they are intentionally coupled

Good examples:
- one PR for backend deletion + test endpoints
- one PR for AI consent UI + tests
- one PR for model gating parity + tests

Avoid:
- one giant privacy PR
- one PR touching deletion, consent, and parity together

---

## How To Prompt Codex Per Worktree

For each Codex session, give it:

1. the exact task doc path
2. the exact expected files or code areas
3. the exact testing expectation
4. the rule that it should stay inside task scope unless a dependency forces expansion

Example framing:

- Read `docs/privacy-v2/04-backend-account-deletion-plan.md` and `docs/privacy-v2/00-test-endpoints-and-playwright-strategy.md`.
- Implement only Task 04 and the minimal test endpoints it requires.
- Add or update Playwright tests to satisfy the plan.
- Do not change unrelated privacy tasks.
- Leave a concise summary in the progress tracker before finishing.

That last line is important.
It gives each Codex run a standard place to report completion.

---

## Progress Update Rules

Whenever a Codex task session finishes a meaningful chunk, update `progress-tracker.md`.

At minimum update:
- Status
- Latest milestone
- PR column if opened
- Notes if blocked or waiting on a decision

Examples:

### Example 1 — active work
- Status: `in progress`
- Latest milestone: `delete endpoint implemented`
- Notes: `Playwright test still needs seeded conversation fixture`

### Example 2 — review ready
- Status: `ready for review`
- Latest milestone: `Playwright suite passing locally`
- PR: `#123`

### Example 3 — blocked
- Status: `blocked`
- Latest milestone: `awaiting iOS auth decision`
- Notes: `cannot proceed until Apple sign-in vs hide Google is chosen`

---

## Merge Sequence Guidance

Merge in dependency order where possible:

1. Task 00 shared test endpoint strategy decisions
2. Task 04 backend deletion and core test hooks
3. Task 03 AI consent
4. Task 05 mobile deletion
5. Task 06 iOS login compliance
6. Task 08 model gating parity
7. Task 01/02/07 disclosure stream once behavior is stable enough to describe truthfully

This is not absolute, but it helps reduce rework.

---

## Anti-Patterns To Avoid

### 1. One Codex session editing multiple unrelated worktrees
Don’t do it.
You lose isolation.

### 2. Letting Codex roam across the whole repo without task boundaries
This is how unrelated diffs happen.

### 3. Tracking progress only in chat
The tracker doc should remain the durable source of truth.

### 4. Using percentage complete
Percentages feel precise but are often fake.
Use milestones instead.

### 5. Starting all worktrees before the prerequisite decisions exist
Only spin up a task when its dependencies are ready enough.

---

## Recommended Immediate Next Move

Create `docs/privacy-v2/progress-tracker.md` and seed it with the task rows above.
Then start with the worktree that gives the most leverage:

Recommended first:
- Task 04 backend deletion + minimal test endpoints

Reason:
- highest compliance risk
- validates the Playwright test-hook strategy
- unblocks truthful deletion claims elsewhere

---

## Definition Of Done

- every major privacy stream has a clear branch/worktree naming convention
- each active Codex task has a row in `progress-tracker.md`
- PRs stay task-scoped
- Codex sessions can be run independently with low task collision
- progress is visible without rereading chat history
