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
| QR-MOB-009 | Backlog | High | Profile system / split-profile evaluation | Evaluate how the split-profile system is performing after several months of real usage. | Review long-term profile quality, section usefulness, drift, duplication, emotional over-certainty, temporal inaccuracies, token growth, retrieval usefulness, and whether the split architecture is improving downstream responses compared to earlier approaches. Compare real profile outputs over time and identify which sections should remain persistent, become ephemeral, be merged, or be removed entirely. Consider side-by-side evaluation with newer models like `gpt-5.5`. |
| QR-MOB-010 | Backlog | High | Feedback / privacy consent | Investigate improving the feedback/report flow so users can explicitly consent to sharing their message and conversation context for debugging and quality review. | Explore adding a consent checkbox or similar UX that clearly tells users whether submitted feedback includes only metadata, the selected message, partial conversation context, or the full conversation. Clarify backend storage behavior, reviewer visibility, privacy-policy implications, and whether users should be able to opt into different levels of sharing. |
| QR-MOB-011 | Backlog | Medium | Accounts / anonymous users | Evaluate anonymous-user lifecycle, mobile session persistence, cleanup needs, and intended upgrade or retention flow. | Review how anonymous Firebase users are created, persisted, restored, counted, and linked to app data on mobile. Specifically compare mobile behavior against web/browser anonymous auth, including whether the same anonymous session survives app restart, device reboot, cache clearing, logout, app reinstall, and auth-provider upgrade. Determine whether stale anonymous users should be cleaned up and what data policy should apply. |

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

### QR-MOB-009 - Split-profile system evaluation

**Goal:** Determine whether the split-profile architecture is improving long-term personalization quality, retrieval usefulness, and response grounding after months of accumulated real-world usage.

**Initial questions:**

- Are profile sections remaining coherent over time or fragmenting?
- Are some sections becoming stale, repetitive, or low-value?
- Is the system over-preserving old emotional states or outdated context?
- Are temporal references remaining accurate?
- Is profile injection improving responses or adding noise?
- Which profile sections are actually used meaningfully by the assistant?
- Should some profile sections become ephemeral or decay over time?
- Is token growth sustainable as profiles accumulate?
- Does `gpt-5.5` improve profile synthesis quality compared to the current model?
- Are there recurring hallucination or over-certainty patterns in profile summaries?

**Acceptance criteria:**

- Several long-term real-user profile histories are reviewed manually.
- Profile drift, duplication, stale-state retention, and retrieval usefulness are documented.
- High-value vs low-value profile sections are identified.
- Recommendations are made for section restructuring, decay rules, summarization changes, or retrieval adjustments.
- Comparative eval notes are captured for current model vs `gpt-5.5`.
- A recommendation is made for the future direction of the split-profile architecture.

### QR-MOB-010 - Feedback consent and conversation visibility

**Goal:** Make the feedback/report flow clearer and more privacy-aware while still giving enough debugging context to investigate real issues.

**Initial questions:**

- What data is currently included with a feedback/report submission?
- Can reviewers currently see the full conversation, only a message, or only metadata?
- Should users explicitly opt into sharing conversation context?
- Should there be separate consent levels, such as selected message only vs full conversation?
- How should the UI explain what will be visible to reviewers?
- Does the privacy policy need to be updated if additional conversation context is shared?
- Should the backend store a consent snapshot alongside the report?
- Should anonymous users be treated differently from signed-in users?

**Acceptance criteria:**

- Current report payload and reviewer visibility are documented.
- Proposed UX for consent and conversation sharing is defined.
- Backend and frontend changes are clearly separated.
- Privacy-policy implications are identified.
- A recommendation is made for the safest and most useful consent model.
- QA can verify exactly what data becomes visible after submission.

### QR-MOB-011 - Anonymous-user lifecycle and mobile session persistence evaluation

**Goal:** Understand how anonymous users are created, persisted, restored, upgraded, and cleaned up on mobile, then decide whether lifecycle changes are needed.

**Initial questions:**

- When and where does the mobile app create anonymous Firebase users?
- Does the mobile app always restore the same anonymous user after app restart?
- Does the same anonymous session survive device reboot?
- What happens after app cache clearing on Android?
- What happens after offloading/deleting/reinstalling the app on iOS?
- What happens after uninstalling/reinstalling the app on Android?
- How does this differ from the browser/web flow where anonymous auth depends on browser cache/local persistence?
- Can the user accidentally create multiple anonymous users on the same device?
- What happens if an anonymous user later signs in with Apple or Google?
- Does provider sign-in link to the existing anonymous UID or create a new signed-in UID?
- How many anonymous users exist in QA and prod, and how many appear stale or abandoned?
- What Firestore documents, conversations, profiles, reports, or consent records are tied to anonymous user IDs?
- Should inactive anonymous users be deleted after a retention window?
- Should their app data be deleted, retained, anonymized, or detached from Auth cleanup?
- Do account deletion, privacy policy, and support docs already explain this clearly enough?

**Acceptance criteria:**

- Current mobile anonymous-user creation and persistence flow is documented.
- Differences between mobile and web anonymous-auth persistence are documented.
- Restart, reboot, cache-clear, logout, reinstall, and provider-upgrade scenarios are tested or traced.
- QA/prod anonymous-user counts and stale-user patterns are reviewed.
- Data dependencies tied to anonymous UID are mapped.
- Cleanup options are compared, including no cleanup, Auth-only cleanup, full data cleanup, and retention-window cleanup.
- Risks are documented for accidental user-data loss, duplicate anonymous users, and orphaned Firestore data.
- A recommended lifecycle policy and implementation plan are written before any deletion automation is built.

## Backlog intake

| Date added | Item | Notes |
| --- | --- | --- |
