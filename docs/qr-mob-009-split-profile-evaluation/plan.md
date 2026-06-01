# QR-MOB-009 Split-Profile Evaluation Plan

## Goal

Evaluate whether the split-profile architecture is helping long-term personalization after several months of real QA usage, without re-running the QR-MOB-008 or QR-MOB-018 model-selection work.

This task is an architecture-health review. It asks whether the `core` plus `recent` profile split is useful, sustainable, and safe enough to keep evolving.

## Scope Boundaries

- In scope:
  - Split-profile state shape and Firestore storage.
  - Real QA profile histories over time.
  - Section usefulness, drift, duplication, stale-state handling, token growth, temporal behavior, third-person voice, and downstream response grounding.
  - Architecture recommendations for persistence, decay, summarization, and retrieval.
- Out of scope:
  - Changing `PROFILE_BUILDER_MODEL`.
  - Comparing `gpt-5.5` or Sonnet 4.6 against the current model.
  - Reopening the QR-MOB-017 Sonnet timestamp investigation.
  - Shipping mobile or backend runtime code changes from this worktree.

## Source Context

- Mobile tracker: `docs/project-tracker.md`
- Backend split-memory writer: `gabriel/profile_builder.py`
- Backend profile loader for chat: `gabriel/profile_builder.py::load_profile_for_chat`
- Backend profile metadata endpoint: `gabriel/profile_meta.py`
- Backend chat prompt injection: `gabriel_routes/chat_stream.py`
- QR-MOB-008 context docs:
  - `docs/qr-mob-008-profile-builder-evaluation/plan.md`
  - `docs/qr-mob-008-profile-builder-evaluation/b71c-split-side-by-side-steady-state.md`
  - `docs/qr-mob-008-profile-builder-evaluation/b71c-split-side-by-side-fresh-start.md`

## Data Sources Reviewed

Read-only Firestore review against QA project `gabriel-qa-89f20` on 2026-06-01:

- Feature flags:
  - `feature_flags/qa/flags/new_profile_memory_write`
  - `feature_flags/qa/flags/new_profile_memory_read`
- Split-profile docs:
  - `users/{uid}/meta/spiritual_profile_core`
  - `users/{uid}/meta/spiritual_profile_recent`
  - `users/{uid}/meta/spiritual_profile_meta`
  - `users/{uid}/meta/spiritual_profile_history/entries/{entryId}`
- Conversations after split-memory read enablement, used only to judge whether downstream responses appear grounded or noisy.

Raw profile and conversation text was reviewed locally but not committed. The committed review uses hashed sample labels and aggregate observations only.

## Review Method

1. Confirm implementation shape from backend code:
   - Split writer persists independent `core`, `recent`, and `meta` docs.
   - Split writer appends history entries for each build.
   - Steady-state updates no longer feed the legacy profile text back into the split prompt.
   - Chat reads the combined split profile when `new_profile_memory_read` is enabled for the user.
2. Identify QA users with split-profile state.
3. Select all users with long-running split histories.
4. For each selected user, inspect:
   - current `core` and `recent` profile text,
   - first, middle, and latest split-history entries,
   - history count, date span, update modes, builder model, profile lengths,
   - duplicated or stale material between `core` and `recent`,
   - second-person voice, temporal phrasing, emotional over-certainty, concision, and Catholic/spiritual fit.
5. Inspect recent downstream conversations after the read flag was enabled to assess whether the memory context was useful or noisy.
6. Separate findings by root cause:
   - split-architecture behavior,
   - profile-builder prompt/schema behavior,
   - retention/retrieval behavior,
   - downstream chat prompt behavior,
   - model-selection follow-up.

## Completion Criteria

- Several long-term real QA profile histories are reviewed.
- Profile drift, duplication, stale-state retention, retrieval usefulness, and token growth are documented.
- High-value and low-value sections are identified.
- Recommendations are made for section restructuring, decay rules, summarization, and retrieval.
- The recommendation is about the split-profile architecture, not a default model change.

