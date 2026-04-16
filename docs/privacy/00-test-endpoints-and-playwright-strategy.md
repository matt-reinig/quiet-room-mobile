# Test Endpoints + Playwright Strategy

## Goal
Enable true end-to-end verification of backend state using Playwright.

Playwright can drive UI and call APIs, but cannot directly inspect Firestore. Test endpoints provide a safe, gated way to verify backend truth.

---

## Required Test Endpoints

### 1. Get User Data Snapshot

GET /test/user-data

Auth:
- requires authenticated user OR explicit uid param in test mode

Response:
{
  "userExists": boolean,
  "conversationCount": number,
  "profileExists": boolean
}

---

### 2. Create Test User

POST /test/create-user

Response:
{
  "uid": string,
  "token": string
}

Notes:
- bypass normal auth providers
- returns usable auth token for Playwright

---

### 3. Seed Conversations

POST /test/seed-conversations

Body:
{
  "count": number
}

Effect:
- creates N conversations for the authenticated user

---

## Security (CRITICAL)

All /test endpoints MUST be gated.

Option A (simplest):
if (process.env.NODE_ENV !== 'test') return 404

Option B (stronger):
require header x-test-key === process.env.TEST_KEY

---

## Playwright Usage Pattern

### Setup

const request = await request.newContext({
  baseURL: process.env.API_URL,
  extraHTTPHeaders: {
    'x-test-key': process.env.TEST_KEY
  }
})

---

### Example Test

1. Create user
2. Seed data
3. Perform action
4. Verify via /test endpoint

Example:

const user = await request.post('/test/create-user')
await request.post('/test/seed-conversations', { data: { count: 5 } })

await request.delete('/api/account')

const res = await request.get('/test/user-data')

expect(res.userExists).toBe(false)
expect(res.conversationCount).toBe(0)

---

## Required Test Suites

### account-deletion.spec.ts
- full lifecycle test
- idempotency
- large data deletion

### ai-consent.spec.ts
- cannot send message before consent

### auth-flow.spec.ts
- create → use → delete

---

## Definition of Done

- test endpoints implemented
- endpoints gated (not accessible in prod)
- Playwright tests verify real backend state
- no manual verification required
