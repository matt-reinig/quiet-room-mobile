# Task 04 — Backend Account Deletion Plan

## Goal

Implement a backend flow that permanently deletes a user's account and all associated data, and prove that deletion via Playwright using test endpoints.

---

## API Contract

### Endpoint

DELETE /api/account

### Auth

- requires authenticated user
- extracts uid from token

### Response

```json
{ "success": true }
```

---

## Implementation Plan

### Step 1 — Validate Request

- ensure user is authenticated
- extract uid

---

### Step 2 — Delete Firestore Data

#### User Document

- path: users/{uid}
- action: delete

#### Conversations

- query: where userId == uid
- delete in batches (<=500 per batch)

#### Profile / Memory

- users/{uid}/spiritual_profile
- users/{uid}/memories
- delete all documents

---

### Step 3 — Delete Auth User

- Firebase Admin SDK
- deleteUser(uid)
- run AFTER Firestore deletion

---

## Edge Cases

- repeated deletion → still return success
- partial failure → log but do not block response

---

## Test Hooks Required

GET /test/user-data
POST /test/seed-conversations
POST /test/create-user

---

## Playwright Test Strategy

### Test File

/tests/account-deletion.spec.ts

---

### Test 1 — Full Deletion Flow

1. create user
2. seed conversations
3. delete account
4. call /test/user-data

Assertions:
- userExists false
- conversationCount 0

---

### Test 2 — Idempotency

1. delete account
2. delete again

Assertions:
- still returns success

---

### Test 3 — Large Dataset

1. seed 100+ conversations
2. delete account

Assertions:
- all removed

---

## Definition Of Done

- endpoint implemented
- all user data deleted
- no orphaned data
- Playwright verifies backend state
