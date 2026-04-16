# Task 06 — iOS Login Compliance Plan

## Goal

Ensure the iOS build does not violate App Store Guideline 4.8 (login requirements).

---

## Decision Required

Choose one:

1. Add Sign in with Apple
2. Remove Google login from iOS

---

## Implementation Plan

### Option A — Add Apple Login

- integrate Apple sign-in
- map Apple identity to existing user model

### Option B — Remove Google Login

- hide Google login on iOS
- ensure alternative login exists or anonymous usage is allowed

---

## Test Hooks Required

None required

---

## Playwright Test Strategy

### Test File

/tests/ios-login-compliance.spec.ts

---

### Test — Login Options

Steps:
1. launch iOS build
2. inspect login screen

Assertions:
- only allowed login methods present
- no conflicting providers

---

## Definition Of Done

- no guideline 4.8 violation risk
- login flows consistent
- verified via Playwright
