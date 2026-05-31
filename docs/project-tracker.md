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
| QR-MOB-002 | In Progress | High | Android/iOS UI | Fix mobile composer spacing around the keyboard and bottom safe area. | Android/iOS revision is merged to `develop` at `b7ed619` and both QA store lanes have uploaded. Android QA is deployed to Play internal as draft release `QA internal 12` through Play edit `15087252310441301604` (`com.quietroom.mobile.qa`, versionCode `12`, AAB SHA256 `905a4ca06a409af75fa79fb4de91c281a103f45e19fc137b3dee3ca3eb8e4a85`). iOS QA build `20` uploaded to App Store Connect/TestFlight on 2026-05-23 after restoring Xcode account access; upload output reported `Upload succeeded`, `Uploaded QuietRoomQA`, and `** EXPORT SUCCEEDED **`. The calculation removes the extra Android `+96` footer lift, subtracts the bottom system inset once from the reported IME height so Pixel gesture nav and Galaxy 3-button nav do not drift apart, and uses only `4px` extra keyboard-open footer clearance (`20px` total with base padding). Pixel evidence `docs/qr-mob-002-android-keyboard-spacing/evidence/pixel34-keyboard-equalized-final.png` and Galaxy evidence `docs/qr-mob-002-android-keyboard-spacing/evidence/galaxy-s22-keyboard-equalized-final.png` show the composer directly above the Gboard suggestion strip with no yellow/beige band. iOS scope was added after user review: the main screen now uses top-only safe-area edges so the resting beige band below the composer is structurally removed, with `36px` total resting bottom padding to match the voice-mode badge spacing. |
| QR-MOB-003 | Backlog | Medium | Store listing / age rating | Investigate whether the app age range/rating needs to change. | Review Google Play and Apple age-rating questionnaires against actual app behavior and AI companion content. |
| QR-MOB-004 | In Progress | High | QA feedback / chat reliability | Review QA feedback about timestamp bleed-through, strange context appearing, and missing responses. | Timestamp sanitizer and internal-output retry protections deployed to QA. Continue monitoring reports. |
| QR-MOB-005 | Backlog | Medium | Profile / user control | Consider putting the profile feature behind a feature flag so users can turn it off and on. | Clarify frontend/backend behavior when disabled and whether users can delete/reset profile state. |
| QR-MOB-006 | In Progress | Medium | Models / long-term AI strategy | Investigate longer-term model strategy beyond current OpenAI models, including possible local or non-OpenAI options. | Backend branch `codex/qr-mob-006-model-strategy` has the source-of-truth setup docs under `/Users/mjreinig/projects/Gabriel_App/worktrees/Gabriel-qr-mob-006-model-strategy/docs/qr-mob-006-model-strategy/`: imported deep research report, plan, and progress notes. Backend provider broker/model catalog, Anthropic Sonnet 4.6 canary, and mobile catalog-backed picker have shipped to QA. Backend QA is deployed at `0760a33`; mobile QA store build is on `origin/develop` at `0c15b3a`, with iOS TestFlight build `22` uploaded and Android Play internal draft release `QA internal 16` / versionCode `16` uploaded through Play edit `09338554109145823095`. Web picker migration and store-console promotion/assignment remain follow-ups. |
| QR-MOB-007 | In Progress | Medium | Chat UX / message selection | Investigate making chat message text selectable in addition to the copy icon. | Branch `codex/qr-mob-007-selectable-message-text` enables native text selection on the shared message text surface for assistant and user messages while preserving copy, voice, and report controls. Config, typecheck, local-QA native sync, and focused iOS simulator Detox selection coverage pass; final manual cross-platform selection/drag QA is still needed before marking done. |
| QR-MOB-008 | Backlog | High | Profile builder / model evals | Evaluate `gpt-5.5` for the profile-building prompt and memory/profile generation pipeline. | Run targeted profile-builder evals comparing current model output vs `gpt-5.5`, focusing on spiritual discernment quality, memory extraction quality, verbosity, hallucination risk, emotional overreach, temporal accuracy, structure adherence, and long-term profile usefulness. Investigate whether `gpt-5.5` should be behind a feature flag first, QA-only first, or directly replace the current profile-builder model. |
| QR-MOB-009 | Backlog | High | Profile system / split-profile evaluation | Evaluate how the split-profile system is performing after several months of real usage. | Review long-term profile quality, section usefulness, drift, duplication, emotional over-certainty, temporal inaccuracies, token growth, retrieval usefulness, and whether the split architecture is improving downstream responses compared to earlier approaches. Compare real profile outputs over time and identify which sections should remain persistent, become ephemeral, be merged, or be removed entirely. Consider side-by-side evaluation with newer models like `gpt-5.5`. |
| QR-MOB-010 | Backlog | High | Feedback / privacy consent | Investigate improving the feedback/report flow so users can explicitly consent to sharing their message and conversation context for debugging and quality review. | Explore adding a consent checkbox or similar UX that clearly tells users whether submitted feedback includes only metadata, the selected message, partial conversation context, or the full conversation. Clarify backend storage behavior, reviewer visibility, privacy-policy implications, and whether users should be able to opt into different levels of sharing. |
| QR-MOB-011 | Backlog | Medium | Accounts / anonymous users | Evaluate anonymous-user lifecycle, mobile session persistence, cleanup needs, and intended upgrade or retention flow. | Review how anonymous Firebase users are created, persisted, restored, counted, and linked to app data on mobile. Specifically compare mobile behavior against web/browser anonymous auth, including whether the same anonymous session survives app restart, device reboot, cache clearing, logout, app reinstall, and auth-provider upgrade. Determine whether stale anonymous users should be cleaned up and what data policy should apply. |
| QR-MOB-012 | Backlog | High | iOS sign-in / Firebase QA parity | Align QA Firebase/Firestore iOS sign-in configuration with prod so Apple sign-in behavior matches across environments. | Review prod vs QA Firebase Auth, Firestore, bundle ID, Apple provider, redirect/callback/domain, and any Firestore config or allowlist data used by iOS sign-in. Identify the exact missing QA modifications and apply them carefully without disturbing prod. Verify QA iOS sign-in end to end after changes. |
| QR-MOB-013 | Backlog | Medium | Architecture / data storage | Evaluate whether Quiet Room should continue using Firestore or move more storage into an AWS-native solution. | Inventory current Firestore usage across auth-linked user data, conversations, profiles, reports, consent, config, and QA/prod separation. Compare staying on Firestore vs AWS options such as DynamoDB, Aurora/Postgres, S3-backed archival, or a hybrid approach, considering complexity, cost, security, backups, migrations, local development, operational ownership, and how much the backend already lives in AWS. |
| QR-MOB-014 | Backlog | Medium | Observability / CloudWatch reporting | Investigate automating CloudWatch Logs Insights reports for prod usage, prod errors, and QA errors, with scheduled email delivery. | Define the recurring questions currently checked manually, translate them into saved Logs Insights queries or scripts, decide cadence and recipients, and compare options such as EventBridge + Lambda + SES/SNS, CloudWatch dashboards/alarms, or a lightweight scheduled report job. Include privacy-safe summaries and links back to raw logs when needed. |
| QR-MOB-015 | Backlog | High | Android deploy / Play Store automation | Investigate fully automating Play Store release publishing so uploaded releases do not need to be manually flipped from draft to published in Play Console. | Review the current Android deploy scripts, Play Developer API edit flow, track status handling, service-account permissions, QA vs prod lane safety, staged rollout options, and review/submission behavior. Determine whether the script can publish internal releases automatically, whether prod should require an explicit confirmation flag, and how to verify the final track status after deploy. |
| QR-MOB-016 | Backlog | High | Voice / audio reliability | Investigate audio playback cutting off mid-message and add visibility into the actual text sent to voice/TTS. | Users sometimes hear audio stop partway through a response while the backend does not show an obvious error. Trace the mobile voice playback path, TTS request/response handling, audio file/stream lifecycle, and app interruption/background behavior. Add privacy-safe logging or debug tooling to compare the assistant message text, the text sent to TTS, generated audio metadata, playback progress, and cutoff point. |
| QR-MOB-017 | Backlog | High | QA feedback / Sonnet investigation | Investigate Sonnet timestamp leakage and temporal reasoning failures using real QA reports. | Pull recent QA report logs for Sonnet failures, reconstruct the exact provider inputs, compare against GPT model behavior, diagnose timestamp leakage plus incorrect time inference, and recommend a fix before changing prompt or metadata behavior. |

