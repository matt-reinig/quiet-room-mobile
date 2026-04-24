# Task 03 — AI Consent Plan

## Goal

Prevent sending user data to AI before explicit consent, and verify enforcement on mobile.

---

## Implementation Plan

### Trigger

User attempts to send a message

---

### Flow

1. intercept message send
2. check consent flag
3. if false:
   - block send
   - show modal
4. if accepted:
   - persist consent
   - resume send

---

## State

Store consent in:
- local storage (anonymous)
- backend profile (authenticated)

Backend contract:
- `GET /api/account/ai-consent`
- `PUT /api/account/ai-consent`
- `/test/user-data` includes `consentState`
- `/test/ai-consent` can seed/reset emulator consent state

---

## Test Hooks Required

- reset consent state capability
- /test/user-data should include consent state

---

## Detox Test Strategy

### Test File

`e2e/quiet-room.ai-consent.test.js`

---

### Test 1 — Block Before Consent

- attempt to send message
- assert modal shown
- assert message not sent

---

### Test 2 — Accept Enables Send

- accept consent
- send message
- assert message appears

---

### Test 3 — Persistence

- accept consent
- reload app
- send message
- assert no modal

### Test 4 — Authenticated Persistence

- sign in with a disposable test user
- accept consent
- assert `/test/user-data` reports backend `consentState.aiSharingAccepted === true`

---

## Definition Of Done

- no message sent before consent
- consent persists
- backend reflects consent if stored
- Detox verifies guest behavior and authenticated backend persistence

---

## Current Status

- mobile gate implemented in `QuietRoomScreen.tsx`
- anonymous consent persisted locally
- authenticated consent persisted via `GET/PUT /api/account/ai-consent`
- emulator test hooks expose consent through `/test/user-data` and `/test/ai-consent`
- Android local-QA Detox coverage passed for:
  - block before consent
  - accept and resume
  - cold relaunch persistence
  - authenticated backend persistence
