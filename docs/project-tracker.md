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
| QR-MOB-006 | Done | Medium | Models / long-term AI strategy | Investigate longer-term model strategy beyond current OpenAI models, including possible local or non-OpenAI options. | Completed for the backend/mobile QA scope. Backend provider broker/model catalog, Anthropic Sonnet 4.6 canary, and mobile catalog-backed picker shipped to QA. Backend QA is deployed at `0760a33`; the source-of-truth docs are under `/Users/mjreinig/projects/Gabriel_App/worktrees/Gabriel-qr-mob-006-model-strategy/docs/qr-mob-006-model-strategy/`. Mobile QA store build is on `origin/develop` with iOS build bump `b947e93`; iOS TestFlight build `23` uploaded successfully after verifying the release-simulator app no longer hangs on settings, and Android Play internal draft release `QA internal 17` / versionCode `17` uploaded through Play edit `07096484586492673559`. Remaining work is split into follow-ups, including completed QR-MOB-017 for Sonnet timestamp behavior, QR-MOB-018 for split-profile model evals, and separate web picker / future provider spikes. |
| QR-MOB-007 | In Progress | Medium | Chat UX / message selection | Investigate making chat message text selectable in addition to the copy icon. | Branch `codex/qr-mob-007-selectable-message-text` enables native text selection on the shared message text surface for assistant and user messages while preserving copy, voice, and report controls. Config, typecheck, local-QA native sync, and focused iOS simulator Detox selection coverage pass; final manual cross-platform selection/drag QA is still needed before marking done. |
| QR-MOB-008 | Done | High | Profile builder / model evals | Evaluate `gpt-5.5` for the profile-building prompt and memory/profile generation pipeline. | Backend branch `codex/qr-mob-008-profile-builder-evaluation` added the profile-builder eval harness on `origin/develop-from-main` without changing runtime defaults. Sampled live evals on 2026-05-25 used `--pack v1 --max-cases 3 --seed 11 --judge-model gpt-4.1`: current `gpt-5.2-chat-latest` scored `4.9`, yellow gate, avg latency `13,784.33 ms`, avg profile length `615.67` words; `gpt-5.5` default reasoning scored `4.3167`, red gate, avg latency `34,713.67 ms`, avg profile length `999.0` words; `gpt-5.5` with `reasoning_effort=none` scored `4.7667`, red gate, avg latency `26,789.0 ms`, avg profile length `903.33` words. Read-only five-conversation split-profile side-by-side replays for the b7 QA user also ran. In steady-state, candidate `gpt-5.5` reasoning-none had more split `core`/`recent` second-person issues (`[4, 5]` vs baseline `[5]`), more legacy-profile voice issues (`[2, 3, 5]` vs baseline `[2, 5]`), and remained slower/longer than baseline. In fresh-start mode, only step 1 started without prior profile state and steps 2-5 iterated from generated state; split second-person tied (`[5]` for both), but candidate was still slower/longer and had legacy-profile second-person issues in every step (`[1, 2, 3, 4, 5]` vs baseline `[1, 2, 5]`). Recommendation: do not change `PROFILE_BUILDER_MODEL`; revisit `gpt-5.5` only with `reasoning_effort=none` after prompt/schema work for strict third-person voice, concision, and prior-profile continuity. |
| QR-MOB-009 | Done | High | Profile system / split-profile evaluation | Evaluate how the split-profile system is performing after several months of real usage. | Completed on branch `codex/qr-mob-009-split-profile-evaluation`. Read-only QA review on 2026-06-01 covered all three split-profile users in `gabriel-qa-89f20`, with 63-100 split-history entries each and current read/write flags limited to the same QA allowlist. The split architecture is worth keeping: durable `core` memory stayed compact and stable, `recent` context stayed separate and useful, third-person voice was stable, and downstream responses generally used memory without announcing it. Recommended before broader rollout: add freshness/decay rules for `recent`, compact or prune older full-text history entries, add policy metadata to `spiritual_profile_meta`, and tighten prompt/schema rules for moving material into `core`. Source docs are under `docs/qr-mob-009-split-profile-evaluation/`. |
| QR-MOB-010 | Done | High | Feedback / privacy consent | Implemented explicit report-content consent for the feedback/report flow so users can choose metadata only, the selected response, recent context, or the entire conversation for debugging and quality review. | Completed in paired worktrees under `worktrees/qr-mob-010-feedback-consent/`. Mobile sends `contextScope`; backend stores a `contentConsent` snapshot and stores text snapshots only for opt-in scopes, including full conversation snapshots only when users explicitly choose that scope. Android E2E passed with screenshots under `quiet-room-mobile/artifacts/qr-mob-010-report-response-android-full-conversation/`. |
| QR-MOB-011 | Backlog | Medium | Accounts / anonymous users | Evaluate anonymous-user lifecycle, mobile session persistence, cleanup needs, and intended upgrade or retention flow. | Review how anonymous Firebase users are created, persisted, restored, counted, and linked to app data on mobile. Specifically compare mobile behavior against web/browser anonymous auth, including whether the same anonymous session survives app restart, device reboot, cache clearing, logout, app reinstall, and auth-provider upgrade. Determine whether stale anonymous users should be cleaned up and what data policy should apply. |
| QR-MOB-012 | Backlog | High | iOS sign-in / Firebase QA parity | Align QA Firebase/Firestore iOS sign-in configuration with prod so Apple sign-in behavior matches across environments. | Review prod vs QA Firebase Auth, Firestore, bundle ID, Apple provider, redirect/callback/domain, and any Firestore config or allowlist data used by iOS sign-in. Identify the exact missing QA modifications and apply them carefully without disturbing prod. Verify QA iOS sign-in end to end after changes. |
| QR-MOB-013 | Backlog | Medium | Architecture / data storage | Evaluate whether Quiet Room should continue using Firestore or move more storage into an AWS-native solution. | Inventory current Firestore usage across auth-linked user data, conversations, profiles, reports, consent, config, and QA/prod separation. Compare staying on Firestore vs AWS options such as DynamoDB, Aurora/Postgres, S3-backed archival, or a hybrid approach, considering complexity, cost, security, backups, migrations, local development, operational ownership, and how much the backend already lives in AWS. |
| QR-MOB-014 | Backlog | Medium | Observability / CloudWatch reporting | Investigate automating CloudWatch Logs Insights reports for prod usage, prod errors, and QA errors, with scheduled email delivery. | Define the recurring questions currently checked manually, translate them into saved Logs Insights queries or scripts, decide cadence and recipients, and compare options such as EventBridge + Lambda + SES/SNS, CloudWatch dashboards/alarms, or a lightweight scheduled report job. Include privacy-safe summaries and links back to raw logs when needed. |
| QR-MOB-015 | Backlog | High | Android deploy / Play Store automation | Investigate fully automating Play Store release publishing so uploaded releases do not need to be manually flipped from draft to published in Play Console. | Review the current Android deploy scripts, Play Developer API edit flow, track status handling, service-account permissions, QA vs prod lane safety, staged rollout options, and review/submission behavior. Determine whether the script can publish internal releases automatically, whether prod should require an explicit confirmation flag, and how to verify the final track status after deploy. |
| QR-MOB-016 | Backlog | High | Voice / audio reliability | Investigate audio playback cutting off mid-message and add visibility into the actual text sent to voice/TTS. | Users sometimes hear audio stop partway through a response while the backend does not show an obvious error. Trace the mobile voice playback path, TTS request/response handling, audio file/stream lifecycle, and app interruption/background behavior. Add privacy-safe logging or debug tooling to compare the assistant message text, the text sent to TTS, generated audio metadata, playback progress, and cutoff point. |
| QR-MOB-017 | Done | High | QA feedback / Sonnet investigation | Investigate Sonnet timestamp leakage and temporal reasoning failures using real QA reports. | Completed. Backend review confirmed Sonnet 4.6 receives the shared chat-stream timestamp guardrails through the Anthropic adapter. The remaining behavior should be handled as provider/prompt-adherence follow-up only if new QA examples appear. |
| QR-MOB-018 | Ready | High | Profile system / model evals | Evaluate split-profile generation quality with `gpt-5.5` and Anthropic Sonnet 4.6. | Keep this separate from QR-MOB-009. Use the split-profile replay/eval harness to compare the current profile model against `gpt-5.5` and Sonnet 4.6, including any provider-broker/harness work needed for Anthropic profile-builder routes. Focus on generated profile quality, schema adherence, third-person voice, concision, temporal accuracy, emotional over-certainty, Catholic/spiritual framing, latency, and whether either model is worth a QA-only profile-builder rollout. |
| QR-MOB-019 | Ready | High | Profile system / QA rollout | Validate the QA split-profile freshness prompt changes before promoting QA backend to prod. | Backend QA is deployed at `a73c432` with split-profile freshness guidance behind the split-profile read path. Test QA with `new_profile_memory_write` and `new_profile_memory_read` enabled for the current QA allowlist, especially recent-context freshness, downstream grounding, timestamp hygiene, and whether responses over-assume old `recent` context. If QA looks good, promote the same backend change to prod and decide whether prod flags should be all-on or held as emergency kill switches. |

