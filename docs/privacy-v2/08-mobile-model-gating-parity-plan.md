# Task 08 — Mobile Model Gating And Conditional Chat Chrome Parity Plan

## Goal

Bring the mobile app into parity with desktop behavior for model availability, model-picker visibility, and conditional chat chrome behavior.

The mobile app should follow the same feature-flag story as desktop so users do not encounter a different product contract depending on platform.

---

## Why This Matters

This task is not a store-compliance blocker in the same way as deletion or login, but it is still important because:
- mobile and desktop should not drift into conflicting feature behavior
- QA needs a deterministic way to verify model availability behavior
- stale or invalid model selections can create broken UI states
- conditional header / graphic / composer chrome behavior should stay aligned across platforms

---

## Grounding References

Use these as the behavioral source of truth:
- `quiet-room/docs/desktop-prod-productionization-plan.md`
- `quiet-room/tests/model-availability-gating.spec.ts`
- `docs/mobile-selector-contract.md`
- `docs/deep-research-privacy-policy.md`

If the desktop behavior changes later, this plan should be updated rather than letting mobile diverge silently.

---

## Product Contract To Preserve

Mobile should mirror desktop for all of the following:

1. model availability comes from `GET /api/feature_flags`
2. model picker is shown only when the user has more than one enabled model
3. if only one model is enabled, the picker is hidden
4. if the desktop flow hides related chat chrome or decorative header/graphic in a given state, mobile should do the same
5. if a stored model selection becomes invalid, the app must fall back to the allowed default model without breaking the chat experience

---

## Implementation Plan

### Step 1 — Confirm Desktop Truth

Before changing mobile:
- inspect the desktop plan and tests
- write down the exact permutations mobile must match

At minimum define:
- single enabled model
- multiple enabled models
- previously selected model becomes disabled
- model picker hidden states
- associated header/graphic/chat-chrome hidden states

Do not implement against memory or assumption.

---

### Step 2 — Confirm Mobile State Inputs

Identify where mobile currently gets:
- feature flags
- available models
- selected model
- visibility decisions for header / picker / graphic / composer chrome

Document the mobile decision points before changing them.

---

### Step 3 — Align Model Availability Rules

Mobile should:
- read allowed models from the same feature-flag response shape as desktop
- derive the allowed model set from that response
- use the same default-model fallback logic

Required behavior:
- if zero valid models are returned, fall back to the expected safe default behavior defined by desktop
- if one valid model is returned, use it and hide picker
- if more than one valid model is returned, show picker

---

### Step 4 — Align Selected-Model Fallback Logic

When mobile loads persisted state:
- check whether the stored selected model is still allowed
- if not allowed:
  - replace it with the current default allowed model
  - clear or overwrite stale persisted value if needed
  - avoid rendering broken or inconsistent UI during transition

This must happen predictably on app launch and any feature-flag refresh.

---

### Step 5 — Align Conditional Chat Chrome Rules

Identify all mobile UI surfaces that depend on model availability or picker visibility, including:
- model picker
- header treatment
- decorative or graphic treatment
- composer chrome or associated padding/layout states

Then align those rules with desktop.

If desktop hides a graphic or header when the picker is hidden, mobile should not keep showing it unless there is a deliberate product decision to diverge.

---

### Step 6 — Update Selectors And Testability

Add or confirm stable selectors for:
- model picker container
- currently selected model label
- header / graphic wrapper
- composer wrapper if its layout changes based on state

Do not make this parity behavior depend on brittle visual-only assertions where simple selectors can prove the state.

---

## Required State Matrix

The final implementation should explicitly support and test at least these permutations:

### Case A — One enabled model
- picker hidden
- selected model is the only allowed model
- related chrome follows desktop hidden-state rules

### Case B — Two or more enabled models
- picker visible
- selected model visible
- switching allowed models behaves normally

### Case C — Stored model becomes disabled
- app falls back to allowed default
- stale state does not persist visually
- no broken empty picker state

### Case D — Feature flags refresh during session
- mobile updates availability cleanly
- invalid current selection is corrected
- UI remains coherent

---

## Test Hooks Required

To make this fully verifiable through Playwright or automation, expose a reliable way to control feature-flag permutations in test.

Recommended options:

### Option A — Test-only feature flag override endpoint

`POST /test/feature-flags`

Purpose:
- set a deterministic feature-flag response for the current test user/session

Example request:

```json
{
  "enabledModels": ["gpt-4o-mini"],
  "defaultModel": "gpt-4o-mini"
}
```

### Option B — Mockable feature-flag fixture layer

If the app already supports a stable mocked environment for `GET /api/feature_flags`, Playwright can force the desired response through that layer.

Either approach is fine, but the parity tests must not depend on manual backend changes.

---

## Playwright Test Strategy

### Test File

`/tests/mobile-model-gating-parity.spec.ts`

---

### Test 1 — Picker Hidden For Single Model

Steps:
1. configure feature flags with exactly one enabled model
2. launch mobile app
3. open chat screen

Assertions:
- model picker is not visible
- selected model resolves to the single allowed model
- header/graphic/chrome matches the expected hidden-state behavior

---

### Test 2 — Picker Visible For Multiple Models

Steps:
1. configure feature flags with multiple enabled models
2. launch app
3. open chat screen

Assertions:
- model picker is visible
- user can view or switch allowed models
- associated chrome matches desktop expectations for this state

---

### Test 3 — Stale Stored Model Falls Back Cleanly

Steps:
1. seed local state or session with a previously valid selected model
2. configure feature flags so that model is no longer allowed
3. launch app

Assertions:
- app does not render a broken or empty state
- selected model falls back to allowed default
- stale model is not shown in picker or header

---

### Test 4 — Feature-Flag Refresh Updates UI

Steps:
1. launch app with multiple models
2. confirm picker visible
3. change feature flags to one-model state
4. trigger refresh or app state update

Assertions:
- picker hides cleanly
- selected model falls back correctly if needed
- dependent chrome updates without layout breakage

---

### Test 5 — Desktop-Parity Spot Check

This test exists to guard against silent behavioral drift.

Steps:
1. capture the agreed parity matrix from desktop references
2. run mobile through the matching permutations

Assertions:
- mobile outcomes match the documented desktop behavior for each permutation

---

## Definition Of Done

- mobile derives allowed models from the same feature-flag story as desktop
- picker visibility matches desktop rules
- header / graphic / conditional chat chrome behavior matches desktop rules
- stale model selections fall back cleanly
- stable selectors exist for automated verification
- Playwright covers the major parity permutations without manual QA dependence
