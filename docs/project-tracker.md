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
| QR-MOB-001 | Done | High | Production logs / retention | Confirm whether production logs have a 90-day TTL and update retention if they do not. | Verified on 2026-05-21. QA Lambda log groups already had 90-day retention; prod Lambda log groups were `Never expire` and were updated to 90 days. See item details for exact groups. |
| QR-MOB-002 | Backlog | High | Android UI | Fix UI spacing when the keyboard is open on Android. | Tyler has a screenshot showing the bottom UI somewhat overhanging. Reproduce on Android, especially smaller/taller phone layouts. Add enough bottom padding or keyboard-aware spacing so the input/nav area does not overlap or overhang. |
| QR-MOB-003 | Backlog | Medium | Store listing / age rating | Investigate whether the app age range/rating needs to change. | The app may currently be listed as `E for Everyone` or equivalent. Review Google Play and Apple App Store age-rating questionnaires against the actual app behavior, AI companion content, user-generated text, and reporting/safety features. |
| QR-MOB-004 | In Progress | High | QA feedback / chat reliability | Review QA feedback about timestamp bleed-through, strange context appearing, and missing responses. | 2026-05-21 QA reports traced and split into explicit sub-tasks below. Backend branch `codex/qr-mob-004-timestamp-sanitizer` is deployed to QA at `1addee1`; post-deploy QA observation is still needed before marking the overall item done. |
| QR-MOB-005 | Backlog | Medium | Profile / user control | Consider putting the profile feature behind a feature flag so users can turn it off and on. | Define whether this is an app-level feature flag, remote config, per-user setting, or both. Clarify expected behavior when disabled: no profile building, no profile injection into prompts, existing profile ignored, and/or profile deletion option. |
| QR-MOB-006 | Backlog | Medium | Models / long-term AI strategy | Investigate longer-term model strategy beyond current OpenAI models, including possible local or non-OpenAI options. | Review risk around GPT-5.1 and GPT-5.3 deprecations, plus the current voice/TTS model. Identify safer long-term model IDs or alternatives. Consider quality, cost, latency, privacy, mobile feasibility, backend feasibility, and fallback strategy. |
| QR-MOB-007 | In Progress | Medium | Chat UX / message selection | Investigate making chat message text selectable in addition to the copy icon. | Branch `codex/qr-mob-007-selectable-message-text` enables native text selection on the shared message text surface for assistant and user messages while preserving copy, voice, and report controls. Config, typecheck, local-QA native sync, and focused iOS simulator Detox selection coverage pass; final manual cross-platform selection/drag QA is still needed before marking done. |

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

**2026-05-21 investigation result:** Done.

AWS account `054769575180`, region `us-east-1`, CloudWatch Logs was checked with the AWS CLI. The prod mobile env points at the Lambda URLs for `gabriel_lambda_prod` and `gabriel_streaming_lambda_prod`; the prod profile builder also has a Lambda URL and log group.

Initial CloudWatch readback showed the QA log groups already configured for `90` days, while these prod log groups had no `retentionInDays` value, meaning `Never expire`:

- `/aws/lambda/gabriel_lambda_prod`
- `/aws/lambda/gabriel_streaming_lambda_prod`
- `/aws/lambda/gabriel-profile-builder_prod`

I applied the existing backend helper from `privacy-task-11/Gabriel`:

```bash
GABRIEL_INCLUDE_PROD_LOG_GROUPS=1 bash scripts/configure-cloudwatch-log-retention.sh
```

Final AWS CLI readback confirmed all relevant Gabriel Lambda log groups are now set to `90` days:

- `/aws/lambda/gabriel_lambda`
- `/aws/lambda/gabriel_streaming_lambda`
- `/aws/lambda/gabriel-profile-builder`
- `/aws/lambda/gabriel_lambda_prod`
- `/aws/lambda/gabriel_streaming_lambda_prod`
- `/aws/lambda/gabriel-profile-builder_prod`

No separate app analytics, crash-reporting, Sentry, Datadog, New Relic, Bugsnag, Amplitude, Mixpanel, or PostHog SDK was found in the mobile repo. Store/deploy command logs and local Detox/logcat logs remain local or platform workflow artifacts rather than the deployed production operational log sink covered by this item.

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

**Sub-task breakdown:**

