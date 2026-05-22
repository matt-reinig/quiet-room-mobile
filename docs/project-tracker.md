# Quiet Room Mobile Project Tracker

This document is a living tracker for mobile app follow-up work, investigations, and future improvements.

## Status key

- `Backlog`
- `Investigating`
- `Ready`
- `In Progress`
- `Done`
- `Blocked`

## Current tracker

| ID | Status | Priority | Area | Item | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| QR-MOB-001 | Done | High | Production logs / retention | Confirm whether production logs have a 90-day TTL and update retention if they do not. | Verified on 2026-05-21. Prod Lambda log groups were updated from `Never expire` to 90 days. |
| QR-MOB-002 | In Progress | High | Android UI | Fix UI spacing when the keyboard is open on Android. | Keyboard spacing patch implemented and deployed to QA Android internal testing. Continue broader QA verification across devices. |
| QR-MOB-003 | Backlog | Medium | Store listing / age rating | Investigate whether the app age range/rating needs to change. | Review Google Play and Apple age-rating questionnaires against actual app behavior and AI companion content. |
| QR-MOB-004 | In Progress | High | QA feedback / chat reliability | Review QA feedback about timestamp bleed-through, strange context appearing, and missing responses. | Timestamp sanitizer and internal-output retry protections deployed to QA. Continue monitoring reports. |
| QR-MOB-005 | Backlog | Medium | Profile / user control | Consider putting the profile feature behind a feature flag so users can turn it off and on. | Clarify frontend/backend behavior when disabled and whether users can delete/reset profile state. |
| QR-MOB-006 | Backlog | Medium | Models / long-term AI strategy | Investigate longer-term model strategy beyond current OpenAI models, including possible local or non-OpenAI options. | Review deprecation risk, stable model IDs, quality, latency, privacy, and fallback strategy. |
| QR-MOB-007 | Backlog | Medium | Chat UX / message selection | Investigate making chat message text selectable in addition to the copy icon. | Preserve existing copy icon behavior while enabling direct text selection on iOS and Android message bubbles. |
| QR-MOB-008 | Backlog | High | Profile builder / model evals | Evaluate `gpt-5.5` for the profile-building prompt and memory/profile generation pipeline. | Run targeted profile-builder evals comparing current model output vs `gpt-5.5`, focusing on spiritual discernment quality, memory extraction quality, verbosity, hallucination risk, emotional overreach, temporal accuracy, structure adherence, and long-term profile usefulness. Investigate whether `gpt-5.5` should be behind a feature flag first, QA-only first, or directly replace the current profile-builder model. |

## Item details

### QR-MOB-007 - Selectable chat message text

**Goal:** Users should be able to select text inside chat messages directly, without relying only on the copy icon.

**Initial questions:**

- Which message components render assistant and user bubble text today?
- Does React Native `Text` selection work consistently in the current Expo/React Native version on iOS and Android?
- Does enabling selection conflict with the existing copy icon, report action, scrolling, or any long-press behavior?
- Should selection apply to assistant messages only, user messages only, or both?

**Acceptance criteria:**

- Message text can be selected directly on iOS and Android.
- The existing copy icon remains available and still copies the full message.
- Selection does not break scrolling, message controls, markdown rendering, links, or reporting.
- Manual QA covers assistant and user messages on both platforms.

### QR-MOB-008 - GPT-5.5 profile builder evaluation

**Goal:** Determine whether `gpt-5.5` improves long-term profile-building quality and reliability compared to the current profile-builder model.

**Initial questions:**

- Which exact model currently powers the profile builder in QA and prod?
- Does `gpt-5.5` follow the existing profile-builder JSON/schema requirements reliably?
- Does `gpt-5.5` produce more spiritually useful and coherent long-term summaries?
- Does it hallucinate, overstate emotional certainty, or become overly verbose in profile outputs?
- How does token usage and latency compare against the current model?
- Does it improve memory deduplication and recurring-theme recognition?

**Acceptance criteria:**

- Existing profile-builder eval pipeline supports `gpt-5.5`.
- At least several real conversation/profile examples are compared side-by-side.
- Strengths and regressions are documented.
- Recommendation is made for QA-only rollout, feature-flag rollout, or full replacement.
- Any prompt changes needed specifically for `gpt-5.5` are documented.

## Backlog intake

| Date added | Item | Notes |
| --- | --- | --- |