## Item details

### QR-MOB-006 - Models and long-term AI strategy

**Goal:** Decide the longer-term Quiet Room model strategy beyond the current OpenAI-centered implementation, including non-OpenAI providers, possible local/open-weight options, deprecation risk, stable model IDs, quality, latency, privacy, and fallback behavior.

**Planning docs:**

- Backend branch: `codex/qr-mob-006-model-strategy`
- Backend worktree: `/Users/mjreinig/projects/Gabriel_App/worktrees/Gabriel-qr-mob-006-model-strategy`
- Backend docs folder: `/Users/mjreinig/projects/Gabriel_App/worktrees/Gabriel-qr-mob-006-model-strategy/docs/qr-mob-006-model-strategy/`

**Initial questions:**

- Which model choices should remain product-level choices, and which should become backend routing details?
- How should Gabriel expose a backend-owned model catalog to mobile and web?
- How should primary chat, profile building, and TTS be routed independently?
- Which provider should be the first non-OpenAI text canary?
- What privacy, consent, App Store, and Play disclosure updates are needed before enabling another provider?
- What eval gates are needed before changing any default model or provider?

**Acceptance criteria:**

- Current OpenAI behavior can be wrapped behind provider interfaces with no user-visible behavior change. Completed in Gabriel with OpenAI adapter wrapping and broker route definitions.
- Mobile can move away from hard-coded provider model IDs. Completed for Quiet Room mobile through the backend-owned catalog picker; web picker migration remains a separate follow-up.
- Stored conversation metadata has a backward-compatible path from old provider IDs to logical model keys. Completed with dual-write and read-time compatibility metadata.
- At least one non-OpenAI text provider can be evaluated behind flags. Completed with disabled-by-default Anthropic Sonnet 4.6 routes and a restricted QA allowlist.
- Voice/TTS routing can be evaluated independently from text chat routing. Broker route definitions now separate chat, profile-builder, and voice/TTS capabilities; future voice/provider experiments remain split out.
- Provider additions have documented quality, latency, privacy, and fallback gates before rollout. Captured in the backend plan and progress docs.

