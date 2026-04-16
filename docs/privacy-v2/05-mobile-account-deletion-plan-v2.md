# Task 05 — Mobile Account Deletion Plan

## Goal

Allow the user to delete their account fully within the app, from an easy-to-find account surface that already exists in the product, and verify the full flow through Playwright against a non-production backend environment.

This plan is specifically for the mobile UI layer. The backend deletion contract and shared test hooks are owned by the paired backend stream.

---

## Product Placement Decision

### Chosen entry point

Use the existing authenticated profile icon menu.

Current state:
- the profile icon menu already includes `Logout`

Required change:
- add `Delete Account` to that same profile menu

This is the first shippable account-deletion surface.
It avoids inventing a full settings system just for review compliance.

---

## Why This Placement Is Correct

The deletion option must be:
- in-app
- easy to find
- reachable from an authenticated account surface

For this product, the profile icon menu is the correct account surface because it already contains account-related functionality.

This plan does **not** place deletion:
- in the login modal
- behind support contact only
- only on the public website

---

## Required Menu Contract

When an authenticated user taps the profile icon, the menu must include at minimum:
- `Logout`
- `Delete Account`

UI expectation:
- `Delete Account` should be visually separated from `Logout` if possible
- `Delete Account` should be styled or positioned as a destructive action if the current menu system supports that

The user should not have to open a separate settings gear or discover a hidden route.

---

## Flow

### Step 1 — Open account menu

- authenticated user taps profile icon
- menu opens
- user sees `Logout` and `Delete Account`

### Step 2 — Start deletion

- user taps `Delete Account`
- app presents a confirmation modal or confirmation screen

### Step 3 — Confirm intent

Confirmation content should clearly communicate that:
- the account will be deleted
- associated user data will be deleted according to backend behavior
- the action is destructive

If the product needs an extra confirmation action, use a second destructive button such as:
- `Delete Account`
- `Yes, Delete My Account`

Do not make the wording vague.

### Step 4 — Optional reauthentication

If the auth provider or backend contract requires reauthentication, the app may prompt for it here.

This should be treated as a safety step, not as a friction step.

### Step 5 — Call backend deletion

The mobile app calls:

`DELETE /api/account`

This contract is owned by the backend stream.

### Step 6 — Handle response

If deletion succeeds:
- clear local auth/session state
- clear local user-scoped cached state if applicable
- return user to the signed-out experience

If deletion fails:
- show clear retry/error state
- do not leave the user in an ambiguous half-signed-out UI state

---

## Environment Safety Requirements

This task must be implemented and tested only against non-production environments until the flow is proven.

### Required safety rules

- Playwright must point to a test or staging backend only
- Playwright must use test accounts only
- `/test/*` endpoints must not exist in production behavior
- the mobile test environment must not be configured to hit production deletion paths

### Practical implication

During implementation and automation work, this flow should not be able to delete:
- your real account
- other real user accounts
- production user data

The plan assumes a paired backend branch/environment exists for this purpose.

---

## Paired Backend Dependency

This mobile task depends on the backend stream owning:
- `DELETE /api/account`
- `GET /test/user-data`
- any required test-user creation/seeding helpers

The mobile branch should not invent the backend contract independently.

---

## Edge Cases

### Repeated deletion attempt
- if the backend treats repeated deletion as success/idempotent, mobile should handle that cleanly
- do not show a confusing partial-account state

### Network failure
- show clear error state
- allow retry
- keep the user signed in if deletion did not actually complete

### Backend timeout or async completion
- if deletion is not immediate, show clear progress or explanatory messaging
- do not silently fail

### Reauthentication required
- surface the requirement clearly
- return the user to the deletion confirmation path after successful reauth if possible

---

## Test Hooks Required

Minimum:
- `GET /test/user-data`

Useful supporting hooks if available:
- `POST /test/create-user`
- `POST /test/seed-conversations`

These are owned by the backend stream and must be available only in test/staging conditions.

---

## Playwright Test Strategy

### Test File

`/tests/account-deletion.spec.ts`

---

### Test 1 — Profile Menu Shows Delete Account

Steps:
1. create/login as authenticated test user
2. open the main authenticated screen
3. tap the profile icon

Assertions:
- menu is visible
- menu contains `Logout`
- menu contains `Delete Account`

---

### Test 2 — Deletion Confirmation Appears

Steps:
1. open profile menu
2. tap `Delete Account`

Assertions:
- confirmation modal or screen appears
- destructive action text is present
- user is not yet deleted before confirmation

---

### Test 3 — Full Deletion Flow

Steps:
1. create test user
2. seed conversations or user-linked data
3. open profile menu
4. tap `Delete Account`
5. confirm deletion
6. call `/test/user-data`

Assertions:
- user is returned to signed-out experience
- `userExists` is `false`
- `conversationCount` is `0`
- no stale authenticated UI remains

---

### Test 4 — Failure Path

Steps:
1. simulate deletion failure in test environment if supported
2. trigger deletion flow

Assertions:
- user sees clear error/retry messaging
- app does not incorrectly sign the user out if deletion did not actually complete

---

## Definition Of Done

- deletion is reachable from the existing authenticated profile icon menu
- the menu includes `Delete Account` alongside `Logout`
- deletion is not placed in login or support-only flows
- confirmation step is clear and destructive
- the mobile app calls the backend deletion contract correctly
- local session state is cleaned up only on successful deletion
- Playwright verifies the full flow against non-production backend infrastructure
- no manual verification is required as the primary proof of correctness
