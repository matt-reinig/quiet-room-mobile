# Task 02 — Privacy Policy Update Plan

## Goal

Update the public privacy-policy surfaces so they accurately match the app's actual data behavior, backend deletion guarantees, and store-console disclosures.

This task exists to eliminate review mismatch.

---

## Why This Matters

The main risk is no longer simply having a privacy-policy URL.
The main risk is that the policy, the app, the backend behavior, and the store declarations do not tell the same story.

This plan makes the public policy reliable enough for:
- App Store review
- Play Store review
- user trust
- future maintenance

---

## Inputs

This task depends on:
- `docs/deep-research-privacy-policy.md`
- `docs/privacy-v2/01-data-inventory-plan.md`
- the resulting `docs/privacy/data-inventory.md`

Do not finalize public policy copy before the data inventory exists.

---

## Required Output

Update the public privacy-policy site so it includes accurate coverage for:
- developer identity
- account data
- chat content
- inferred profile / memory data
- AI-provider processing
- retention rules
- account deletion behavior
- support / contact path

If the site has separate pages, ensure at minimum:
- `/privacy`
- `/account-deletion`

---

## Implementation Plan

### Step 1 — Freeze The Truth Source

Before editing copy:
- confirm the inventory document exists
- confirm deletion behavior is defined
- confirm AI-sharing language is accurate

If these are still moving, this task is not ready to finalize.

---

### Step 2 — Update Core Privacy Sections

The `/privacy` page should clearly cover:

#### 2.1 Who operates the app
Include:
- app/developer name
- a real contact path

#### 2.2 What data is collected
Include plain-language sections for:
- account information
- chat messages
- inferred profile / memory data
- metadata
- audio/voice if applicable

#### 2.3 How data is used
Examples:
- provide chat functionality
- personalize experience
- maintain account state
- support deletion / support requests

#### 2.4 Third-party processing
Explicitly state when user content is sent to an AI provider or other service provider.

#### 2.5 Retention
Use explicit language:
- user account data retained until account deletion
- logs retained for a defined period if applicable

#### 2.6 Deletion
Explain:
- what users can delete in-app
- what is deleted immediately
- what may be retained (for example, logs)
- any timelines if deletion is asynchronous

---

### Step 3 — Update Account Deletion Page

The `/account-deletion` page should clearly explain:
- how to initiate deletion inside the app
- fallback support path if the in-app flow fails
- what data is deleted
- what exceptions exist
- what the user should expect after deletion

This page should not imply support contact is the normal deletion path if in-app deletion exists.

---

### Step 4 — Remove Weak Or Generic Language

Tighten or remove statements like:
- vague security claims with no substance
- generic copy that sounds legal but says little
- promises broader than the app can actually honor

The policy should be simple, specific, and defensible.

---

### Step 5 — Align Links And Labels

Ensure the exact URLs and page titles used in:
- store listings
- in-app links
- reviewer notes

all match the published site.

---

## Content Requirements Checklist

The final site must answer these clearly:

- Who operates Quiet Room?
- What user data is collected?
- Is chat content shared with an AI provider?
- Are inferred profiles or memories stored?
- How long is data retained?
- Can users delete their account inside the app?
- What data remains after deletion, if any?
- How can a reviewer find support/contact information?

---

## Test Hooks Required

No special backend test endpoint is required for content rendering itself.

However, this plan depends on test-verified truth from:
- `/test/user-data`
- account deletion tests
- consent-state tests if consent is reflected in policy or UI promises

---

## Playwright Test Strategy

### Test File

`/tests/policy-links.spec.ts`

---

### Test 1 — Privacy Link Reachable

Steps:
1. launch app
2. navigate to the relevant surface (settings, login footer, about, or onboarding)
3. tap privacy-policy link

Assertions:
- correct page opens
- page title or visible heading matches expected privacy page
- URL matches expected published URL

---

### Test 2 — Account Deletion Link Reachable

Steps:
1. launch app
2. navigate to deletion/help surface
3. tap account-deletion link

Assertions:
- correct page opens
- page includes expected deletion guidance

---

### Test 3 — Support Link Reachable

Steps:
1. open settings/about/help
2. tap support/contact link

Assertions:
- correct destination opens
- no broken or placeholder URL

---

## Review Notes Preparation

The policy update is not complete until reviewer-facing notes can reference it cleanly.

Reviewer notes should be able to say:
- privacy policy available at [URL]
- account deletion explained at [URL]
- in-app deletion available under Settings → Delete Account
- AI disclosure is presented before first message send

---

## Definition Of Done

- policy copy matches `data-inventory.md`
- deletion page matches actual backend/mobile behavior
- AI-sharing language matches real provider usage
- privacy/support/deletion links are stable and published
- Playwright verifies app surfaces reach the correct URLs
- no major mismatch remains between public policy and product behavior
