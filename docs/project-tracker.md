# Quiet Room Mobile Project Tracker

This document is a living tracker for mobile app follow-up work, investigations, and future improvements.

## How to use this tracker

- Keep each item small enough that Codex or a developer can turn it into a focused branch or issue.
- Move items from `Backlog` to `In Progress` when actively working them.
- Add links to screenshots, QA notes, GitHub issues, PRs, or store review notes as they become available.
- When an item becomes large, split it into a dedicated plan doc under `docs/` and link it here.

## Status key

- `Backlog` - captured but not started.
- `Investigating` - currently being researched or reproduced.
- `Ready` - clear enough to implement.
- `In Progress` - active development work is happening.
- `Done` - completed and verified.
- `Blocked` - cannot proceed without another decision, access, or external dependency.

## Current tracker

| ID | Status | Priority | Area | Item | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| QR-MOB-001 | Backlog | High | Production logs / retention | Confirm whether production logs have a 90-day TTL and update retention if they do not. | Check the production logging setup, likely CloudWatch/log group retention if backend logs are involved. Confirm current retention first, then change to 90 days if needed. Document the exact log groups or services touched. |
| QR-MOB-002 | Backlog | High | Android UI | Fix UI spacing when the keyboard is open on Android. | Tyler has a screenshot showing the bottom UI somewhat overhanging. Reproduce on Android, especially smaller/taller phone layouts. Add enough bottom padding or keyboard-aware spacing so the input/nav area does not overlap or overhang. |
| QR-MOB-003 | Backlog | Medium | Store listing / age rating | Investigate whether the app age range/rating needs to change. | The app may currently be listed as `E for Everyone` or equivalent. Review Google Play and Apple App Store age-rating questionnaires against the actual app behavior, AI companion content, user-generated text, and reporting/safety features. |
| QR-MOB-004 | Backlog | High | QA feedback / chat reliability | Review QA feedback about timestamp bleed-through, strange context appearing, and missing responses. | Gather recent QA examples. Known concerns: timestamp bleed-through, weird context showing up when it should not, and the most recent case where a response did not generate. Check client logs, backend logs, request/response payloads, conversation state, and model/error handling. |
| QR-MOB-005 | Backlog | Medium | Profile / user control | Consider putting the profile feature behind a feature flag so users can turn it off and on. | Define whether this is an app-level feature flag, remote config, per-user setting, or both. Clarify expected behavior when disabled: no profile building, no profile injection into prompts, existing profile ignored, and/or profile deletion option. |
| QR-MOB-006 | Backlog | Medium | Models / long-term AI strategy | Investigate longer-term model strategy beyond current OpenAI models, including possible local or non-OpenAI options. | Review risk around GPT-5.1 and GPT-5.3 deprecations, plus the current voice/TTS model. Identify safer long-term model IDs or alternatives. Consider quality, cost, latency, privacy, mobile feasibility, backend feasibility, and fallback strategy. |

## Item details

### QR-MOB-001 - Production log 90-day TTL

**Goal:** Production logs should not retain more data than needed for debugging, support, and rough usage visibility.

**Initial questions:**

- Which production services currently emit logs for the mobile app and backend?
- Are CloudWatch log groups already configured with a 90-day retention policy?
- Are there other production log stores with separate retention settings?
- Does changing retention affect any existing usage-counting or debugging workflow?

**Acceptance criteria:**

- Current production log retention is documented.
- Any log group or service without the intended retention is updated to 90 days.
- The final changed resources are listed in this tracker or a linked doc.

### QR-MOB-002 - Android keyboard spacing issue

**Goal:** The Android chat UI should remain visually clean and usable when the keyboard is open.

**Initial questions:**

- Which Android device and OS version produced Tyler's screenshot?
- Is this specific to one screen size, navigation mode, keyboard, or safe-area behavior?
- Is the issue caused by bottom navigation, the message input, safe-area inset handling, or keyboard-aware view behavior?

**Acceptance criteria:**

- The issue is reproduced on Android emulator or physical Android device.
- The chat input and bottom navigation no longer overlap, overhang, or feel cramped with the keyboard open.
- Regression testing covers at least one Android emulator profile close to Tyler's device if known.
- Before/after screenshots are captured.

### QR-MOB-003 - App age range / store rating

**Goal:** The app's age rating should honestly reflect the app's actual content and AI companion behavior.

**Initial questions:**

- What rating is currently configured in Google Play Console?
- What rating is currently configured in App Store Connect?
- Do the current rating questionnaires account for AI-generated spiritual/emotional support conversations?
- Do reporting, safety language, privacy policy, and app description create any rating implications?

**Acceptance criteria:**

- Current Google Play and Apple age-rating settings are documented.
- Store questionnaire answers are reviewed against actual app behavior.
- Any needed rating/listing changes are identified before submission or release.

### QR-MOB-004 - QA feedback: timestamp/context bleed-through and missing responses

**Goal:** QA chat sessions should not show internal timestamps, unrelated context, or silent response failures.

**Known symptoms:**

- Timestamp bleed-through in model-facing or user-facing content.
- Strange or unrelated context appearing in responses.
- A recent case where the response did not generate.

**Initial questions:**

- Are timestamps being injected intentionally into system/developer/user context?
- Is profile or memory context leaking in a way that should be hidden or filtered?
- Are failed generations being surfaced clearly to the user or swallowed silently?
- Are mobile and web clients handling backend errors differently?

**Acceptance criteria:**

- At least one concrete QA example is traced from client request to backend response.
- Root cause is identified or narrowed to a specific layer: mobile client, backend prompt assembly, profile/memory injection, model response parsing, or network/error handling.
- Silent response failure gets a clear user-facing fallback and useful logging.
- Any timestamp/context bleed-through is removed or constrained.

### QR-MOB-005 - Profile feature flag / user control

**Goal:** Users should have appropriate control over whether profile-based personalization is active.

**Initial questions:**

- Should this be a developer-only feature flag, a user-visible setting, or both?
- When disabled, should the app stop writing profile memories, stop reading/injecting profile memories, or both?
- Should users be able to delete/reset the existing profile separately from disabling it?
- How should QA/prod defaults differ?

**Acceptance criteria:**

- Desired toggle behavior is explicitly defined.
- Backend and frontend responsibilities are separated.
- QA can verify profile-on vs. profile-off behavior.
- Existing profile data behavior is clear when the feature is disabled.

### QR-MOB-006 - Long-term model and voice strategy

**Goal:** Reduce dependency risk from model deprecations and keep model choices stable, cost-aware, and high quality.

**Initial questions:**

- Which chat, profile, eval, and voice/TTS models are currently used in QA and prod?
- Are any current model IDs deprecated, scheduled for deprecation, or tied to unstable `latest` aliases?
- Are there stable replacement model IDs for the current OpenAI models?
- Are non-OpenAI or local model options realistic for this app's quality bar and spiritual companion use case?
- Is local voice/TTS feasible on mobile, or should voice remain backend/API-based?

**Acceptance criteria:**

- Current model inventory is documented.
- Deprecation risk is assessed for chat, profile, eval, and voice models.
- Recommended stable model path is proposed for the next 3-6 months.
- Longer-term alternatives are listed with practical tradeoffs: quality, privacy, cost, latency, and implementation complexity.

## Backlog intake

Add new items below this line before promoting them into the main tracker.

| Date added | Item | Notes |
| --- | --- | --- |
