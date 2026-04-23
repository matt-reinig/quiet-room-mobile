# Task 15 — iOS Privacy Manifest Audit Plan

## Goal

Determine whether Quiet Room and its shipped iOS dependencies require an iOS privacy manifest, add or verify the required manifest file if necessary, and ensure the final iOS release candidate is compliant with Apple's current privacy-manifest expectations.

---

## Why This Task Exists

Apple increasingly expects apps and SDKs to provide accurate privacy-manifest information for certain API usage and shipped dependencies.

Even when the user-facing app behavior is correct, App Store review can still churn if:
- a required privacy manifest is missing
- a shipped SDK expects a manifest and the app does not account for it
- the app's yes/no answer on privacy-manifest requirements is undocumented and based on assumption

The original research doc flagged the likely absence of `PrivacyInfo.xcprivacy` as a follow-up compliance item. This task turns that into an explicit audit.

---

## Required Outputs

This task must produce all of the following:

1. a documented yes/no answer on whether Quiet Room needs its own `PrivacyInfo.xcprivacy`
2. an inventory of relevant shipped iOS dependencies and APIs that may affect privacy-manifest requirements
3. the manifest file added or updated if needed
4. a short explanation of why the final result is correct

---

## Scope

### In scope
- inspect the iOS app target and shipped SDK/dependency set
- determine whether a privacy manifest is required at the app level
- determine whether any shipped SDK expectations create work for the app
- add/update `PrivacyInfo.xcprivacy` if needed
- verify the result on the iOS release candidate path

### Out of scope
- rewriting the broader privacy policy site
- App Store Connect privacy questionnaire answers
- unrelated iOS UX work

---

## Implementation Plan

### Step 1 — Inventory shipped iOS dependencies and relevant APIs

Inspect the actual iOS release-candidate dependency set and note any libraries or features likely to matter for privacy-manifest requirements.

Examples from current Quiet Room dependencies/config worth checking:
- Firebase SDK usage
- Apple sign-in support
- Google sign-in support
- web browser/auth session helpers
- file/audio playback support
- webview usage if shipped in the iOS binary

Deliverable:
- one reviewed list of app-level dependencies/APIs relevant to privacy-manifest analysis

---

### Step 2 — Determine whether the app needs its own `PrivacyInfo.xcprivacy`

Answer explicitly:
- does the Quiet Room app target require an app-level privacy manifest?
- if yes, what declarations are needed?
- if no, what evidence supports that answer?

This should not remain a guess.

---

### Step 3 — Check whether shipped SDKs already include their own manifests

For major shipped SDKs/libraries, determine whether they already provide the required manifest information themselves or whether the app needs to supply something additional.

The purpose is to avoid both:
- missing required declarations
- adding redundant or incorrect declarations

---

### Step 4 — Add or update `PrivacyInfo.xcprivacy` if needed

If the audit shows the app requires a privacy manifest, add/update the file in the correct iOS project location and ensure it is included in the app target.

Deliverable:
- committed manifest file with any required declarations

If the audit shows the app does not currently need an app-level manifest, document that conclusion clearly in the task notes or supporting doc.

---

### Step 5 — Rebuild and verify the iOS release candidate path

After any manifest change, verify the iOS release candidate still builds cleanly and the manifest is included in the expected app target/output.

Deliverable:
- one verification artifact showing the manifest decision is reflected in the real release path

---

## Audit Questions This Task Must Answer

By the end of this task, the answer to each must be explicit:

- Does Quiet Room require an app-level `PrivacyInfo.xcprivacy` file?
- Which shipped iOS dependencies/APIs were reviewed to answer that question?
- If a manifest is required, has it been added correctly?
- If a manifest is not required, what is the basis for that conclusion?
- Does the iOS release candidate reflect the final manifest decision?

---

## Verification Strategy

### Verification 1 — Dependency/API review complete

Capture a short reviewed list of the iOS dependencies/APIs that were considered in the audit.

---

### Verification 2 — Manifest presence/absence justified

Capture one of:
- the committed `PrivacyInfo.xcprivacy` file and target inclusion proof
- or a documented justification for why no app-level manifest is currently required

---

### Verification 3 — Release-path confirmation

Confirm the iOS release candidate path reflects the final manifest decision.

Accepted proof may include:
- project file/target inclusion proof
- release build artifact inspection
- build output showing the manifest is packaged where expected

---

## Suggested Deliverables

- reviewed iOS dependency/API audit notes
- `PrivacyInfo.xcprivacy` file if required
- release-path verification note
- any small follow-up issue only if a dependency creates unresolved uncertainty

---

## Definition Of Done

- Quiet Room has a documented yes/no answer on app-level privacy-manifest requirements
- the shipped iOS dependency/API set has been reviewed for privacy-manifest relevance
- `PrivacyInfo.xcprivacy` has been added and wired correctly if needed
- the iOS release candidate reflects the final manifest decision
- App Store submission readiness is improved by removing uncertainty around privacy-manifest compliance