**Completion note:** Source-of-truth deploy progress and issue notes are in `/Users/mjreinig/projects/Gabriel_App/worktrees/Gabriel-qr-mob-006-model-strategy/docs/qr-mob-006-model-strategy/progress.md`. Backend QA was deployed at commit `0760a33` with Anthropic env configured on QA Lambdas and `chat_model_anthropic_fast_chat` enabled only for the existing restricted advanced-model allowlist. The authenticated QA catalog smoke returned GPT-5.1, GPT-5.3, GPT-5.5, and Sonnet 4.6 for an allowlisted user, and a deployed Sonnet stream returned a substantive non-`OK` response. Mobile `develop` includes QR-MOB-006 (`df1c12b`), selectable text (`202385e`), keyboard/resting layout fixes (`d13826a`), Android QA startup fix (`daff56e`), and iOS QA build bump (`b947e93`). QA Android Play internal versionCode `17` uploaded as draft release `QA internal 17` through Play edit `07096484586492673559` with AAB SHA256 `6004a0a0037c54e3baf250fe32a97b4e4a6b23f6606bcf7529b8c845b3fcf1e5`; QA iOS TestFlight build `23` uploaded successfully after the release-simulator app reached the home screen and QA backend requests returned HTTP 200. Notable deploy issues: the first iOS archive from `/tmp` failed because Metro resolved the existing `index.ts` through the `/tmp` to `/private/tmp` symlink path, and the first 2026-05-31 iOS retry was correctly rejected because App Store Connect already had build `22`. Remaining work is intentionally split into follow-up items, including completed QR-MOB-017 for Sonnet timestamp behavior, QR-MOB-018 for split-profile model evals, and separate web picker / future provider spikes.

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

