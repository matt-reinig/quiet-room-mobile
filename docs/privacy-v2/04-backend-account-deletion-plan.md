# Task 04 — Backend Account Deletion Plan

## Goal

Implement a backend flow that permanently deletes a user's account and all associated data, prove that deletion via Playwright, and keep the entire deletion workflow isolated from production by using emulator-backed test infrastructure during development and automation.

---

## Safety Model

This task must not be developed or validated against production-backed auth or production-backed Firestore.

Preferred test setup:
- Firebase Auth Emulator
- Firestore Emulator
- test-only backend environment
- test-only Playwright configuration

This flow must not be able to delete:
- your real account
- other real user accounts
- production user data

---

## API Contract

### Endpoint

`DELETE /api/account`

### Auth

- requires authenticated user
- extracts uid from token

### Response

```json
{ "success": true }
```

---

## Emulator-First Environment Requirements

### Required environment path

Playwright / mobile test app
-> test backend
-> Firebase Auth Emulator
-> Firestore Emulator

Do not use hybrid routing like:
- test app -> test backend -> production Firebase
- local app -> staging backend -> production Firebase

If emulator-backed infrastructure is not active, deletion testing is not considered safe to run.

---

## Implementation Plan

### Step 1 — Validate Request

- ensure user is authenticated
- extract uid
- confirm this code path works correctly with emulator-backed auth identities

---

### Step 2 — Delete Firestore Data

#### User Document

- path: `users/{uid}`
- action: delete

#### Conversations

- query: where `userId == uid`
- delete in batches (<=500 per batch)

#### Profile / Memory

- `users/{uid}/spiritual_profile`
- `users/{uid}/memories`
- delete all documents

This behavior should be exercised against emulator-backed Firestore collections during automated runs.

---

### Step 3 — Delete Auth User

- use Firebase Admin SDK
- call `deleteUser(uid)`
- run AFTER Firestore deletion

This should delete the emulator auth user during test runs, not a real production auth user.

---

## Edge Cases

### Idempotency
- repeated deletion should still return success or equivalent safe response

### Partial failure
- log failures
- do not leave the system in an ambiguous backend state if partial deletion occurs

### Large data volume
- batch conversation/profile deletion
- verify no leftovers remain in emulator-backed storage after the run

---

## Test Hooks Required

Minimum:
- `GET /test/user-data`
- `POST /test/create-user`
- `POST /test/seed-conversations`

These endpoints should operate only in test/emulator-safe conditions.

### Purpose of each

#### `POST /test/create-user`
- provisions disposable emulator-backed user accounts
- avoids using real auth-provider identities during automation

#### `POST /test/seed-conversations`
- creates predictable emulator-backed records for deletion tests

#### `GET /test/user-data`
- verifies backend truth after deletion
- confirms user doc, conversations, and profile data are gone

---

## Test Hook Gating Rules

`/test/*` endpoints must not be available in production.

Recommended gating:
- emulator/test environment required
- test key/header required

If gating fails:
- return `404` or `403`

---

## Playwright Test Strategy

### Test File

`/tests/account-deletion.spec.ts`

---

### Test 1 — Full Deletion Flow

1. create emulator-backed test user
2. seed conversations
3. delete account
4. call `/test/user-data`

Assertions:
- `userExists` is `false`
- `conversationCount` is `0`
- profile/memory state is removed if applicable

---

### Test 2 — Idempotency

1. create emulator-backed test user
2. delete account
3. delete again

Assertions:
- second call still succeeds safely
- no crash or broken error state

---

### Test 3 — Large Dataset

1. create emulator-backed test user
2. seed 100+ conversations
3. delete account
4. call `/test/user-data`

Assertions:
- all records removed
- no partial leftovers remain

---

### Test 4 — Auth User Removed

1. create emulator-backed test user
2. delete account
3. attempt auth/session reuse if test harness supports it

Assertions:
- deleted emulator auth identity no longer behaves like an active account

---

## Definition Of Done

- endpoint implemented
- deletion works against emulator-backed Auth and Firestore
- no production-backed deletion testing is required for primary verification
- `/test/*` endpoints are test-only and gated
- all user-linked data is deleted
- no orphaned data remains in emulator-backed verification
- Playwright verifies backend truth end-to-end
