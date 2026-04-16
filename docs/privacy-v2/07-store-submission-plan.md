# Task 07 — Store Submission Plan

## Goal

Submit consistent and defensible disclosures to both App Store and Play Store.

---

## Preconditions

Do NOT start until:
- data inventory is complete
- privacy policy is updated
- deletion flow implemented
- AI consent implemented

---

## Implementation Plan

### Step 1 — Fill Play Store Forms

- Data Safety section
- App content declarations

---

### Step 2 — Fill App Store Privacy

- data collection
- data usage
- tracking (if applicable)

---

### Step 3 — Align With Reality

Ensure all answers match:
- data-inventory.md
- backend behavior
- privacy policy site

---

### Step 4 — Add Reviewer Notes

Include:
- where to find privacy policy
- where to delete account in-app
- AI consent explanation
- login method explanation

---

## Test Hooks Required

None

---

## Playwright Test Strategy

### Test File

/tests/policy-links.spec.ts

---

### Test — Links Reachable

Steps:
1. open app
2. navigate to settings/about
3. click privacy, support, deletion links

Assertions:
- correct URLs open
- no broken links

---

## Definition Of Done

- store answers match implementation exactly
- reviewer notes prepared
- no contradictions between app, backend, and policy
- Playwright verifies links