**2026-05-22 implementation note:** Branch `codex/qr-mob-007-selectable-message-text` updates the shared `MessageBubble` text node to use React Native native text selection for any non-empty assistant or user message. The existing copy icon remains assistant-only and unchanged, and voice/report actions still render outside the selectable text so their press targets stay separate. Verification so far: `npm run mobile:verify:local-qa`, `npm run typecheck`, `npm run native:sync:local-qa`, `git diff --check`, iOS Detox build, and focused iOS simulator Detox message-selection coverage pass. The iOS Detox pass pre-seeded the local anonymous AI-consent AsyncStorage key to avoid testing the consent modal in this message-selection spec.

### QR-MOB-008 - Profile builder model evaluation

**Goal:** Determine whether `gpt-5.5` improves long-term profile-building quality and reliability compared to the current profile-builder model.

**Initial questions:**

- Which exact model currently powers the profile builder in QA and prod?
- Does `gpt-5.5` follow the existing profile-builder JSON/schema requirements reliably?
- Does `gpt-5.5` produce more spiritually useful and coherent long-term summaries?
- Does it hallucinate, overstate emotional certainty, or become overly verbose in profile outputs?
- How does token usage and latency compare against the current model?
- Does it improve memory deduplication and recurring-theme recognition?

**Acceptance criteria:**

- Existing profile-builder eval pipeline supports `gpt-5.5`. Completed on backend branch `codex/qr-mob-008-profile-builder-evaluation`.
- At least several conversation/profile examples are compared side-by-side. Completed for the sampled `v1` eval pack against `gpt-5.2-chat-latest` and `gpt-5.5`, plus a read-only five-conversation split-profile side-by-side replay saved only as local ignored artifacts.
- Strengths and regressions are documented. `gpt-5.5` with `reasoning_effort=none` improved over default reasoning and preserved pastoral/theological coherence, but still red-gated on second-person voice and remained slower/longer than the current default.
- Recommendation is made for QA-only rollout, feature-flag rollout, or full replacement. Recommendation: no rollout and no default-model change.
- Any prompt changes needed specifically for `gpt-5.5` are documented. Follow-up areas: strict third-person observational voice, concise output length, and honoring existing profile snapshots.

### QR-MOB-009 - Split-profile system evaluation

**Goal:** Determine whether the split-profile architecture is improving long-term personalization quality, retrieval usefulness, and response grounding after months of accumulated real-world usage.

**Task split:** Keep this separate from QR-MOB-008, QR-MOB-017, and QR-MOB-018. QR-MOB-008 answered the narrow profile-builder model question for `gpt-5.5`; QR-MOB-009 should evaluate the split-profile architecture itself. QR-MOB-017 is completed Sonnet timestamp investigation work. QR-MOB-018 covers the new split-profile model comparison for `gpt-5.5` and Sonnet 4.6.

**Initial questions:**

- Are profile sections remaining coherent over time or fragmenting?
- Are some sections becoming stale, repetitive, or low-value?
- Is the system over-preserving old emotional states or outdated context?
- Are temporal references remaining accurate?
- Is profile injection improving responses or adding noise?
- Which profile sections are actually used meaningfully by the assistant?
- Should some profile sections become ephemeral or decay over time?
- Is token growth sustainable as profiles accumulate?
- Are there recurring hallucination or over-certainty patterns in profile summaries?

**Investigation steps:**

- Review the current QR-MOB-008 eval artifacts only for context so the new work does not duplicate the completed `gpt-5.5` profile-builder comparison.
- Select a representative set of real long-term profile histories, including at least one heavy/long-running user profile and any profiles with known drift or stale-state concerns.
- Export current split-profile state, recent profile-builder inputs, generated outputs, and downstream prompt-injection context for each selected user.
- Review how the profile has changed over time, especially what was retained, condensed, duplicated, moved between sections, or allowed to become stale.
- Score or manually grade current profile sections for usefulness, stale-context handling, duplication, third-person profile voice, emotional over-certainty, temporal accuracy, concision, Catholic/spiritual fit, and downstream response grounding.
- Capture whether issues are split-architecture issues, prompt/schema issues, data-retention/retrieval issues, or possible model-quality follow-ups.

