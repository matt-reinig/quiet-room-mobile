# Task 11 — Operational Logging Retention And Content Minimization Plan

## Goal

Define, configure, and document a production-safe operational logging policy for Quiet Room.

This task exists to close the remaining truth gap in the privacy inventory and privacy-policy/store disclosures around:
- how long deployed logs are kept
- what user-related data appears in those logs
- when logs should be used vs when support/debugging should rely on database access

---

## Why This Matters

The current data inventory on `develop` says:
- the backend logs partial user content today
- deployed log retention is not yet defined in the repository
- policy/store wording cannot honestly claim a concrete retention period until this is fixed

This is now a distinct workstream because it affects:
- privacy-policy wording
- account-deletion exceptions language
- store disclosures
- backend logging behavior
- internal support/debugging practice

---

## Problem Statement

Right now, the app has two different ways sensitive information can exist server-side:

1. **Canonical product data** in Firestore
   - conversations
   - assistant replies
   - profile/memory docs

2. **Operational logs** in the deployed logging sink
   - request and status metadata
   - token usage
   - IDs
   - some truncated content previews

The system should treat these differently.

### Desired principle

- the database is the canonical place for user content
- logs are for operational diagnostics, not for storing a second copy of user content

A useful rule:

> Logs should help locate the affected record, not duplicate the record.

---

## Outputs

This task should produce all of the following:

1. a chosen deployed operational-log retention period in days
2. deployed log-retention configuration that matches that number
3. a reviewed decision on which log fields are acceptable in production
4. updates to `docs/privacy/data-inventory.md`
5. updates to privacy-policy/store wording assumptions in Task 02/07 docs if needed
6. a clear internal rule for when support/debugging should inspect Firestore instead of logs

---

## Recommended Policy Direction

### Retention recommendation

Default recommendation:
- retain deployed operational logs for **90 days**

Why:
- long enough for support, incident investigation, and debugging
- short enough to avoid indefinite retention of user-linked operational history
- closer to real operational needs than a 30-day default

If leadership/privacy posture later prefers shorter retention, 30 days is still viable, but 90 days is the recommended first target.

---

### Content minimization recommendation

For **production logs**, prefer metadata-first logging.

Good production log fields:
- request ID
- UID or a privacy-safe identifier
- conversation ID
- route / handler name
- model name
- token usage
- status / error category
- latency / timing
- feature-flag or mode indicators when operationally necessary

Fields to reduce or remove from production logs where possible:
- `last_user_message`
- `profile_preview`
- `text_preview`
- full or partial assistant reply text
- any long conversation-content excerpts

If content previews remain temporarily, they should be:
- explicitly justified
- kept short
- reviewed for removal later
- reflected honestly in the privacy inventory and policy

---

### Support / debugging access principle

If a specific user asks for help and gives permission to investigate their issue, review should come from the **database record** for the relevant conversation/account data, not from operational logs.

That means:
- logs help locate the issue
- Firestore is used for intentional, scoped content review when needed

This distinction should inform both internal practice and policy wording.

---

## Implementation Plan

### Step 1 — Audit Current Production-Relevant Logging Fields

Inspect the backend logging code and identify:
- all structured fields currently emitted in deployed environments
- which of those contain user content or derived-content previews
- which are essential for debugging vs merely convenient

Deliverable:
- one reviewed list of current log fields, marked as:
  - keep in prod
  - reduce in prod
  - remove from prod

---

### Step 2 — Choose Final Retention Number

Decide the deployed operational-log retention number in days.

Recommended default:
- `90`

This number must be concrete and must match the actual deployed configuration.

---

### Step 3 — Configure Deployed Retention

Configure the actual deployed logging sink so retention matches the chosen number.

Examples depending on deployment setup:
- CloudWatch log group retention policy
- equivalent managed logging sink retention settings

This task is not done until the deployed environment enforces the chosen value.

---

### Step 4 — Minimize Production Content Logging

Adjust backend logging so production-oriented logs emphasize metadata rather than content.

Possible approach:
- always log metadata fields
- gate content-preview fields behind a non-prod / debug-only condition if truly needed

The final behavior should make it easy to say, truthfully:
- production logs are primarily operational metadata
- sensitive content review is done through scoped database access when necessary

---

### Step 5 — Update Data Inventory

Update `docs/privacy/data-inventory.md` so the operational-logs row includes:
- exact retention number
- final production content policy
- accurate deletion language

Example target wording:
- operational logs retained for up to 90 days and then expire automatically
- not individually deleted as part of account deletion
- production logs avoid storing conversation-content previews where possible

---

### Step 6 — Update Policy/Store Inputs

After the technical decision is real, update:
- `docs/privacy-v2/02-privacy-policy-update-plan.md` assumptions if needed
- any store-disclosure prep notes
- account-deletion exception language where logs are mentioned

This does not require the full policy-site copy to be rewritten inside this task, but it must unblock that work with a final truth source.

---

## Decision Checklist

This task should explicitly answer all of these:

- What is the deployed log-retention number in days?
- Is that number actually configured in the deployed logging sink?
- Do production logs include user-message or profile previews?
- If yes, which specific preview fields remain and why?
- If a user gives permission for support review, do we inspect Firestore rather than logs?
- What exact wording should the data inventory and policy use for operational logs?

---

## Test / Verification Strategy

This task is mostly policy-and-backend configuration work, but it still needs verification.

### Verification 1 — Configuration proof

Capture proof that the deployed log-retention setting is configured to the chosen number.

Examples:
- infrastructure screenshot
- CLI output
- IaC config
- deployment config file reference

---

### Verification 2 — Logging field review

Capture one reviewed example of production-oriented log events and verify whether content previews are still present.

Outcome should be documented as:
- accepted for now
- reduced
- removed

---

### Verification 3 — Data inventory updated

Confirm `docs/privacy/data-inventory.md` now includes:
- exact retention number
- no placeholder language about undefined deployed retention

---

## Suggested Deliverables

- updated backend logging field review notes
- deployed retention configured
- updated `docs/privacy/data-inventory.md`
- any follow-up issue if content-preview removal is deferred

---

## Recommended Follow-Up Wording Direction

For future policy copy, the intended truth should move toward something like:

- Quiet Room retains operational logs for up to 90 days for security, reliability, debugging, and abuse prevention.
- Operational logs are not generally deleted individually when an account is deleted, but they expire automatically according to the configured retention schedule.
- Quiet Room does not rely on operational logs as the primary place to review user conversations; support review of user content should be scoped to the relevant database record when needed.

Do not ship wording stronger than the actual implementation.

---

## Definition Of Done

- a deployed operational-log retention period in days is chosen
- the deployed logging sink is configured to enforce that retention
- production logging fields have been reviewed for content minimization
- a clear decision exists on whether content-preview fields remain in production
- `docs/privacy/data-inventory.md` is updated with the final retention number and accurate log wording
- the privacy-policy/store-disclosure work is unblocked by a concrete, truthful operational-logging policy
