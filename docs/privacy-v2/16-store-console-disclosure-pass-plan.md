# Task 16 — Store Console Disclosure Pass Plan

## Goal

Prepare the final, truthful set of store-console disclosures and reviewer notes for Quiet Room so the Play Console and App Store Connect answers can be filled out consistently from one source.

This task is the final submission-prep pass. It exists to make sure the store answers, public privacy site, in-app behavior, and backend behavior all tell the same story.

---

## Why This Task Exists

Even when the product is implemented correctly, store review can still churn if:
- Play Data safety answers do not match the app's actual data handling
- App Store privacy answers do not match the app's behavior
- privacy/support/account-deletion URLs are wrong or stale
- reviewer notes omit the paths reviewers need to verify compliance features

This task turns the current implementation and policy work into a concrete answer set that can be copied into the stores.

---

## Important Boundary

This task prepares the final answer set and submission notes.

It does **not** require Codex to directly operate Play Console or App Store Connect.
The intended outcome is:
- exact answers
- exact URLs
- exact reviewer-note text
- exact checklist of fields for you to enter manually in the consoles

---

## Required Inputs

Before this task is considered ready, the following should already be stable enough to describe truthfully:
- `docs/privacy/data-inventory.md`
- public privacy-policy site (`/privacy`, `/support`, `/account-deletion`)
- AI consent behavior
- account deletion behavior
- iOS login behavior
- Android permission audit outcome
- iOS privacy-manifest audit outcome if relevant

If those are still changing, this task should produce a draft answer set only, not a final one.

---

## Required Outputs

This task must produce all of the following:

1. final Play Console disclosure notes/input sheet
2. final App Store Connect privacy/review-note input sheet
3. confirmed public URLs for privacy, support, and account deletion
4. reviewer-note copy for Apple and Google submissions
5. a final checklist of any store answers that still depend on unresolved audits

---

## Scope

### In scope
- prepare Play Data safety answer guidance
- prepare Play app-content / support / URL guidance
- prepare App Store privacy answer guidance
- prepare App Store reviewer notes
- verify the public URLs and in-app entry points used in those notes

### Out of scope
- clicking submit in the consoles
- inventing new product behavior to satisfy a store answer
- changing implementation in this task unless a mismatch is discovered and explicitly kicked back out as follow-up work

---

## Implementation Plan

### Step 1 — Freeze the truth set

Before preparing answers, verify the current truth source includes:
- final privacy-policy site URLs
- current account-deletion path
- current AI-consent behavior
- current third-party sharing story
- current log-retention/deletion-exception language
- current Android permission outcome
- current iOS privacy-manifest outcome

Deliverable:
- one explicit yes/no check that the truth set is stable enough for final store answers

---

### Step 2 — Prepare Play Console disclosure worksheet

Prepare a single document/checklist that captures the Play Console answers you expect to enter.

This should include at minimum:
- privacy-policy URL
- support/contact path
- account-deletion URL if requested
- data-collection/sharing answers informed by the data inventory
- any permission-sensitive notes informed by Task 14
- any AI/provider-sharing disclosures that affect Play answers

The result should be usable as a copy/paste answer source rather than vague notes.

---

### Step 3 — Prepare App Store Connect privacy worksheet

Prepare a single document/checklist that captures the App Store Connect privacy answers you expect to enter.

This should include at minimum:
- data types collected
- whether data is linked to the user
- whether data is used for app functionality / analytics / other purposes as applicable
- whether data is shared with third parties and why
- any answer dependencies that rely on the final data inventory or implementation details

The result should be a practical fill-in guide, not just a conceptual reminder.

---

### Step 4 — Prepare reviewer notes

Prepare concise reviewer-note text for the stores.

The notes should truthfully call out the main review-sensitive features, including:
- privacy-policy URL
- support URL
- account-deletion URL
- in-app deletion path: profile icon -> `Delete Account`
- AI consent shown before first content send
- Sign in with Apple on iOS
- any other key reviewer-relevant verification path