**Acceptance criteria:**

- Several long-term real-user profile histories are reviewed manually.
- Profile drift, duplication, stale-state retention, and retrieval usefulness are documented.
- High-value vs low-value profile sections are identified.
- Recommendations are made for section restructuring, decay rules, summarization changes, or retrieval adjustments.
- The analysis clearly separates split-architecture findings from any optional model-selection follow-up.
- The analysis explicitly checks third-person voice, concision, temporal accuracy, emotional over-certainty, and downstream response usefulness.
- A recommendation is made for the future direction of the split-profile architecture.

**Suggested deliverables:**

- `docs/qr-mob-009-split-profile-evaluation/plan.md`
- `docs/qr-mob-009-split-profile-evaluation/profile-history-review.md`
- `docs/qr-mob-009-split-profile-evaluation/architecture-recommendation.md`

**2026-06-01 completion note:** Completed in the mobile worktree on branch `codex/qr-mob-009-split-profile-evaluation`. The review used read-only QA Firestore access and did not commit raw profile or conversation text. Three long-running split-profile histories were reviewed manually, covering 63, 65, and 100 split-history entries from 2025-11-22 through 2026-05-31. Findings: keep the split architecture; keep `core` persistent; keep `recent` separate but freshness-aware; keep `spiritual_profile_meta` and add policy fields; compact older history; treat legacy profile snapshots as bootstrap/migration data after split memory is healthy. The recommendation is architecture-focused and does not change `PROFILE_BUILDER_MODEL`; QR-MOB-018 remains the separate model-comparison task. Follow-up backend prompt guidance for split-profile freshness was deployed to QA from branch `codex/qr-mob-009-split-profile-freshness-prompt` at commit `a73c432`; `gabriel_lambda`, `gabriel-profile-builder`, and `gabriel_streaming_lambda` all reported `LastUpdateStatus=Successful` on image `gabriel-backend:a73c432`, and `/health` returned `{"status":"ok"}` for all three QA Lambda URLs.

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

**2026-06-02 completion note:** Implemented in paired worktrees under `/Users/mjreinig/projects/Gabriel_App/worktrees/qr-mob-010-feedback-consent/`: mobile branch `codex/qr-mob-010-feedback-consent` and backend branch `codex/qr-mob-010-feedback-consent-backend`. The V1 consent model defaults old and new clients to metadata-only, lets users opt into the selected assistant response, recent context, or the entire conversation, and records the consent snapshot with the report. Full conversation sharing is explicit, not default. Verification covered backend unit tests, mobile typecheck, local QA env verification, Android native sync, and Android Detox E2E against local Firebase emulators plus a local Gabriel backend. Final screenshots are saved in `artifacts/qr-mob-010-report-response-android-full-conversation/android.emu.release.2026-06-02 22-30-02Z/` as `qr-mob-010-report-consent-modal.png` and `qr-mob-010-report-submitted.png`.

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

### QR-MOB-012 - QA Firebase iOS sign-in parity

**Goal:** Make QA iOS sign-in match the working prod setup so QA can reliably test Apple sign-in before release.

**Initial questions:**

- Which Firebase project is used by QA iOS, and which is used by prod iOS?
- What exact prod Firebase/Auth/Firestore settings make Apple sign-in work today?
- Which QA settings differ from prod: Apple provider setup, bundle ID, service ID, authorized domains, callback URLs, Firestore config documents, allowlists, or app metadata?
- Are the needed changes in Firebase Console/Auth, Firestore documents, Apple Developer Console, app config files, or all of the above?
- Does QA need a separate Apple key/service ID, or should it use the existing shared Apple sign-in configuration safely?
- What can be tested from the simulator vs TestFlight?

**Acceptance criteria:**

- Prod and QA iOS sign-in configuration differences are documented.
- Required QA Firebase/Firestore modifications are identified before changing anything.
- QA changes are applied without modifying prod configuration unexpectedly.
- QA iOS Apple sign-in succeeds end to end.
- Auth UID, provider linking behavior, user document creation, and backend authenticated calls are verified after sign-in.
- Any manual console steps are documented for future repeatability.

### QR-MOB-013 - Firestore vs AWS storage architecture evaluation

