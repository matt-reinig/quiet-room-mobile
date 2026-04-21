# Task 11 — Operational Logging Retention And Content Minimization Plan

## Goal

Finalize, implement, and document a production-safe operational logging policy for Quiet Room.

This task closes the remaining truth gap in the privacy inventory and privacy-policy/store disclosures around:
- how long deployed logs are retained
- what user-related data is allowed in production logs
- how error logging should be handled so user content is not leaked indirectly
- when support/debugging should inspect canonical database records instead of logs
- how CloudWatch should continue to support recent operational visibility without becoming a long-term product analytics store

---

## Decisions Locked For This Task

These decisions are already made and should not be re-opened during implementation unless a real blocker appears.

### Retention
- deployed operational logs should be retained for **90 days**

### Production logging posture
- production logs should be **metadata-first**
- production logs should **not** store message/content previews by default
- production error logging must be reviewed so request/response bodies or user-content payloads are not leaked indirectly

### Support/debugging rule
- if user-content review is needed for support/debugging, use the **canonical database record** (Firestore or equivalent), not operational logs
- logs should help locate the affected record, not duplicate the record

### Analytics boundary
- CloudWatch remains the recent operational visibility window
- CloudWatch is **not** the long-term product analytics system
- long-term traffic/usage analytics is a separate future concern and is not part of this task

---

## Why This Matters

The current data inventory on `develop` says:
- the backend logs partial user content today
- deployed log retention is not yet concretely defined in the repository
- policy/store wording cannot honestly claim a concrete retention period until this is fixed

This task affects:
- backend logging code
- deployed CloudWatch configuration
- privacy inventory wording
- privacy policy wording inputs
- account-deletion exception language
- internal support/debugging practice

---

## Problem Statement

Right now, Quiet Room has two different places where user-related information may exist server-side:

1. **Canonical product data** in Firestore
   - conversations
   - assistant replies
   - profile/memory docs

2. **Operational logs** in CloudWatch or equivalent deployed logging sink
   - request/status metadata
   - token usage
   - IDs
   - some content-bearing preview fields today

These must be treated differently.

### Intended operating principle

- Firestore is the canonical source of user content
- production logs are operational breadcrumbs, not a second archive of user content
- logs should support recent operational debugging and usage checks, especially inside the 90-day window
- anything beyond that 90-day operational window should be handled through separate analytics/metrics later if needed

---

## Outputs

This task must produce all of the following:

1. a final deployed operational-log retention period: **90 days**
2. deployed CloudWatch retention configured to match 90 days across all relevant Gabriel log groups
3. a reviewed allowlist/blocklist for production log fields
4. a reviewed decision on production error logging behavior
5. an updated `docs/privacy/data-inventory.md`
6. any necessary updates to Task 02/07 assumptions so privacy/store wording can be finalized truthfully later
7. a written internal support/debugging rule that logs are not the primary content-review path

---

## Production Logging Policy

### Allowed in production logs

These fields are acceptable in production logs unless a stronger reason emerges to reduce them further:

- `request_id`
- `uid`
- `conversation_id`
- route / handler / event name
- model name
- token usage
- status
- error category / exception class
- latency / duration
- retryable flag
- feature-flag / mode indicators only when operationally necessary

### Not allowed in production logs

The following should be removed from production logs or gated out of production by default:

- `last_user_message`
- `profile_preview`
- `text_preview`
- any user-message preview
- any assistant-reply preview
- any TTS input text preview
- full OpenAI request payloads
- full OpenAI response payloads
- full request/response dumps containing user content
- serialized request bodies containing conversation/profile content

### Temporary exceptions

If any content-bearing field must remain temporarily:
- it must be explicitly documented
- it must have a real operational justification
- it should be treated as a temporary exception, not a baseline policy
- the data inventory and future policy wording must reflect it honestly

---

## Error Logging Policy

This task must explicitly review error logging, not just standard happy-path logging.

Production error logs should prefer:
- request ID
- UID
- conversation ID
- route / handler
- model
- error category / exception class
- status code
- short internal diagnostic code if available
- whether the error is retryable

Production error logs should avoid:
- raw request bodies
- raw response bodies
- prompt text
- assistant response text
- profile text
- TTS text
- serialized upstream payload dumps
- tracebacks that include user-content payloads through repr/debug formatting where avoidable

The practical standard is:
- operationally useful
- content-minimized
- no accidental conversation leak through exception handling

---

## Support / Debugging Access Rule

If a user asks for help and gives permission to investigate a specific issue:
- logs may be used to identify request IDs, conversation IDs, timing, and error state
- content review should come from the canonical Firestore record for that specific issue
- operational logs are not the primary place to read user conversations

This rule should remain true even after this task is complete.

---

## CloudWatch Scope And Verification Requirements

### Relevant deployed log groups

Identify all production-relevant Gabriel log groups used by the app, including all deployed services that write Quiet Room operational logs.

At minimum this likely includes:
- main backend Lambda log group
- streaming Lambda log group
- profile builder Lambda log group
- any additional deployed backend service log groups participating in request handling

### Required CloudWatch confirmation

For each relevant deployed log group, confirm:
- the log group is actually used by the production/QA deployment path you care about
- retention is set to **90 days**
- retention is not `Never expire`
- the setting is consistent across all relevant log groups unless a documented exception exists

### Proof requirement