The reviewer notes should help the reviewer find the right surfaces quickly.

---

### Step 5 — Verify public URLs and app entry points

Confirm that the exact URLs and in-app paths referenced in the worksheets and reviewer notes are real.

At minimum confirm:
- `/privacy`
- `/support`
- `/account-deletion`
- About modal or equivalent in-app link surfaces
- profile icon deletion path

This task is not complete if the prepared answer set points to stale or wrong links.

---

### Step 6 — Call out unresolved blockers explicitly

If any answer still depends on an unfinished audit or unresolved product truth, list it explicitly.

Examples:
- Android permission audit not finalized
- iOS privacy-manifest decision not finalized
- final release-candidate QA not complete

Do not hide unresolved dependencies inside fuzzy wording.

---

## Play Console Worksheet Content

The final Play worksheet should, at minimum, contain:
- privacy-policy URL
- support/contact URL
- account-deletion URL if needed
- in-app deletion path summary
- data-sharing/data-collection guidance sourced from `docs/privacy/data-inventory.md`
- final permission notes sourced from Task 14
- any AI-sharing explanation needed for internal submission prep

The goal is for you to be able to open Play Console and fill fields without re-deciding the answers.

---

## App Store Connect Worksheet Content

The final App Store worksheet should, at minimum, contain:
- privacy-policy URL
- account-deletion URL
- in-app deletion path summary
- Sign in with Apple reviewer note
- AI consent reviewer note
- privacy-answer guidance based on actual data handling and third-party sharing
- any privacy-manifest notes sourced from Task 15

The goal is for you to be able to open App Store Connect and fill fields without re-deciding the answers.

---

## Reviewer Note Template Direction

A strong reviewer-note draft should be able to say things like:
- Privacy Policy: [URL]
- Support: [URL]
- Account deletion: [URL]
- In-app deletion: open Quiet Room, tap the profile icon, choose `Delete Account`, then confirm
- AI consent: Quiet Room shows an AI-sharing consent prompt before the first message is sent
- iOS login: Sign in with Apple is available on iOS

Do not include claims the reviewer cannot actually verify from the build.

---

## Verification Strategy

### Verification 1 — worksheet completeness

Confirm the Play and App Store worksheets are complete enough that you can fill the stores without re-deriving answers from scratch.

---

### Verification 2 — URL and path accuracy

Confirm every URL and in-app path referenced in the worksheets/reviewer notes is correct and currently works.

---

### Verification 3 — no major truth mismatch

Confirm the final worksheets match:
- `docs/privacy/data-inventory.md`
- public site copy
- app behavior
- backend behavior

---

## Task Result — 2026-04-22

Status: complete for the current repository truth set, with final release-candidate
checks still listed below.

Primary deliverable:

- `docs/privacy/store-console-disclosure-worksheet.md`

### Truth Set Stability Check

Stable enough for final store answers: **Yes**, with one Apple release-candidate
verification note.

Verified truth sources:

- data inventory: `docs/privacy/data-inventory.md`
- public site: `site/quiet-room-privacy-policy`
- site deployment notes: `site/quiet-room-privacy-policy/README.md` and `docs/privacy-v2/progress-tracker.md`
- Android permission audit result: `docs/privacy-v2/14-android-permission-audit-plan.md`
- app URL wiring: `src/config/env.ts` and `src/components/AboutModal.tsx`
- account deletion path: `src/screens/QuietRoomScreen.tsx`
- AI consent path: `src/screens/QuietRoomScreen.tsx`
- iOS Apple sign-in: `app.json` and `src/components/LoginModal.tsx`
- current generated iOS privacy manifest: `ios/QuietRoomQA/PrivacyInfo.xcprivacy`

The current generated native iOS project is the QA target and includes
`PrivacyInfo.xcprivacy` in target resources. Before final Apple upload, run the
production native sync/build path and confirm the production target includes the
equivalent manifest.