## Item details

### QR-MOB-017 - Sonnet timestamp leakage and temporal reasoning investigation

**Goal:** Understand why Sonnet 4.6 occasionally references incorrect timing information or appears to use timestamp metadata despite Gabriel's existing timestamp guardrails.

**Background:** Backend review confirmed that Sonnet receives the shared chat-stream timestamp guardrails through the Anthropic adapter. The remaining issue is not missing prompt text, but either prompt adherence, timestamp metadata salience, incorrect/localized time context, provider-specific behavior, or some combination. This task should use real QA reports before proposing changes.

**Initial questions:**

- Which recent QA reports demonstrate Sonnet timestamp leakage, incorrect time references, or unsupported temporal reasoning?
- What exact conversation history, profile data, timestamp metadata, model route, and provider payload did Sonnet receive for each failure?
- Did Sonnet reference timing that was present in metadata, inferred from context, wrong because of timezone/localization, or not present at all?
- Are there two distinct issues: metadata bleed-through and wrong local time inference?
- Does the same prompt fail with GPT-5.5, GPT-5.3, or the current default OpenAI chat model?
- Are per-message `timestamp_local`, profile timestamp, `now_local`, or `user_tz_offset_minutes` annotations too prominent in the prompt?
- Should the fix reduce timestamp metadata injection, change the prompt wording, add provider-specific handling, improve local time conversion, or add output validation/sanitization?

