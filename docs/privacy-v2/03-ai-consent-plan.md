# Task 03 — AI Consent Plan

## Goal

Prevent sending user data to AI before explicit consent, and verify enforcement via Playwright.

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

---

## Test Hooks Required

- reset consent state capability
- /test/user-data should include consent state

---

## Playwright Test Strategy

### Test File

/tests/ai-consent.spec.ts

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

---

## Definition Of Done

- no message sent before consent
- consent persists
- backend reflects consent if stored
- Playwright verifies all behavior