**Goal:** Decide whether Firestore remains the right long-term data store for Quiet Room, or whether the app should consolidate more data storage into AWS.

**Initial questions:**

- What data currently lives in Firestore across QA and prod?
- Which code paths read or write Firestore directly from mobile, backend Lambdas, profile builder, reporting, or admin/debug scripts?
- Which parts of the system rely on Firebase Auth UID semantics, Firestore security rules, real-time listeners, offline behavior, or Firebase SDK behavior?
- What AWS-native options are realistic: DynamoDB, Aurora/Postgres, S3, OpenSearch, Bedrock-adjacent storage, or a hybrid model?
- Which data would benefit from relational querying vs document/key-value access?
- What migration path would preserve conversations, profiles, consent state, reports, and account deletion behavior?
- Would moving storage to AWS simplify backend ownership, IAM, observability, backups, retention, and local development?
- Would it complicate mobile auth, anonymous users, provider linking, offline behavior, or direct client access?
- What are the cost and operational tradeoffs at current scale vs future scale?

**Acceptance criteria:**

- Current Firestore usage inventory is documented by collection, environment, owner, and access path.
- Firebase features being used intentionally vs incidentally are identified.
- AWS storage alternatives are compared against Quiet Room's actual data shapes and access patterns.
- Migration risks are documented, including auth identity mapping, account deletion, data export/import, QA/prod parity, and rollback.
- A recommended architecture is proposed: stay on Firestore, migrate fully to AWS, or use a deliberate hybrid approach.
- If migration is recommended, a phased implementation plan is written before any data movement begins.

### QR-MOB-014 - CloudWatch usage and error report automation

**Goal:** Automate the manual CloudWatch Logs Insights checks for prod usage, prod errors, and QA errors, then send a periodic email summary.

**Initial questions:**

- Which CloudWatch log groups should be included for prod usage, prod errors, and QA errors?
- What manual Logs Insights queries are currently useful enough to automate?
- What time window should the report cover: daily, weekly, last 24 hours, last 7 days, or configurable?
- What counts as usage: chat starts, stream starts, profile builder runs, reports, sign-ins, or unique users?
- What counts as an error: Lambda errors, sanitizer fallbacks, failed model calls, auth failures, 4xx/5xx responses, profile failures, or deploy issues?
- Should QA and prod be separated into different report sections?
- Should the report include raw examples, only counts, or links back to CloudWatch queries?
- Should email delivery use SES, SNS, EventBridge Scheduler, Lambda, or another lightweight path?
- What privacy limits should apply so sensitive conversation content is not emailed unnecessarily?

**Acceptance criteria:**

- Current manual CloudWatch checks are documented as named report sections.
- Candidate Logs Insights queries are written and tested for prod usage, prod errors, and QA errors.
- A recommended automation architecture is proposed.
- Email recipient, cadence, and report format are defined.
- Report content avoids unnecessary sensitive text and favors counts, event types, trends, and CloudWatch links.
- IAM permissions and environment separation are documented.
- A phased implementation plan is written before scheduling recurring emails.

### QR-MOB-015 - Play Store publish automation

**Goal:** Make Android Play Store deployment fully automated where safe, so a release does not require manually opening Play Console to flip it from draft to published.

**Initial questions:**

- Which current script uploads Android QA and prod releases to Play Console?
- Why are releases currently left as draft: API limitation, intentional safety default, missing status field, incomplete release metadata, review requirement, or Play Console policy behavior?
- Can the Google Play Developer API set the desired release status for the target track during the same edit transaction?
- Should QA/internal releases auto-publish by default while prod requires an explicit `--publish`, `--rollout`, or confirmation flag?
- What should happen for internal, closed, open, and production tracks?
- Are staged rollout controls needed for prod, such as `userFraction` or halt/resume behavior?
- What service-account permissions are required to publish rather than only upload drafts?
- How should the script verify final track status after committing the edit?
- How should failures be handled if Google Play requires manual review or blocks publish?

**Acceptance criteria:**

- Current Android Play deploy flow is documented from AAB build through Play edit commit.
- Root cause of draft-only releases is identified.
- Automation options are compared for QA/internal vs prod tracks.
- Safe defaults are defined so prod publishing cannot happen accidentally.
- Script changes or a plan are written to support publish-ready releases and final status readback.
- Required service-account permissions and Play Console constraints are documented.
- QA deploy can be verified end to end without manually flipping draft to published.

