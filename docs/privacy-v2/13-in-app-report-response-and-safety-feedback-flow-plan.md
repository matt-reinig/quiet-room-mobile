# Task 13 — In-App Report Response And Safety Feedback Flow Plan

## Goal

Add a lightweight, review-safe in-app flow that lets users report a problematic AI response.

This task exists to provide a clear user path for flagging a bad response, harmful response, or otherwise concerning AI output without requiring a full moderation system.

The first version should be simple, implementable, and easy to verify.

---

## Why This Task Exists

Quiet Room is an AI app handling sensitive conversations.

Even if there is not yet a full moderation dashboard or trust-and-safety backend, the app should still provide a real user-facing way to report a problematic response.

This helps with:
- user trust
- safety feedback collection
- internal review of problematic outputs
- store-review readiness
- future product improvement

This task was not captured in the original privacy/store task list and should now be treated as its own explicit workstream.

---

## Product Decision For V1

The first version should be intentionally lightweight.

### V1 behavior

- users can report an assistant response directly from the response UI
- the report action lives alongside the existing assistant-response actions such as voice and copy
- the report is attached to the specific assistant message / conversation context
- the user can optionally choose a reason and/or add a short note
- the report is stored in the database as the primary durable record
- the app confirms that the report was submitted

### Not required for V1

- a full moderation console
- automated enforcement actions
- user-to-user abuse systems
- a complex case-management workflow
- appeal flows
- email as the primary storage mechanism for reports

---

## UX Placement

The reporting action should live on assistant responses, not as a generic app-wide help action.

### Chosen V1 entry point

Add a `Report response` action alongside the existing assistant-response actions such as:
- voice
- copy

This should be a visible response-level action, not hidden only behind an about modal or generic support/contact flow.

If the current response-action row uses icons, the report action can also be represented as an icon, as long as it remains understandable and accessible.

Do not bury this only in:
- the About modal
- generic support/contact flow
- a long-press-only pattern unless the current response actions already rely on that pattern

The user should be able to report the specific response that caused concern from the same surface where they already interact with that response.

---

## V1 User Flow

### Step 1 — Open report action

User taps the report action on a specific assistant response.

### Step 2 — Start report

The report flow opens for that specific response.

### Step 3 — Choose reason

Present a lightweight reason picker.

Recommended initial reasons:
- Harmful or unsafe
- Inaccurate or misleading
- Inappropriate or offensive
- Other

### Step 4 — Optional note

Allow a short optional free-text note.

This should be:
- optional
- short
- plain text
- not required to submit

### Step 5 — Submit

App sends the report payload to the backend.

### Step 6 — Confirmation

Show a lightweight success confirmation such as:
- `Thanks, your report was submitted.`

If submission fails, show a retryable error state.

---

## Backend Contract

### Endpoint

Recommended initial endpoint:

`POST /api/report-response`

### Auth model

Recommended:
- allow authenticated users
- decide whether anonymous users are supported in V1

Preferred V1 approach:
- support authenticated users first
- anonymous support is optional if it complicates context capture too much

### Minimum request payload

The payload should include enough context to identify the reported response later.

Recommended fields:
- `uid` (resolved server-side if authenticated)
- `conversationId`
- `assistantMessageId` or equivalent response identifier
- `reason`
- `note` (optional)
- `reportedAt`
- any relevant model metadata if readily available

### Minimum response

```json
{ "success": true }
```

---

## Storage Model

The report must be stored in the database as the primary durable record.

### Chosen V1 storage approach

Store reports in Firestore or the existing backend data store in a dedicated collection.

Example shape:

- `reports/{reportId}`
  - `uid`
  - `conversationId`
  - `assistantMessageId`
  - `reason`
  - `note`
  - `reportedAt`
  - `model`
  - `status` (optional, default `open`)

### Email decision

Email is not the primary system for V1.

If desired later, an email notification may be added on top of DB storage, but the durable source of truth should remain the database record.

The goal is not to invent a whole moderation system now.
The goal is simply to capture reports reliably for later review.

---

## Context Requirements

A submitted report should make it possible to investigate the issue without depending on operational logs.

