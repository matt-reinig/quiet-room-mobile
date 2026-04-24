# Task 06 — iOS Login Compliance Plan

## Goal

Ensure the iOS build does not violate App Store Guideline 4.8 (login requirements).

---

## Decision

Selected path:

1. Add Sign in with Apple

---

## Implementation Plan

### Option A — Add Apple Login

- integrate native Apple sign-in for iOS
- exchange Apple identity token into Firebase via `apple.com`
- keep email/password login available
- keep Google login available only as a secondary option
- regenerate native iOS output so Apple sign-in capability is applied

### Option B — Remove Google Login

- hide Google login on iOS
- ensure alternative login exists or anonymous usage is allowed

---

## Test Hooks Required

None required

---

## Test Strategy

Current repo coverage uses Detox for mobile auth flows.

### Test File

`e2e/quiet-room.ios-login-compliance.test.js`

---

### Test — Login Options

Steps:
1. launch iOS build
2. open login modal
3. inspect sign-in options

Assertions:
- Sign in with Apple is present on iOS
- email/password login remains available

---

## Definition Of Done

- no guideline 4.8 violation risk
- login flows consistent
- verified via iOS mobile smoke or Detox

---

## Verification Notes

- `npm run typecheck`
- `npm run mobile:verify:local-qa`
- `npm run native:sync:local-qa`
- `bash ./scripts/with-mobile-env.sh qa qa npx detox build -c ios.sim.release`
- `bash ./scripts/with-mobile-env.sh qa qa npx detox test -c ios.sim.release e2e/quiet-room.ios-login-compliance.test.js --record-logs all --take-screenshots failing`
