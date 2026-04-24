# Deep Research Privacy Policy And Store Compliance Plan

Status:

- active

Purpose:

- turn the findings in `docs/deep-research-report.md` into implementation-ready planning
- break the remaining privacy/store work into isolated tasks that can be run independently
- keep policy copy, in-app UX, backend behavior, and store-console answers aligned

Primary source:

- `docs/deep-research-report.md`

## What The Report Changed

As of April 15, 2026, the main planning shift is this:

- the privacy-policy URL problem is already solved well enough to unblock Play uploads
- the remaining risk is now review mismatch, not missing scaffolding
- App Store review still has two likely P0 blockers:
  - no in-app account deletion flow
  - no Apple-compliant equivalent login if Google sign-in remains on iOS
- there is also a high-risk disclosure gap around third-party AI sharing, derived profiles/inferences, and deletion/retention specificity

That means the next work should be organized around truth and reviewability, not just page publication.

## Recommended Delivery Order

1. Verify the real data/disclosure story.
2. Update the public privacy-policy site to match that story.
3. Make the same story true in-app with links and consent UX.
4. Implement the account-deletion backend and mobile flow.
5. Resolve the iOS login requirement.
6. Fill out store consoles only after the product and policy story is stable.

## Isolated Task List

| Task | Priority | Can run now | Depends on | Primary output |
|---|---|---|---|---|
| 1. Data inventory and disclosure matrix | P0 | yes | none | source of truth for policy + store forms |
| 2. Privacy-policy site revision | P1 | after task 1 draft exists | task 1 | updated `/privacy` and `/account-deletion` copy |
| 3. In-app privacy/support links | P1 | yes | stable URLs | app surfaces linked to policy/support/delete pages |
| 4. AI-sharing disclosure and consent UX | P0 | yes | task 1 draft helps | first-run consent before first message |
| 5. Backend account deletion path | P0 | yes | task 1 | delete endpoint/job and data coverage |
| 6. Mobile in-app account deletion UX | P0 | after task 5 API shape is known | task 5 | review-safe delete-account flow |
| 7. iOS equivalent login decision and implementation | P0 | yes | product decision | Sign in with Apple or iOS login scope reduction |
| 8. Android permission audit | P1 | yes | none | permission/removal decision and disclosure alignment |
| 9. Mobile desktop-parity for model gating and conditional chat chrome | P1 | yes | desktop behavior is already defined | mobile model-picker and header/composer chrome match desktop rules |
| 10. Store-console disclosure pass | P1 | after tasks 1-9 stabilize | tasks 1-9 | Play + App Store answers and review notes |
| 11. iOS privacy manifest audit | P2 | yes | none | `PrivacyInfo.xcprivacy` decision and file if needed |

## Task Details

### 1. Data Inventory And Disclosure Matrix

Why this exists:

- every remaining policy, UX, and store answer depends on one truthful data inventory

Scope:

- verify account identifiers and auth providers
- verify conversation content storage and anonymous-session persistence
- verify timezone/metadata storage
- verify derived profile/inference storage
- verify voice/TTS flows and logging behavior
- verify third-party recipients and whether they should be named directly
- choose retention and deletion statements that can actually be honored

Done when:

- one matrix exists for data type, collected/shared status, purpose, retention, deletion path, and store-disclosure mapping
- the team can answer Play Data safety and App Privacy questions without guessing

Suggested child plan doc:

- `docs/store-data-inventory-plan.md`

### 2. Privacy-Policy Site Revision

Why this exists:

- the current public site is helpful, but the report says it still underspecifies the app's real data flows

Scope:

- update `/privacy` to include developer/entity identity
- add explicit third-party AI/service-provider disclosure
- add profiles/inferences disclosure
- add a retention/deletion section by data class
- strengthen security language so it is not purely generic
- update `/account-deletion` to explain in-app deletion, fallback web deletion, deleted data, retained exceptions, and timelines

Done when:

- the site can support both store review and user-facing trust without obvious mismatch to the codebase

Suggested child plan doc:

- `docs/privacy-policy-site-hardening-plan.md`

### 3. In-App Privacy, Support, And Deletion Links

Why this exists:

- both stores expect privacy-policy access inside the app, not only in store metadata

Scope:

- add privacy/support/account-deletion links in the right user-facing surfaces
- likely surfaces: settings, about, login footer, onboarding/help
- make sure the URLs match the published public site

Done when:

- a reviewer can open the app and find the privacy policy without hunting

Suggested child plan doc:

- `docs/in-app-policy-links-plan.md`

### 4. AI-Sharing Disclosure And Consent UX

Why this exists:

- the report flags third-party AI sharing as a likely App Store review issue unless there is explicit disclosure and permission

Scope:

- add first-run disclosure before first message send
- store consent state and re-prompt rules
- align the language with `/privacy`
- decide whether anonymous users see the same consent gate

Done when:

- the app has an explicit consent moment before user content is shared for chat generation

Suggested child plan doc:

- `docs/ai-sharing-consent-plan.md`

### 5. Backend Account Deletion Path

Why this exists:

- the current web page fallback is not enough because the app stores account-linked data server-side

Scope:

- define authenticated delete-account endpoint/job
- delete or queue deletion for account-linked Firestore data
- include conversations, profile/inference data, and related user-owned records
- define what can be deleted immediately versus asynchronously
- define operational-log exceptions if any

Done when:

- the backend can truthfully support the deletion promises made in-app and on the site

Suggested child plan doc:

- `docs/backend-account-deletion-plan.md`

### 6. Mobile In-App Account Deletion UX

Why this exists:

- Apple requires account deletion inside the app when account creation exists

Scope:

- add a visible delete-account entry point
- handle provider reauth if needed
- call the backend deletion path
- clean up client state and move the user to a safe signed-out or anonymous state
- add review-safe confirmation copy

Done when:

- a reviewer can delete an account from within the app without contacting support

Suggested child plan doc:

- `docs/mobile-account-deletion-plan.md`

### 7. iOS Equivalent Login Decision And Implementation

Why this exists:

- if Google sign-in ships on iOS, the report says App Store Guideline 4.8 likely requires an Apple-compliant equivalent login path

Scope:

- decide whether iOS keeps Google sign-in for first release
- if yes, add Sign in with Apple and backend identity mapping
- if no, remove or hide the conflicting iOS login path and update docs/review notes

Done when:

- the shipped iOS login options no longer create a likely Guideline 4.8 rejection

Suggested child plan doc:

- `docs/mobile-ios-login-compliance-plan.md`

### 8. Android Permission Audit

Why this exists:

- the first Play rejection already proved that sensitive permissions matter early, and the report recommends auditing whether `RECORD_AUDIO` is really intentional

Scope:

- inspect the built manifest and package dependencies
- confirm why `RECORD_AUDIO` is present
- remove unneeded permissions or document the shipped feature and disclosure/consent path
- sanity-check any other review-worthy permissions still in the release build

Done when:

- every remaining Android permission is intentional and supportable in store declarations

Suggested child plan doc:

- `docs/android-permission-audit-plan.md`

### 9. Mobile Desktop-Parity For Model Gating And Conditional Chat Chrome

Why this exists:

- mobile now needs to stay aligned with the desktop app's feature-flagged chat-model behavior rather than drifting into a separate UX contract

Scope:

- mirror desktop model-availability rules driven by `GET /api/feature_flags`
- expose the mobile model picker only when the user actually has more than one enabled model
- mirror the desktop conditional chat chrome behavior for the model picker and the associated graphic/header treatment when those elements should be hidden
- make sure stale or disabled model selections fall back cleanly to the allowed default model
- update mobile selectors/tests so the parity behavior is easy to verify in QA

Grounding references:

- desktop rollout behavior: `quiet-room/docs/desktop-prod-productionization-plan.md`
- desktop verification coverage: `quiet-room/tests/model-availability-gating.spec.ts`
- current mobile selector contract: `docs/mobile-selector-contract.md`

Done when:

- mobile and desktop tell the same feature-flag story for model availability, picker visibility, and conditional graphic/chrome visibility
- QA can verify the same major permutations on mobile without relying on ad hoc manual interpretation

Suggested child plan doc:

- `docs/mobile-model-gating-parity-plan.md`

### 10. Store-Console Disclosure Pass

Why this exists:

- Play Data safety and App Privacy answers are only safe once the product and public policy story are stable

Scope:

- fill Play Data safety
- fill Play app-content declarations
- align App Privacy answers
- verify support/privacy/account-deletion URLs
- prepare reviewer notes for deletion, login, AI consent, and policy links

Done when:

- the store-console answers can be entered once and defended during review

Suggested child plan doc:

- `docs/store-console-disclosure-plan.md`

### 11. iOS Privacy Manifest Audit

Why this exists:

- the report flagged the likely absence of `PrivacyInfo.xcprivacy` as a follow-up compliance item

Scope:

- inventory the shipped iOS dependency/API set
- determine whether the app or shipped SDKs require a privacy manifest
- add `PrivacyInfo.xcprivacy` if needed

Done when:

- the app has a documented yes/no answer for privacy-manifest requirements

Suggested child plan doc:

- `docs/ios-privacy-manifest-plan.md`

## Minimum Safe Submission Set

These are the tasks that most directly affect whether the first real store-review pass is likely to churn:

- task 1: data inventory and disclosure matrix
- task 2: privacy-policy site revision
- task 4: AI-sharing disclosure and consent UX
- task 5: backend account deletion path
- task 6: mobile in-app account deletion UX
- task 7: iOS equivalent login decision and implementation
- task 10: store-console disclosure pass

## Good Parallelization

These can move at the same time once ownership is clear:

- task 2 and task 3
- task 5 and task 7
- task 8 and task 10
- task 9 and task 11

These should stay tightly sequenced:

- task 1 before task 10
- task 5 before task 6
- task 2 and task 4 before the final App Store privacy/review-note pass

## Suggested Next Planning Move

If you want to turn this into smaller runnable docs, the cleanest next step is:

1. write the task-1 data inventory plan first
2. pick one P0 product task to run in parallel:
   - backend/mobile account deletion
   - iOS login compliance
   - AI consent UX
3. leave store-console entry until those answers stop changing