### QR-MOB-016 - Voice audio cutoff and TTS text observability

**Goal:** Understand why voice audio sometimes cuts off mid-message and add enough observability to see what text was actually sent to voice/TTS.

**Initial questions:**

- Is the cutoff caused by TTS generation, audio download/streaming, local file handling, playback lifecycle, interruption handling, app backgrounding, or UI state changes?
- Does the backend receive and process the full assistant response even when audio cuts off?
- Is the exact text sent to the voice/TTS layer different from the saved assistant message text?
- Are long messages, markdown, punctuation, scripture citations, special characters, or streaming timing correlated with cutoff?
- Does this happen on iOS, Android, or both?
- Does the mobile app currently log playback start, progress, completion, interruption, and errors?
- Can QA capture a failed example with assistant message ID, TTS input text, generated audio duration/size, playback position at cutoff, and device/platform metadata?
- What privacy-safe logging is acceptable for TTS text or excerpts?

**Acceptance criteria:**

- Current voice/TTS flow is documented from assistant text to playback completion.
- The app can correlate a voice playback event with the assistant message and exact text sent to TTS.
- Playback progress, completion, cancellation, interruption, and error states are logged or otherwise inspectable in QA.
- At least one cutoff case is reproduced or narrowed to a likely layer.
- A privacy-safe strategy is defined for storing or viewing TTS text/debug metadata.
- Recommended fix or next investigation path is documented before changing the production voice behavior.

### QR-MOB-017 - Sonnet timestamp leakage and temporal reasoning investigation

**Goal:** Understand why Sonnet 4.6 occasionally references incorrect timing information or appears to use timestamp metadata despite Gabriel's existing timestamp guardrails.

**Status:** Done.

**Completion note:** Backend review confirmed that Sonnet receives the shared chat-stream timestamp guardrails through the Anthropic adapter. The original concern is no longer that Sonnet was missing the guardrails. Any future work should be opened as a new follow-up only if fresh QA reports show reproducible provider-specific temporal failures.

### QR-MOB-018 - Split-profile model evaluation for GPT-5.5 and Sonnet 4.6

**Goal:** Evaluate whether `gpt-5.5` or Anthropic Sonnet 4.6 improve split-profile generation quality compared with the current profile-builder model.

**Task split:** Keep this separate from QR-MOB-009. QR-MOB-009 is the retrospective architecture-health review: how the split-profile system has performed over months of real use. QR-MOB-018 is the model-eval task: given the split-profile system and replay/eval harness, compare model outputs and decide whether any candidate is worth QA-only rollout.

**Initial questions:**

- Which exact model currently powers split-profile/profile-builder generation in QA and prod?
- Can the existing split-profile replay/eval harness run `gpt-5.5` and Anthropic Sonnet 4.6 through equivalent inputs?
- If Sonnet 4.6 cannot run through the profile-builder path yet, what provider-broker or harness work is required?
- Does `gpt-5.5` perform best with `reasoning_effort=none`, as QR-MOB-008 suggested, or does the split-profile harness show a different result?
- Does Sonnet 4.6 follow the split-profile JSON/schema requirements reliably?
- Which model best preserves third-person profile voice, concision, temporal accuracy, Catholic/spiritual framing, and emotional humility?
- Which model avoids stale-context over-preservation, over-certainty, duplication, and hallucinated continuity?
- How do latency, token usage, output length, and failure/retry behavior compare?

**Investigation steps:**

- Review QR-MOB-008 artifacts so the new eval builds on the completed `gpt-5.5` profile-builder work rather than duplicating it.
- Select representative split-profile replay cases, including steady-state and fresh-start scenarios if the harness supports both.
- Run the current profile-builder model, `gpt-5.5`, and Sonnet 4.6 through equivalent profile inputs where technically possible.
- If Sonnet 4.6 requires provider-broker or eval-harness changes, implement or document those prerequisites before judging quality.
- Score outputs for schema validity, section fit, third-person voice, concision, temporal accuracy, stale-state handling, emotional over-certainty, Catholic/spiritual fit, duplication, hallucination risk, and downstream usefulness.
- Record latency, token usage, output length, retries, provider errors, and any adapter-specific differences.
- Produce a recommendation: no change, prompt/schema work first, QA-only candidate rollout, or follow-up provider/harness work.

