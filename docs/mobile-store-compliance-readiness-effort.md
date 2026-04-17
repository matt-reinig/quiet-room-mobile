# Mobile Store Compliance Readiness Effort

Status:

- active

Purpose:

- keep Apple and Google store review work on the critical path instead of treating it as last-mile metadata
- turn the published privacy-policy site into a review-ready policy/disclosure system that matches the shipped app
- prepare both QA and prod app records for Apple and Play policy review earlier in the release process

## Why This Effort Exists Now

Observed on April 11, 2026:

- the first QA Play upload for `com.quietroom.mobile.qa` reached Google Play successfully through the Android Publisher API
- Google Play then rejected the upload because the app requests `android.permission.RECORD_AUDIO` and the app record did not yet have a privacy policy URL configured

What changed because of that result:

- privacy-policy and store-disclosure work is now an early upload prerequisite
- internal testing on Play cannot be treated as a metadata-light staging area
- QA and prod app records should both be brought to the same baseline store-readiness standard

## Scope

This effort covers:

- public privacy policy URL for QA and prod app records
- support URL and support contact details for both stores
- in-app access to privacy, support, and account-deletion resources
- explicit AI-sharing disclosure and consent work needed for the shipped chat product
- Play Data safety answers
- Play app-content declarations
- Apple App Store Connect privacy and metadata alignment
- account deletion implementation if account creation remains part of the shipped product
- iOS login/compliance follow-up if Google sign-in remains part of the shipped product
- Android permission and iOS privacy-manifest audit work tied to store review

This effort does not cover:

- more QA/prod app-identity plumbing
- Android signing setup
- native build-system fixes unless they directly block policy validation

## Current State Snapshot

Observed by April 15, 2026:

- privacy-policy URLs are now set well enough for Play uploads to proceed
- QA Play internal track now contains:
  - `versionCode 2` as the earlier completed internal release
  - `versionCode 3` as the corrected-QA-SHA follow-up build in draft state
- PROD Play internal track now contains:
  - `versionCode 1` as the earlier completed internal release
  - `versionCode 2` as the refreshed-prod-Firebase follow-up build in draft state
- both iOS app records already have uploaded build records in App Store Connect
- the deep review in `docs/deep-research-report.md` clarified that the remaining work is no longer "publish a privacy policy URL"
- the real remaining work is to align the privacy-policy site, in-app behavior, backend deletion path, and store forms with the app's actual data flows
- the current remaining Play-console nuance is app draft-state / release-promotion behavior, not bundle upload auth

## Current Known Blockers

Current blockers to clear next:

- implement an in-app account deletion flow plus the backend deletion work it depends on
- implement an Apple-compliant equivalent login option if Google sign-in remains available on iOS
- add explicit first-run disclosure and consent before user content is shared with third-party AI providers
- revise the public privacy-policy and account-deletion pages so they match the actual data model and store-language expectations
- define and configure deployed backend operational-log retention in days so policy and store disclosures can state log retention concretely
- finish the Play and App Store metadata/forms using one verified data inventory rather than ad hoc answers
- audit the Android permission surface so sensitive permissions stay consistent with shipped features and disclosures
- determine whether the shipped iOS dependency/API set requires a `PrivacyInfo.xcprivacy` file
- promote the current Play draft releases when Console allows it
- verify Android native Google sign-in on the freshly rebuilt QA Play build
- verify Android native Google sign-in on the freshly rebuilt PROD Play build if that auth path is expected there too

## Workstreams

Detailed task slicing for these workstreams now lives in `docs/deep-research-privacy-policy.md`.

### 1. Data Inventory And Disclosure Source Of Truth

Deliverables:

- one verified inventory of collected data, sharing destinations, purposes, retention, and deletion behavior
- one source of truth that can drive `/privacy`, `/account-deletion`, Play Data safety, Play app-content, and App Privacy answers
- explicit decisions on anonymous-session persistence, profile/inference language, and whether sensitive permissions remain intentional

Open questions to resolve in this workstream:

- whether any stored data flows should be reduced before the first store submissions
- whether anonymous chats should remain persisted server-side for the first release
- what exact retention windows and deletion timelines can be truthfully promised

### 2. Privacy Policy Site Hardening

Implementation started on April 11, 2026:

- first-pass static site scaffold created at `site/quiet-room-privacy-policy`
- included first public pages for `/privacy`, `/support`, and `/account-deletion`
- current recommended Vercel project name: `quiet-room-privacy-policy`
- current recommendation is to use one shared public site for both QA and prod until store copy needs diverge
- production site deployed at `https://quiet-room-privacy-policy.vercel.app`
- current recommended privacy-policy URL: `https://quiet-room-privacy-policy.vercel.app/privacy`
- current recommended support URL: `https://quiet-room-privacy-policy.vercel.app/support`
- current recommended account-deletion URL if needed later: `https://quiet-room-privacy-policy.vercel.app/account-deletion`