That means the stored report should point clearly to:
- the user
- the conversation
- the specific assistant response

If the app does not currently have a stable assistant-message identifier, this task may need to define a practical equivalent.

Do not solve this by:
- dumping full response text into operational logs
- using email alone as the only durable record

---

## Privacy And Safety Considerations

### Logging

Report submission should not introduce new production log behavior that stores large content excerpts unnecessarily.

Operational logs may record:
- report submitted
- report ID
- UID / conversation ID
- status

Operational logs should avoid:
- full report note text if avoidable
- full assistant response text
- full conversation excerpts

### User messaging

Do not overpromise human review speed.

Good confirmation:
- `Thanks, your report was submitted.`

Avoid:
- `We will review this immediately`
- `A team member will respond soon`

unless you can actually support that operationally.

---

## Implementation Plan

### Step 1 — Confirm assistant-response action row placement

Identify the current assistant-response action row and add a concrete `Report response` action alongside the existing actions such as voice and copy.

Deliverable:
- one stable visible response-level action for reporting

---

### Step 2 — Add lightweight report flow UI

Implement:
- report action entry point
- reason picker
- optional note input
- submit button
- success/failure feedback

Keep the UI lightweight and review-safe.

---

### Step 3 — Define backend payload and endpoint

Implement the backend endpoint and payload contract.

Confirm how the backend will identify:
- user
- conversation
- specific assistant response

---

### Step 4 — Store reports in the database

Persist the report in a dedicated backend collection/store so reports can be reviewed later.

The storage model must preserve:
- enough context for investigation
- a timestamp
- the selected reason
- any user note

DB storage is the primary system of record for V1.

---

### Step 5 — Review logging behavior

Ensure the report flow does not create new production logs that duplicate user-content unnecessarily.

Keep logs metadata-first.

---

### Step 6 — Update any reviewer/support notes if needed

If store-review materials or internal QA notes mention safety feedback/reporting, update them to reflect the real implemented flow.

---

## Open Product Decisions

These should be answered during implementation, but they do not block drafting the task.

### Anonymous-user support

Decide whether anonymous users can report responses in V1.

Recommendation:
- authenticated users required in V1 if assistant-message context is easier to recover there
- support anonymous users only if context capture is still reliable

### Reason taxonomy

The initial reason list can stay small.

Recommendation:
- Harmful or unsafe
- Inaccurate or misleading
- Inappropriate or offensive
- Other

### Internal review workflow

For V1, no formal admin UI is required.
It is acceptable if reports are simply stored in a reviewable collection.

---

## Test Hooks Required

If backend test support is needed, recommended additions are:
- a test endpoint or emulator-safe path to inspect stored reports

Example:
- `GET /test/reports?uid=...`

This is optional for the first pass, but useful if you want strong automated verification.

---

## Playwright / Automation Strategy

### Test File

Suggested:

`/tests/report-response.spec.ts`

---

### Test 1 — Report action visible on assistant response

Steps:
1. create/load conversation with an assistant response
2. inspect the assistant-response action row

Assertions:
- `Report response` action is visible alongside the expected response actions

---

### Test 2 — Submit report successfully

Steps:
1. tap `Report response`
2. choose a reason
3. optionally enter a note
4. submit

Assertions:
- success confirmation appears
- backend/store contains the report if test inspection is available

---

### Test 3 — Failure path

Steps:
1. simulate backend failure if supported
2. attempt report submission

Assertions:
- user sees retryable error state
- app does not pretend the report succeeded

---

## Suggested Deliverables

- assistant-response report action alongside voice/copy
- report reason picker / note UI
- `POST /api/report-response`
- backend DB report storage
- optional emulator/test inspection hook
- automated verification for the basic flow

---

## Definition Of Done

- users can report a specific assistant response from the response UI
- the report action is present alongside the existing assistant-response actions such as voice/copy
- the app captures enough context to investigate the reported response later
- reports are stored in the database as the primary durable record
- the flow provides clear success/failure feedback
- the feature does not rely on operational logs as the primary storage for reported content context
- automated verification exists for the core happy path
