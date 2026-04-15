# Mobile Store Compliance Readiness Effort

Status:

- active

Purpose:

- unblock the first successful Google Play internal-testing upload
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
- Play Data safety answers
- Play app-content declarations
- Apple App Store Connect privacy and metadata alignment
- account-deletion follow-up if email/password signup remains part of the shipped product

This effort does not cover:

- more QA/prod app-identity plumbing
- Android signing setup
- native build-system fixes unless they directly block policy validation

## Current State Snapshot

Observed by April 12, 2026:

- privacy-policy URLs are now set well enough for Play uploads to proceed
- QA Play internal track now contains:
  - `versionCode 2` as the earlier completed internal release
  - `versionCode 3` as the corrected-QA-SHA follow-up build in draft state
- PROD Play internal track now contains:
  - `versionCode 1` as the earlier completed internal release
  - `versionCode 2` as the refreshed-prod-Firebase follow-up build in draft state
- both iOS app records already have uploaded build records in App Store Connect
- the current remaining Play-console nuance is app draft-state / release-promotion behavior, not bundle upload auth

## Current Known Blockers

Current blockers to clear next:

- promote the current Play draft releases when Console allows it
- finish any remaining Play and App Store metadata that still prevents the app records from feeling fully operational
- verify Android native Google sign-in on the freshly rebuilt QA Play build
- verify Android native Google sign-in on the freshly rebuilt PROD Play build if that auth path is expected there too

## Workstreams

### 1. Privacy Policy Publication

Deliverables:

- one public privacy policy URL that accurately describes the shipped app
- the URL entered into `Quiet Room QA` and `Quiet Room` in Play Console
- the same URL available for App Store Connect metadata where needed

Open questions to resolve in this workstream:

- where the canonical hosted privacy policy should live
- whether QA and prod should share the same public privacy policy URL

Implementation started on April 11, 2026:

- first-pass static site scaffold created at `site/quiet-room-privacy-policy`
- included first public pages for `/privacy`, `/support`, and `/account-deletion`
- current recommended Vercel project name: `quiet-room-privacy-policy`
- current recommendation is to use one shared public site for both QA and prod until store copy needs diverge
- production site deployed at `https://quiet-room-privacy-policy.vercel.app`
- current recommended privacy-policy URL: `https://quiet-room-privacy-policy.vercel.app/privacy`
- current recommended support URL: `https://quiet-room-privacy-policy.vercel.app/support`
- current recommended account-deletion URL if needed later: `https://quiet-room-privacy-policy.vercel.app/account-deletion`

### 2. Play Metadata Baseline

Deliverables:

- Data safety answers drafted and verified against the actual shipped app behavior
- app-content declarations filled out
- support contact details present
- tester/release notes expectations documented for QA uploads

### 3. Apple Metadata Alignment

Deliverables:

- support URL present
- privacy policy URL present
- App Privacy answers aligned with the same data-handling story used in Play
- review notes ready for QA/prod upload iterations if needed

### 4. Product / Policy Gaps

Deliverables:

- account-deletion requirement either implemented or explicitly deferred with a documented release decision
- Android permission audit updated so permissions and declarations stay consistent

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
- [ ] Draft Play Data safety answers.
- [ ] Draft Play app-content declarations.
- [ ] Confirm support/contact metadata for Play.
- [ ] Confirm support/contact metadata for App Store Connect.
- [ ] Align Apple App Privacy answers with Play disclosures.
- [ ] Decide the account-deletion path for first release.
- [ ] Verify the remaining Android permissions are intentional.

## Definition Of Done

This effort is done when:

- QA and prod Play uploads are no longer blocked by missing metadata
- QA and prod Play tracks no longer depend on draft-only release handling
- both stores have the minimum required privacy/support metadata in place
- the declared privacy and policy answers match the shipped app behavior
- remaining release blockers are product decisions or review outcomes rather than missing console setup