| Sub-task | Status | Scope | Notes / next step |
| --- | --- | --- | --- |
| QR-MOB-004A | Deployed to QA | Timestamp metadata leak | Bare `timestamp_local=...` prefix copied into visible `gpt-5.5` response. Backend branch `codex/qr-mob-004-timestamp-sanitizer` fixes this leak and is deployed to QA at `1addee1`; watch for any repeat timestamp reports before marking done. |
| QR-MOB-004B | Deployed to QA | Internal-output fallback / "no response" report | Report `906f36aca7f848cfa576a7fa4709d229` was the intentional fallback after two `internal_control_prefix` sanitizer hits. Backend branch `codex/qr-mob-004-timestamp-sanitizer` now expands the always-on timestamp/metadata guard and keeps a retry-only repair instruction before falling back. Deployed to QA at `1addee1`; watch for repeat fallback reports before marking done. |
| QR-MOB-004C | Deployed to QA, needs observation | Strange context dump / internal control text | Prior report `387439901d7141bf8caf4558cd2e5143` showed internal context/control text in the assistant response. The deployed `1addee1` sanitizer/retry guard covers this class; keep open for post-deploy QA verification and any remaining examples. |
| QR-MOB-004D | Done | Broader QA report triage | Recent QA `reports` were reviewed read-only on 2026-05-22. Concrete noted reports map to QR-MOB-004A/004B/004C or the older temporal-overclaim issue; note-less harmful/unsafe reports were benign recollection/scripture prompts and appear to be safety-feedback/test submissions rather than new reliability bugs. |

**2026-05-21 investigation result:** One sub-issue fixed; broader task remains open.

QA Firestore `reports` and CloudWatch logs were checked for conversation `1779367707012-2aptqgzr` under UID `b71cO4Azg8Sx2YofK5UFblMLCMk2`.

- Report `551361d7a69647d1b1d38c957642c0fe` flagged a visible `timestamp_local=2026-05-21T07:56:23.200-05:00` prefix in assistant message index `3`.
- That timestamp matched backend prompt metadata prepended to the immediately prior user message. This is different from the older `yesterday` temporal-overclaim bug; the model copied metadata into the answer.
- Existing backend sanitizer covered bracketed metadata like `[timestamp_local=...]` and malformed bracket endings, but not the bare `timestamp_local=...` form that appeared in this report.
- Report `906f36aca7f848cfa576a7fa4709d229` flagged the fallback text `I’m sorry, something went wrong while forming that response. Could you try again?`
- CloudWatch confirmed that fallback was intentional: `chat_stream.output_sanitized` fired for `internal_control_prefix`, retried once, then used the fallback after the second sanitized internal-output attempt.
- Backend branch `codex/qr-mob-004-timestamp-sanitizer` in `/Users/mjreinig/projects/Gabriel_App/Gabriel` fixes only the timestamp metadata leak by expanding the scrubber to remove bare metadata prefixes and adding a regression test for the reported `gpt-5.5` form. It was pushed to `origin` at commit `f79e1ac` (`Scrub bare timestamp metadata from chat output`).
- Focused verification: `python -m pytest tests/test_chat_stream_prompt.py -q` passed with `12 passed, 1 skipped`.

**2026-05-22 QR-MOB-004B implementation note:** The same backend branch now improves the internal-output retry path at commit `af881be` (`Improve internal output retry recovery`). When the first streamed attempt is sanitized for `internal_control_prefix`, the retry call adds a recovery instruction to the system prompt telling the model to discard internal control/analysis text and answer only as Gabriel. The fallback remains in place if the repaired retry is also unsafe. Focused verification from `/Users/mjreinig/projects/Gabriel_App/Gabriel` used the sibling task virtualenv because this worktree's `.venv` is incomplete:

```bash
/Users/mjreinig/projects/Gabriel_App/privacy-task-03/Gabriel/.venv/bin/python -m pytest tests/test_chat_stream_prompt.py -q
```

Result: `12 passed, 1 skipped`.

Live retry probe also passed. I forced the first stream attempt to return internal control text, then let the retry call real `gpt-5.5` with the recovery instruction. The endpoint made two calls, included `RETRY RECOVERY` only on the retry, emitted `chat_stream.output_sanitized` with `action=retry`, and returned a normal user-facing answer with no `commentary`, `analysis`, `agext_aisum`, `Respond as Gabriel`, or `timestamp_local=` markers. The streamed assistant text matched the saved assistant message:

