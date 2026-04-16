# Task 05 — Mobile Account Deletion Plan

## Goal

Allow user to delete their account fully within the app and verify backend deletion via Playwright.

---

## Implementation Plan

### Entry Point

Settings → Delete Account

---

### Flow

1. user taps delete
2. show confirmation modal
3. call DELETE /api/account
4. clear local state
5. redirect to logged-out state

---

## Edge Cases

- repeated deletion → still succeed
- network failure → retry path

---

## Test Hooks Required

GET /test/user-data

---

## Playwright Test Strategy

### Test File

/tests/account-deletion.spec.ts

---

### Test — Full Flow

1. create user
2. seed conversations
3. navigate to settings
4. delete account
5. call /test/user-data

Assertions:
- userExists false
- conversationCount 0

---

## Definition Of Done

- deletion available in-app
- backend data removed
- Playwright verifies both UI and backend