**Investigation steps:**

- Pull recent QA report logs for conversations using Sonnet 4.6.
- Identify timestamp-related failures and separate them from unrelated QA feedback.
- Collect at least five failing Sonnet examples and at least five non-failing Sonnet examples for comparison, if enough data exists.
- Reconstruct the final model input for each failure, including system prompt, conversation context, profile context, timestamp annotations, selected model route, and Anthropic payload shape.
- Replay representative failures through Sonnet 4.6 and available GPT models where practical.
- Document whether each failure is reproducible, model-specific, data-shape-specific, or caused by incorrect app/backend time data.

**Acceptance criteria:**

- Recent QA report logs are reviewed for Sonnet timestamp and time-reference failures.
- Each selected failure includes conversation id, report metadata, model metadata, user message, assistant response, and relevant backend log references where available.
- Prompt/provider input reconstruction is documented for each selected failure.
- The analysis distinguishes raw timestamp leakage, natural-language timing leakage, and incorrect local-time inference.
- Provider comparison notes are captured for Sonnet vs GPT models where practical.
- Root cause is documented with evidence.
- A recommendation is made before implementation begins.
- Regression coverage is proposed for discovered failure modes across OpenAI and Anthropic paths.

**Suggested deliverables:**

- `docs/qr-mob-017-sonnet-timestamp-investigation/examples.md`
- `docs/qr-mob-017-sonnet-timestamp-investigation/reconstructed-prompts.md`
- `docs/qr-mob-017-sonnet-timestamp-investigation/provider-comparison.md`
- `docs/qr-mob-017-sonnet-timestamp-investigation/root-cause-analysis.md`
- `docs/qr-mob-017-sonnet-timestamp-investigation/recommendation.md`