### Confirmed Public URLs

Checked with Node `fetch` on April 22, 2026:

- `https://quiet-room-privacy-policy.vercel.app/` — `200`
- `https://quiet-room-privacy-policy.vercel.app/privacy` — `200`
- `https://quiet-room-privacy-policy.vercel.app/support` — `200`
- `https://quiet-room-privacy-policy.vercel.app/account-deletion` — `200`

Final console URLs:

- Privacy policy URL: `https://quiet-room-privacy-policy.vercel.app/privacy`
- Support URL: `https://quiet-room-privacy-policy.vercel.app/support`
- Account deletion URL: `https://quiet-room-privacy-policy.vercel.app/account-deletion`

### In-App Entry Points Confirmed

- About modal links to Privacy Policy, Support, and Account Deletion through
  `PRIVACY_POLICY_URL`, `SUPPORT_URL`, and `ACCOUNT_DELETION_URL`.
- Signed-in account deletion is available from the profile icon menu through
  `Delete Account`, then a confirmation modal.
- AI consent is shown before the first content send. `Not now` does not send the
  pending message; `I Consent` persists consent and resumes the pending send.
- iOS Sign in with Apple is configured and exposed in the login modal.

### Reviewer Note Copy

The final copy/paste reviewer notes are in:

- `docs/privacy/store-console-disclosure-worksheet.md`

Short version:

```text
Privacy Policy: https://quiet-room-privacy-policy.vercel.app/privacy
Support: https://quiet-room-privacy-policy.vercel.app/support
Account deletion: https://quiet-room-privacy-policy.vercel.app/account-deletion

In-app account deletion: open Quiet Room, tap the profile icon, choose Delete Account, then confirm.

AI consent: Quiet Room shows an AI-sharing consent prompt before the first message is sent to the AI service. If the user chooses Not now, the pending message is not sent.
```

Apple-specific addition:

```text
iOS login: Sign in with Apple is available on iOS. Google and email/password sign-in may also be available when configured.

In-app privacy links: open the About screen to access Privacy Policy, Support, and Account Deletion links.
```

Google-specific addition:

```text
Permissions: Quiet Room supports AI chat and text-to-speech playback. The Android release manifest does not request microphone recording, camera, contacts, location, notification, or broad media/storage permissions.
```

### Store Answer Dependencies

No store-answer blockers remain from the Android permission audit, AI consent
implementation, account-deletion implementation, public site URLs, or iOS login
compliance.

Remaining final-submission checks:

- confirm the production iOS target/output includes `PrivacyInfo.xcprivacy`
  after `npm run native:sync:prod`
- confirm the production backend is using HTTPS/TLS URLs and 90-day deployed
  operational-log retention
- install the exact production store-candidate builds and smoke-check About
  links, AI consent, Apple sign-in on iOS, and signed-in account deletion

### Official Store Documentation Spot Check

Checked official store documentation on April 22, 2026:

- Google Play Data safety still requires developers to complete the form, review
  SDK/provider collection, disclose off-device collection, and identify deletion
  mechanisms:
  `https://support.google.com/googleplay/android-developer/answer/10787469`
- Apple App Privacy still requires privacy details for data collected by the app
  or third-party partners and a Privacy Policy URL in App Store Connect:
  `https://developer.apple.com/app-store/app-privacy-details/` and
  `https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy`

---

## Suggested Deliverables

- Play Console disclosure worksheet
- App Store Connect disclosure worksheet
- final reviewer notes draft
- final list of public URLs
- explicit unresolved-blocker list if any remain

---

## Definition Of Done

- a final Play Console answer sheet exists
- a final App Store Connect answer sheet exists
- reviewer-note copy exists and is truthful
- privacy/support/account-deletion URLs are verified and current
- the prepared answer set matches the implemented product and public site
- you can open the store consoles and fill the forms without re-deciding the product/privacy story from scratch