**Acceptance criteria:**

- The split-profile eval path can run the current model and `gpt-5.5`; Sonnet 4.6 is either run successfully or the missing prerequisite is documented clearly.
- At least several representative split-profile cases are compared side-by-side.
- Current model, `gpt-5.5`, and Sonnet 4.6 findings are documented separately.
- Schema adherence, third-person voice, concision, temporal accuracy, emotional over-certainty, stale-state handling, and Catholic/spiritual fit are explicitly evaluated.
- Latency, token usage, output length, and provider failure behavior are captured where available.
- A recommendation is made before changing any profile-builder default or QA feature flag.

**Suggested deliverables:**

- `docs/qr-mob-018-split-profile-model-eval/plan.md`
- `docs/qr-mob-018-split-profile-model-eval/model-comparison.md`
- `docs/qr-mob-018-split-profile-model-eval/provider-harness-notes.md`
- `docs/qr-mob-018-split-profile-model-eval/recommendation.md`

### QR-MOB-019 - QA validation for split-profile freshness prompt and prod rollout

**Goal:** Verify that the new split-profile freshness guidance deployed to QA improves or preserves response quality before pushing the QA backend change to prod.

**Context:** QR-MOB-009 found that the split-profile architecture is worth keeping, with `core` staying durable and `recent` staying useful but needing freshness-aware interpretation. Follow-up backend branch `codex/qr-mob-009-split-profile-freshness-prompt` added chat prompt guidance behind the split-profile read path and deployed it to QA at commit `a73c432`.

**Initial questions:**

- Does QA chat still use split profile memory naturally without announcing profile internals?
- Does Gabriel treat `Core Spiritual Profile` as durable background rather than over-determining the reply?
- Does Gabriel treat `Recent Spiritual Context` as short-horizon context and avoid assuming older recent material is still active?
- Does the new prompt guidance reduce stale-context risk without making responses vague or memory-avoidant?
- Do profile timestamps and section labels remain hidden from user-facing output?
- Do existing timestamp/internal-output safeguards still behave correctly after the prompt change?
- Are current QA split-profile read/write flags configured the way prod should be configured?
- Given the early/no-user-base state, should prod rollout be all-on with flags as kill switches, or should write/read still be staged briefly?

**Investigation steps:**

- Confirm QA Lambdas are still on image `gabriel-backend:a73c432` and `/health` is green.
- Confirm QA `new_profile_memory_write` and `new_profile_memory_read` flags are enabled for the intended test accounts.
- Run several QA conversations that intentionally exercise:
  - a current message matching old durable `core` memory,
  - a current message that contradicts or softens old `core` memory,
  - a current message where `recent` is useful,
  - a current message where `recent` should be treated as possibly stale,
  - a user asking about their profile or continuity explicitly.
- Review saved assistant responses and `chat_stream.profile_loaded` logs for `profile_source=split_memory`.
- Check for profile timestamp leakage, profile section leakage, over-personalization, stale recent assumptions, and loss of useful memory grounding.
- If QA looks good, document the prod rollout path:
  - deploy backend commit `a73c432` or successor to prod,
  - create/verify prod `new_profile_memory_write` and `new_profile_memory_read` flags,
  - decide whether to enable both for all prod users immediately or stage write/read briefly,
  - document rollback by disabling read, write, or both flags.

**Acceptance criteria:**

- QA split-profile read behavior is manually validated after the freshness prompt change.
- No profile timestamp, profile section, hidden metadata, or prompt-instruction leakage is observed in QA test replies.
- QA responses show useful memory grounding without over-assuming stale `recent` context.
- Any observed regressions are documented with a recommendation to fix before prod or accept as low risk.
- A prod rollout recommendation is written, including exact flag settings and rollback steps.
- If approved, the same backend change can be promoted from QA to prod without additional architecture work.

**Suggested deliverables:**

- `docs/qr-mob-019-split-profile-qa-prod-rollout/qa-validation.md`
- `docs/qr-mob-019-split-profile-qa-prod-rollout/prod-rollout-plan.md`

## Backlog intake

| Date added | Item | Notes |
| --- | --- | --- |