Deliverables now required by the report:

- `/privacy` updated to name the developer/entity shown in store listings
- explicit disclosure of third-party AI/service-provider sharing
- explicit disclosure of stored profiles/inferences and conversation persistence
- retention/deletion language strengthened by data class
- `/account-deletion` updated to describe in-app deletion, fallback web deletion, timelines, and retained exceptions

### 3. In-App Compliance UX

Deliverables:

- privacy-policy, support, and account-deletion links reachable inside the app
- first-run AI-sharing disclosure and explicit consent before first message send
- review-safe copy in onboarding/settings/about surfaces that matches the public policy

### 4. Account Deletion Implementation

Deliverables:

- authenticated backend deletion path that clears Firebase/Auth-owned identity plus app-owned stored data
- mobile in-app account deletion UX including reauth/error handling as needed
- post-delete sign-out/new-anonymous-session behavior that leaves the app in a clean state

### 5. Store Metadata And Review Alignment

Deliverables:

- Data safety answers drafted and verified against the actual shipped app behavior
- Play app-content declarations filled out
- App Privacy answers aligned with the same data-handling story used in Play
- support contact details present in both stores
- reviewer notes prepared for QA/prod upload iterations if needed

### 6. Platform Policy Audit

Deliverables:

- iOS login requirement resolved either by shipping Sign in with Apple or removing the conflicting login path from iOS
- Android permission audit updated so permissions and declarations stay consistent
- `PrivacyInfo.xcprivacy` decision captured for the shipped iOS dependency/API set

## Checklist

- [x] Publish the privacy policy at a stable public URL.
- [x] Deploy `site/quiet-room-privacy-policy` to Vercel or another stable host.
- [x] Add that URL to the `Quiet Room QA` Play app record.
- [x] Add that URL to the `Quiet Room` Play app record.
- [ ] Add the support URL from the same site to both store records.
- [x] Retry the QA Play internal-testing upload.
- [x] Retry the prod Play upload once QA proves the path.
- [x] Create the first QA Play build record.
- [x] Create the first PROD Play build record.
- [x] Refresh `google-services.qa.json` after adding the Play app-signing certificate in Firebase.
- [x] Rebuild and re-upload QA with the refreshed Firebase config.
- [x] Correct the QA Firebase SHA mismatch, rebuild, and re-upload QA again.
- [x] Refresh `google-services.prod.json` locally after adding the Play app-signing certificate in Firebase.
- [x] Rebuild and re-upload PROD with the refreshed Firebase config if native Google sign-in is expected there.
- [ ] Promote the current Play draft releases as needed in Console.
- [ ] Build one verified data-inventory/disclosure matrix for auth, chat, profiles/inferences, voice, and logs.
- [ ] Define and configure deployed backend operational-log retention in days, then reflect that number in privacy/store disclosures.
- [ ] Revise `/privacy` to cover developer identity, third-party AI/services, profiles/inferences, retention by data class, and deletion language.
- [ ] Revise `/account-deletion` so it explains in-app deletion, fallback web deletion, deleted data, retained exceptions, and timelines.
- [ ] Add privacy/support/account-deletion links inside the app.
- [ ] Add first-run AI-sharing disclosure and explicit consent before first message send.
- [ ] Implement the backend account deletion path for auth plus persisted user data.
- [ ] Implement the mobile in-app account deletion UX and post-delete cleanup flow.
- [ ] Implement Sign in with Apple or explicitly remove the conflicting iOS login path before submission.
- [ ] Audit Android permissions and remove or disclose any sensitive permissions that remain.
- [ ] Decide whether the iOS app needs a `PrivacyInfo.xcprivacy` file and add it if required.
- [ ] Draft Play Data safety answers.
- [ ] Draft Play app-content declarations.
- [ ] Confirm support/contact metadata for Play.
- [ ] Confirm support/contact metadata for App Store Connect.
- [ ] Align Apple App Privacy answers with Play disclosures.
- [ ] Prepare reviewer notes that explain login methods, deletion path, AI consent, and in-app policy links.
- [ ] Verify Android native Google sign-in on the current QA Play build.
- [ ] Verify Android native Google sign-in on the current PROD Play build if that auth path ships there too.

## Definition Of Done

This effort is done when:

- QA and prod Play uploads are no longer blocked by missing metadata
- QA and prod Play tracks no longer depend on draft-only release handling
- both stores have the minimum required privacy/support metadata in place
- the public privacy-policy site, in-app UX, and store-form answers all tell the same truthful data-handling story
- App Store P0 blockers are cleared for account deletion and login-equivalence requirements
- remaining release blockers are product decisions or review outcomes rather than missing console setup