```text
Let God find you exactly as you are, and stay with Him for one quiet breath.
```

Follow-up commit `1addee1` (`Add always-on internal metadata output guard`) expands the base timestamp/metadata prompt section so internal control markers are discouraged before the first attempt, not only after sanitizer failure. The retry-only repair instruction remains as a fallback recovery path. Focused verification still passes with `12 passed, 1 skipped`.

Live happy-path `gpt-5.5` probe also passed with the always-on guard. The endpoint made one model call, needed no sanitizer retry, returned no internal markers, and saved the same text it streamed:

```text
Begin simply, and let God love you before you try to say anything.
```

**2026-05-22 QR-MOB-004D report triage:** Recent QA `reports` were scanned read-only from Firestore and compared against the reported conversation messages.

- Latest noted report `906f36aca7f848cfa576a7fa4709d229` is QR-MOB-004B: the saved assistant message is the intentional fallback after internal-output sanitization.
- Latest noted report `551361d7a69647d1b1d38c957642c0fe` is QR-MOB-004A: the saved assistant message contains a bare `timestamp_local=...` prefix.
- Prior noted report `387439901d7141bf8caf4558cd2e5143` is QR-MOB-004C: the saved assistant message begins with `(commentary agext_aisum )` and dumped internal control/context text.
- Prior noted report `ab0abd54a81b46078d1447d2c36b019d` is another timestamp leak covered by QR-MOB-004A.
- Prior noted report `c1d9a6e4d6224bcaa7dfc34a3bdfbb68` is the older temporal-overclaim class already handled by the profile/timestamp guardrail work.
- The note-less `harmful_or_unsafe` reports from 2026-04-23, 2026-05-08, 2026-05-18, and 2026-05-19 are all short benign recollection/scripture-help conversations on `gpt-5.1-chat-latest`. No timestamp metadata, internal marker, fallback text, or obvious reliability defect was present in the reported assistant messages. Treat these as safety-feedback/test-submission noise unless a user adds notes or a repeatable bad output pattern appears.

**2026-05-22 QA deploy:** Fast-forwarded `origin/develop-from-main` from `f7c3511` to `1addee1`, then deployed commit `1addee1` from branch `codex/qr-mob-004-timestamp-sanitizer` with `./deploy.sh`.

Deploy proof:

- Focused pre-deploy tests: `/Users/mjreinig/projects/Gabriel_App/privacy-task-03/Gabriel/.venv/bin/python -m pytest tests/test_chat_stream_prompt.py -q` -> `12 passed, 1 skipped`.
- AWS account: `054769575180`, region `us-east-1`.
- Docker image: `054769575180.dkr.ecr.us-east-1.amazonaws.com/gabriel-backend:1addee1`.
- `gabriel_lambda`: `LastUpdateStatus=Successful`, `State=Active`, image `gabriel-backend:1addee1`.
- `gabriel-profile-builder`: `LastUpdateStatus=Successful`, `State=Active`, image `gabriel-backend:1addee1`.
- `gabriel_streaming_lambda`: `LastUpdateStatus=Successful`, `State=Active`, image `gabriel-backend:1addee1`.
- QA `/health`: `https://6rc3hj3tvyjheia4ilr5svat5i0vdkzm.lambda-url.us-east-1.on.aws/health` returned `200 OK` with `{"status":"ok"}`.

Remaining work: observe QA for repeat timestamp, fallback, or context-dump reports before marking QR-MOB-004A through QR-MOB-004C done. QR-MOB-004D is complete.

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
- Manual QA covers at least one assistant message and one user message on both platforms.

**2026-05-22 implementation note:** Branch `codex/qr-mob-007-selectable-message-text` updates the shared `MessageBubble` text node to use React Native native text selection for any non-empty assistant or user message. The existing copy icon remains assistant-only and unchanged, and voice/report actions still render outside the selectable text so their press targets stay separate. Verification so far: `npm run mobile:verify:local-qa`, `npm run typecheck`, `npm run native:sync:local-qa`, `git diff --check`, iOS Detox build, and focused iOS simulator Detox message-selection coverage pass. The iOS Detox pass pre-seeded the local anonymous AI-consent AsyncStorage key to avoid testing the consent modal in this message-selection spec.

## Backlog intake

Add new items below this line before promoting them into the main tracker.

| Date added | Item | Notes |
| --- | --- | --- |