Capture at least one concrete proof artifact, such as:
- AWS console screenshot
- AWS CLI output
- IaC configuration
- deployment configuration reference

This task is not done until the deployed configuration is real and verifiable.

---

## Recent CloudWatch Usage Model

This task should preserve the fact that CloudWatch is still useful for recent operational checks.

It should remain acceptable to use CloudWatch within the 90-day window for questions like:
- which UIDs used the app recently?
- how many `chat.started` events occurred in the last 12 days?
- what did recent request volume look like?
- which routes/models errored recently?
- what happened during a recent incident?

This task does **not** require replacing recent operational CloudWatch usage.
It only limits CloudWatch from becoming the long-term storage layer for raw operational history.

---

## Implementation Plan

### Step 1 — Audit Current Logging Fields

Inspect backend logging code and identify:
- all structured fields emitted in production-oriented code paths
- which fields contain content-bearing previews
- which fields are required for real debugging
- which fields are convenience-only and can be removed

Deliverable:
- one reviewed list of fields marked:
  - keep in prod
  - remove from prod
  - temporary exception

---

### Step 2 — Audit Error Logging Paths

Inspect production-relevant error logging paths and identify whether any of these can leak user content:
- serialized request bodies
- serialized response bodies
- OpenAI payload dumps
- repr/debug logging of exception context
- traceback helper fields containing prompt/profile text

Deliverable:
- one reviewed list of error-path content risks marked:
  - acceptable
  - remove
  - gate out of prod

---

### Step 3 — Set Final Retention Number

Retention for deployed operational logs is fixed at:
- `90 days`

No further decision needed unless infrastructure makes this impossible.

---

### Step 4 — Configure CloudWatch Retention

Set the relevant deployed Gabriel log groups to **90 days**.

This includes:
- identifying each relevant log group
- updating retention where needed
- capturing proof that the deployed setting is real

If a log group cannot be changed immediately, document it explicitly as a blocker.

---

### Step 5 — Remove Or Gate Content-Bearing Production Fields

Adjust backend logging so production-oriented logs are metadata-first.

Expected outcome:
- allowed metadata fields remain
- content-bearing preview fields are removed from production logs or gated to non-prod/debug contexts
- error paths do not dump user content by accident

The final behavior should support the statement:
- production logs primarily contain operational metadata

---

### Step 6 — Update Data Inventory

Update `docs/privacy/data-inventory.md` so the operational-logs row includes:
- exact retention: `90 days`
- final production logging policy
- accurate deletion language
- accurate description of whether any temporary content-bearing exceptions remain

The placeholder wording about undefined deployed retention must be removed.

---

### Step 7 — Update Policy/Store Inputs

After the technical truth is settled, update any planning assumptions that were waiting on this decision.

At minimum review:
- `docs/privacy-v2/02-privacy-policy-update-plan.md`
- any store-disclosure prep notes referencing log retention or deletion exceptions

This task does not need to rewrite the public privacy-policy site directly, but it must fully unblock that work.

---

## Questions This Task Must Answer Definitively

By the end of this task, the answer to each must be explicit:

- What is the deployed operational-log retention period?
- Is CloudWatch actually configured to enforce 90 days on all relevant log groups?
- Which fields are still allowed in production logs?
- Have content-preview fields been removed or gated out of production?
- Do production error logs still risk capturing user-content payloads?
- If user-content review is needed for support, do we use Firestore instead of logs?
- What exact wording should `docs/privacy/data-inventory.md` use for operational logs?

---

## Verification Strategy

### Verification 1 — CloudWatch retention proof

Confirm each relevant deployed Gabriel log group shows `90 days` retention.

Accepted proof:
- AWS console screenshot
- AWS CLI output
- IaC/deployment config showing the effective setting

---

### Verification 2 — Production log field review

Capture one reviewed production-oriented log sample and verify that:
- metadata fields remain
- removed preview/content fields are absent

Outcome should be documented as:
- compliant
- temporary exception remains
- blocked

---

### Verification 3 — Error logging review

Capture one reviewed error-path example and verify that:
- no raw content payloads are dumped
- the log remains operationally useful

---

### Verification 4 — Data inventory truth updated

Confirm `docs/privacy/data-inventory.md` now includes:
- 90-day retention
- no placeholder retention language
- final production log-content posture

---

## Suggested Deliverables

- updated backend logging field review notes
- updated error-logging review notes
- CloudWatch retention proof
- updated `docs/privacy/data-inventory.md`
- follow-up issue only if a temporary exception remains

---

## Future-Boundary Note

This task does **not** implement long-term product analytics.

If long-term traffic, retention, funnel, or usage-trend analysis is needed later, that should be handled by a dedicated analytics/metrics task or tool.

For now:
- CloudWatch remains the recent operational window
- 90-day retention is enough for recent usage/debugging visibility
- long-term analytics is a separate future concern

---

## Definition Of Done

- deployed operational-log retention is fixed at 90 days
- all relevant deployed Gabriel log groups are configured to enforce 90-day retention
- production log fields have been audited and reduced to metadata-first logging
- content-preview fields are removed from production logs or explicitly documented as temporary exceptions
- production error logging has been reviewed for accidental user-content leakage
- `docs/privacy/data-inventory.md` is updated with the final 90-day retention and accurate log wording
- privacy-policy/store-disclosure work is fully unblocked by a concrete and truthful operational-logging policy
