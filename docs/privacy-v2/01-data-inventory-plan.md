# Task 01 — Data Inventory Plan

## Goal

Create a single, accurate source of truth for all user data that is collected, stored, processed, or shared.

This document drives:
- privacy policy content
- App Store / Play Store disclosures
- backend deletion guarantees

---

## System Context (Assumed)

- Auth: Firebase Authentication (Google)
- Database: Firestore
- Backend: API layer
- AI Provider: OpenAI (or equivalent)
- Logs: CloudWatch

---

## Required Output

Create:

```
docs/privacy/data-inventory.md
```

### Table Shape

| Data Type | Collected | Stored | Shared | With Who | Purpose | Retention | Deletion |

---

## Implementation Plan

### Step 1 — Identify Data Sources

Inspect:
- Firestore collections
- backend request/response payloads
- AI request payloads
- logging systems

---

### Step 2 — Map Storage

For each data type:
- Firestore path
- transient vs persisted
- log inclusion

---

### Step 3 — Map External Sharing

For each data type:
- is it sent to third parties?
- which provider?
- what purpose?

---

### Step 4 — Define Retention

Must be explicit:
- user data → "until account deletion"
- logs → concrete number of days

---

### Step 5 — Define Deletion Behavior

For each data type:
- deleted on account deletion? (yes/no)
- sync vs async

---

## Test Hooks Required

GET /test/user-data

---

## Playwright Test Strategy

### Test File

/tests/data-inventory.spec.ts

---

### Test 1 — Data Creation

Steps:
1. create test user
2. send messages
3. call /test/user-data

Assertions:
- conversationCount > 0

---

### Test 2 — Data Deletion

Steps:
1. create user
2. generate data
3. delete account
4. call /test/user-data

Assertions:
- userExists false
- conversationCount 0

---

## Definition Of Done

- data-inventory.md exists
- all data categories mapped
- retention defined
- deletion matches implementation
- verified via Playwright
