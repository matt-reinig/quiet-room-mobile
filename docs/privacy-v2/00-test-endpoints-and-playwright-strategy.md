# Task 00 — Test Endpoints And Playwright Strategy

## Goal

Enable true end-to-end verification of backend state using Playwright.

Playwright can drive UI and call APIs, but it cannot directly inspect Firestore or other backend persistence layers. Test endpoints provide a safe, gated way to verify backend truth.

---

## Why This Exists

For privacy and account-deletion work, UI-only testing is not enough.

A UI test can prove:
- the user got logged out
- the confirmation modal appeared
- the screen changed

A UI test cannot prove:
- conversations were actually deleted
- inferred profile data is gone
- repeated deletion behaves safely
- large deletions do not leave partial leftovers

This document defines the shared testing strategy for all privacy and store-compliance tasks.

---

## Core Principle

Every privacy-critical task should be testable through one of these paths:

1. Playwright UI flow
2. Playwright APIRequestContext call
3. Test-only inspection endpoint used by Playwright

No privacy-critical task should rely on manual verification as its primary proof.

---

## Required Test Endpoint Pattern

All `/test/*` routes MUST be unavailable in production.

### Minimum gating requirements

At least one of the following must be true:

- `NODE_ENV === test`
- `APP_ENV === test`
- request includes a valid `x-test-key` header matching a server-side secret

Recommended:
- require test environment AND test key

If gating fails:
- return `404` or `403`

---

## Recommended Initial Test Endpoints

### 1. GET /test/user-data

Purpose:
- inspect user-linked backend state after actions like creation, consent, or deletion

Response shape:

```json
{
  "userExists": true,
  "conversationCount": 3,
  "profileExists": true,
  "memoryCount": 2,
  "consentState": {
    "aiSharingAccepted": true
  }
}
```

Notes:
- this is the most important endpoint
- all account-deletion validation can build from this

---

### 2. POST /test/create-user

Purpose:
- provision a clean test user without depending on external auth providers during automated tests

Response shape:

```json
{
  "uid": "test-user-123",
  "token": "...",
  "email": "test-user-123@example.com"
}
```

Notes:
- should create a backend/auth identity usable by Playwright
- should return an auth token or session artifact Playwright can use

---

### 3. POST /test/seed-conversations

Purpose:
- generate predictable conversation data for the authenticated test user

Request shape:

```json
{
  "count": 5
}
```

Response shape:

```json
{
  "created": 5
}
```

Notes:
- used for deletion tests, retention tests, and store-disclosure validation
- should create records in the same shape production logic expects

---

### 4. POST /test/reset-user-state

Purpose:
- reset test-only state such as consent flags or temporary profile markers

Request shape:

```json
{
  "clearConsent": true,
  "clearProfile": false,
  "clearMessages": false
}
```

Notes:
- reduces test pollution between runs
- optional initially, but useful once multiple suites exist

---

## Playwright Usage Pattern

### Shared request context

Playwright should create an `APIRequestContext` with:
- base URL
- auth token when needed
- `x-test-key` header

Example concept:

```ts
const requestContext = await request.newContext({
  baseURL: process.env.API_URL,
  extraHTTPHeaders: {
    'x-test-key': process.env.TEST_KEY,
    Authorization: `Bearer ${token}`,
  },
});
```

---

## Standard Test Structure

Each privacy-critical test should follow this sequence:

1. create clean test identity
2. seed required state
3. perform user-visible action
4. verify UI result
5. verify backend truth via `/test/*`

That gives both:
- product confidence
- policy/disclosure confidence

---

## Required Test Suites

### account-deletion.spec.ts

Must cover:
- normal deletion
- repeated deletion / idempotency
- large deletion set
- signed-out final state
- backend data absence

---

### ai-consent.spec.ts

Must cover:
- first message blocked before consent
- consent acceptance unblocks send
- consent persists for returning user
- backend state reflects accepted consent if stored server-side

---

### policy-links.spec.ts

Must cover:
- privacy link reachable
- account deletion link reachable
- support link reachable
- login/onboarding/settings surfaces show correct URLs

---

### ios-login-compliance.spec.ts

Must cover:
- iOS login surface only shows allowed auth methods
- invalid provider combinations are absent

---

## CI Expectations

At minimum:
- privacy-critical Playwright tests run in CI for the relevant environment
- tests fail build on regressions
- test endpoints are enabled only in the test environment used by CI

---

## Definition Of Done

- test endpoint strategy implemented and documented
- `/test/*` routes are gated and unavailable in production
- Playwright can verify real backend state for privacy-critical flows
- no privacy-critical task requires manual verification as primary proof
