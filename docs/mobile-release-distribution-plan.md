# Mobile Release And Distribution Plan

This plan is for the next distribution milestones after local mobile bring-up.

Current priority:

1. Clear the review-critical compliance blockers identified in `docs/deep-research-report.md`
2. Align the privacy-policy site, in-app UX, and store-console disclosures with one verified data story
3. Turn the new QA/prod store records into a working distribution pipeline
4. Validate QA install/tester distribution from the newly proven Apple and Play upload paths
5. Validate first prod-candidate uploads on Apple and Play
6. Capture final release blockers from real-device testing

Confirmed current tester detail:

- Emily is on iPhone
- the preferred rapid-iteration path should therefore be internal TestFlight

## Current Status Update

What has changed since this plan was first written:

- Emily is already testing on TestFlight
- internal TestFlight setup is no longer the main blocker
- the app-identity split is now implemented in the repo and smoke-verified
- the four matching Apple / Play app records now exist for QA and prod
- Android release signing is now wired locally with a real upload-key path
- branded QA and prod iOS builds have already uploaded successfully to App Store Connect
- QA iOS build `12` was uploaded from the main `develop` tree on April 21, 2026 using the documented unsigned-archive plus automatic export/upload path
- QA Android `versionCode 5` was uploaded from the main `develop` tree on April 21, 2026 as a draft internal Play release
- the first QA Play upload reached Google Play and was blocked by missing privacy-policy metadata because the app requests `android.permission.RECORD_AUDIO`
- the privacy-policy URL gate is no longer the main issue; the deeper remaining work is review alignment across policy copy, in-app behavior, and store disclosures
- the next planning focus should shift from "make the split possible" to "finish store compliance and make the split operational for release and tester distribution"

What TestFlight should mean now:

- keep using Emily's TestFlight loop to validate fixes on a real device
- convert Emily feedback into a short list of true release blockers vs follow-up polish
- keep iOS validation moving while Play metadata and policy work proceed in parallel
- do not assume Play internal testing can bypass privacy-policy or app-content setup

## Why Real-Device Beta Still Matters

This is still the fastest path to real user validation while the remaining store paperwork is being finished.

Why it comes before store submission:

- it gets the app onto a real non-dev phone quickly
- it validates onboarding, chat, layout, auth, and general feel outside the emulator/simulator
- it helps confirm what still feels unfinished before store screenshots, copy, and review metadata are prepared
- it keeps product learning moving even when Play policy metadata becomes the current gating work

## Current Project State

The app is already far enough along that release planning can focus on distribution and polish rather than basic mobile bring-up.

What is already true:

- Android package ids are now split between `com.quietroom.mobile.qa` and `com.quietroom.mobile`
- iOS bundle ids are now split between `com.quietroom.mobile.qa` and `com.quietroom.mobile`
- icon asset paths are already wired in Expo config
- Android emulator bring-up is working on this Mac
- iOS simulator bring-up is working on this Mac
- local mobile docs already include an Android phone APK workflow
- QA and prod local build flows now exist for both Apple and Android

Important current gaps:

- in-app account deletion is not yet implemented
- Apple-compliant equivalent login is not yet implemented if Google sign-in remains on iOS
- explicit AI-sharing disclosure/consent is not yet implemented
- privacy policy and store disclosure work are not yet fully aligned with the app's real data flows
- mobile is not yet aligned with the desktop app's latest feature-flagged model-picker and conditional graphic/chrome behavior
- Play app-content metadata still needs to be completed before broader rollout/review can be considered ready
- the Android permission surface still needs a final store-policy audit
- the iOS privacy-manifest requirement has not been audited yet
- the QA Play record now has a proven upload path, but still needs tester install validation and any console-owned draft rollout/review steps
- the prod Play record still needs prod-candidate internal tester validation before public release planning

Current review-critical blockers from the April 15, 2026 report:

- App Store P0: add in-app account deletion if account creation remains supported
- App Store P0: add Sign in with Apple or remove the conflicting iOS login path if Google sign-in remains
- App Store high risk: add explicit disclosure/permission before sharing user content with third-party AI providers
- Cross-store high risk: revise the privacy-policy site and store-form answers to cover third-party AI, profiles/inferences, retention, deletion, and in-app access

Detailed work breakdown for this area now lives in `docs/deep-research-privacy-policy.md`.

## Phase 1: Get Emily On A Beta Build

Status:

- active / substantially complete once Emily is installing and testing through TestFlight

Goal:

- get the app onto Emily's real phone as quickly as possible

Recommended order:

1. Use internal TestFlight rather than external TestFlight for the main Emily iteration loop.
2. Keep the first beta scope narrow and validate one basic app flow.
3. Capture any install, login, layout, or onboarding friction from Emily's device.

### iPhone path

Preferred first pass:

- use internal TestFlight

Why:

- it avoids the external TestFlight review bottleneck during rapid iteration
- it is much more repeatable than direct-installing every new build
- it still gives Emily a clean install/update flow through the TestFlight app

What TestFlight means in practice:

- Emily does not plug her phone into your computer
- you upload the iOS build to Apple from your side
- Emily installs the free TestFlight app from the App Store
- Emily accepts your invite and installs the beta through TestFlight

Important distinction:

- internal TestFlight is the preferred path for Emily when you expect lots of iterations
- external TestFlight is better saved for later milestone builds
- direct install is still useful as an emergency fast path, but not as the main repeated workflow

Think of the split like this:

- your side: Apple Developer account, App Store Connect, Xcode upload
- Emily's side: TestFlight app on her iPhone

What you need on your side:

1. Apple Developer Program membership
2. App Store Connect access
3. an app record for the iOS app
4. one uploaded iOS beta build
5. Emily added as an App Store Connect user so she can be an internal tester
6. an internal TestFlight group with Emily added to it

What Emily needs on her side:

1. an iPhone
2. an Apple ID
3. the free TestFlight app installed from the App Store
4. an accepted App Store Connect invite from your team
5. the TestFlight invite for the internal build

Concrete TestFlight flow:

1. You make sure Apple Developer / App Store Connect access is active.
2. You create or confirm the iOS app record in App Store Connect.
3. You archive and upload an iOS build from Xcode.
4. Apple processes the build.
5. You add Emily to App Store Connect as a user with access to the app.
6. You create or use an internal TestFlight group and add Emily to it.
7. You add the uploaded build to that internal group.
8. Emily accepts the App Store Connect invite and installs TestFlight.
9. Emily installs the internal build from TestFlight.
10. Emily runs one simple test flow and sends back feedback.

Why this is different from installing on your own phone:

- your own phone can be used as a direct dev device when connected to Xcode
- Emily's iPhone should be treated as a repeat internal testing device
- internal TestFlight is a better fit than external review if you expect many rapid builds

Internal TestFlight vs direct install:

- internal TestFlight is better for repeated updates over days or weeks
- direct install is better only when you need a one-off emergency install right now
- internal TestFlight has more Apple/App Store Connect setup up front
- direct install has more device/provisioning friction each time

Internal TestFlight vs external TestFlight:

- internal TestFlight is the better path for rapid iteration
- external TestFlight is the better path for later cleaner milestone testing
- external TestFlight can introduce review delay
- internal TestFlight is therefore the preferred Emily loop for now

Recommended first beta scope for Emily:

- install the app successfully
- open the app successfully
- use guest flow or email/password flow first
- send one message
- confirm one response renders correctly

Keep the first beta narrow:

- do not make Google sign-in the first thing Emily validates on iPhone even though it now works locally
- use the beta to find install, layout, onboarding, or basic chat issues first

Immediate next actions for Emily:

1. Confirm Apple Developer / App Store Connect access is ready.
2. Create or confirm the app record in App Store Connect.
3. Upload a beta build for iOS.
4. Add Emily as an App Store Connect user for internal testing.
5. Add Emily to an internal TestFlight group.
6. Have Emily install through the TestFlight app and run one simple end-to-end flow.

Phase 1 acceptance:

- Emily can install the app
- Emily can open the app successfully
- one basic app flow works on her phone
- we collect a short list of any friction, visual issues, or setup problems

## Phase 2: Finalize QA / Prod App Identity

Status:

- complete for repo-side implementation and initial store-record creation

Goal:

- define the permanent prod identity and the side-by-side-installable QA identity before store setup expands further

Tasks:

- final public app name is `Quiet Room`
- QA app name should be `Quiet Room QA`
- keep the prod ids as `com.quietroom.mobile`
- introduce QA ids as `com.quietroom.mobile.qa`
- finalize the app icon artwork
- confirm splash and adaptive icon assets still look correct after final art is chosen

Current brand direction:

- keep the visual simple
- core symbol: a door with a cross on it
- use the door + cross mark for launcher, splash, store, and related marketing surfaces only
- keep the main in-app devotional functionality and imagery separate from the launcher/store mark
- small app icon should use the door + cross only, without app name text
- larger assets may include the app name on the door if it still reads clearly
- prefer a mark that still works when reduced to small App Store / Play Store icon sizes
- keep QA visually related to prod rather than inventing a second brand
- if QA and prod need launcher-level differentiation, prefer a subtle QA badge or tint treatment rather than a different core symbol

Branding deliverables to prepare:

- small app icon for iOS / Android launcher use
- Android adaptive icon treatment
- splash image that matches the final icon direction
- larger marketing image variants for store listings or TestFlight-facing materials if needed

Branding source of truth:

- first-pass visual and export spec: `docs/mobile-branding-asset-spec.md`

Current repo-side branding audit:

- `app.json` already points the mobile build at `assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash-icon.png`, and `assets/favicon.png`
- those launcher and splash assets are still Expo placeholder art rather than Quiet Room product branding
- current exported sizes are already usable as a starting shell: `icon.png` 1024x1024, `adaptive-icon.png` 1024x1024, `splash-icon.png` 1024x1024, `favicon.png` 48x48
- the current in-app devotional image is separate from launcher branding and is already used in the mobile UI via `assets/crucifix-web.png`
- `src/screens/QuietRoomScreen.tsx` currently shows `crucifix-web.png` in the header and crucifix modal, so launcher branding and in-app imagery should be treated as related but distinct decisions

Branding mismatch to resolve explicitly:

- the planned public launcher mark is a door with a cross on it
- the current in-app imagery is a crucifix image
- this is now an intentional system: launcher/store icon as the product mark, crucifix artwork as devotional UI imagery
- do not treat the branding task as a requirement to replace in-app devotional imagery or main app functionality

Recommended mobile branding deliverables for first public release:

1. Source-of-truth master artwork for the door + cross mark, ideally vector or layered high-resolution art kept outside the generated export files.
2. iOS / Android primary app icon export based on the final mark, optimized to read clearly at very small sizes.
3. Android adaptive icon foreground export that keeps the symbol inside the safe area and avoids edge clipping on masked launchers.
4. Splash artwork export that reuses the same symbol system and background color rather than introducing a second visual identity.
5. Favicon / lightweight web icon export so the web-adjacent surfaces do not keep showing placeholder branding.
6. Optional larger marketing or store-listing art if TestFlight invite screens or store metadata need a branded image beyond the square icon.

Recommended technical spec checklist:

- keep `assets/icon.png` as a 1024x1024 square export for Expo launcher icon generation
- keep `assets/adaptive-icon.png` as a 1024x1024 foreground export with comfortable padding for Android mask shapes
- keep `assets/splash-icon.png` as a high-resolution centered symbol export sized for `resizeMode: contain`
- keep launcher exports on a simple solid background unless a more complex background is proven to survive small-size reduction cleanly
- verify the final icon on both light and dark device wallpapers, because transparency and thin strokes can read differently than they do in design tools
- test the adaptive icon on Android after export, because the masked shape often reveals spacing problems not obvious in the flat square file

Suggested work order for the branding task:

1. Confirm the permanent naming split: `Quiet Room` for prod and `Quiet Room QA` for the tester build.
2. Confirm the final symbol decision: door + cross for launcher/store identity only, without changing core in-app devotional functionality.
3. Create the master artwork before touching generated PNG exports.
4. Decide whether QA needs a subtle launcher differentiator for side-by-side installs.
5. Export replacement files for `icon.png`, `adaptive-icon.png`, `splash-icon.png`, and `favicon.png`, plus QA-specific variants later if needed.
6. Launch the app on iPhone and Android emulator/device to visually verify icon legibility and splash balance.
7. Only after those exports look correct, capture store screenshots and any TestFlight-facing branded materials.

## Phase 3: Operationalize The Four Store Records

Status:

- next effort

Goal:

- turn the newly created QA and prod app records on Apple and Google Play into a reliable release pipeline

What this next effort should cover:

- confirm QA builds upload to the QA Apple / Play records and prod builds upload to the prod records
- finish the policy and metadata prerequisites that now gate Google Play uploads
- finalize signing / provisioning for release builds rather than debug-style local signing
- configure tester groups, internal tracks, and release notes flow for QA distribution
- prepare screenshots, metadata, privacy policy links, and review-compliance copy for both stores
- run one physical-device side-by-side validation pass so QA and prod installs can both be trusted before public submission

Acceptance for this next effort:

- Play metadata no longer blocks the first QA upload
- QA upload path works on both Apple and Play
- prod-candidate upload path works on both Apple and Play
- tester distribution path is clear for QA
- public submission path is clear for prod
- remaining blockers are product / policy decisions rather than store plumbing confusion

Why this phase should happen before store submission:

- screenshots, listings, and TestFlight invites should reflect the real product identity
- changing core branding late creates churn across both stores

Active tracker for this newly elevated workstream:

- `docs/mobile-store-compliance-readiness-effort.md`

## Active Effort: Store Compliance And Metadata Readiness

Goal:

- unblock the first successful Play internal-testing upload and reduce late-stage store-review churn for both QA and prod

Why this effort is active now:

- on April 11, 2026, the first QA Play upload reached Google Play and failed because a privacy policy URL was required for an app that requests `android.permission.RECORD_AUDIO`
- that means privacy-policy and app-content work is not only a production-launch concern; it is an early upload prerequisite

What this effort now owns:

- privacy policy URL publication and wiring for both app records
- Play Data safety and app-content answers
- support/contact/store metadata needed on both Apple and Play
- account-deletion follow-up if account creation remains in scope
- verification that QA internal testing and prod-candidate uploads can proceed without store-policy blockers

## Phase 3: Google Play Prep

Goal:

- be ready to ship a proper Android store build

Current known Google-side requirements to plan around:

- if the Play Console account is a personal account created after November 13, 2023, Google requires a closed test with at least 12 opted-in testers for 14 consecutive days before production access is granted
- if the Play Console account is a new personal account, Google also requires Android device verification through the Play Console mobile app before the app can be made available on Google Play
- the personal-account testing gate is explicitly scoped to personal accounts, so choosing between personal and organization matters early
- all apps need an accurate Data safety section and a public privacy policy URL
- if the app allows users to create an account, Google requires an account deletion path both inside the app and outside the app, with the outside-the-app deletion URL entered in Play Console
- the latest published Play target-API announcement found during planning says submissions must target Android 15 / API level 35; verify this again right before upload in case Google updates it

Current repo-side readiness snapshot:

- Android package ids are now variant-aware through `app.config.js`
- the QA Android package id is `com.quietroom.mobile.qa`
- the prod Android package id is `com.quietroom.mobile`
- variant-specific Google service files are selected through app config when present locally
- there is already a local release APK workflow in `docs/mobile-apk-phone-workflow.md`
- there is now a Play-internal-testing runbook in `docs/mobile-play-internal-testing-runbook.md`
- there is now a dedicated store-compliance tracker in `docs/mobile-store-compliance-readiness-effort.md`
- repo helpers now exist for Android release prep: `npm run android:play:status:qa`, `npm run android:play:status:prod`, `npm run android:play:preflight:qa`, `npm run android:play:preflight:prod`, and `npm run android:play:prepare`
- there is no `eas.json`, so the clearest current store-build path is the native Android/Gradle project rather than an EAS-managed Play submission flow
- generated Android release signing now reads a real upload key from local env
- Android versioning is now tracked in `app.json` with `expo.android.versionCode`
- the visible Android app name now follows the selected QA/prod app variant
- the manifest still declares sensitive-or-review-worthy permissions that should be audited for production, including `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`
- fresh QA and prod Android App Bundles can now be built locally
- Play service-account auth is configured well enough to create edits and start bundle uploads
- the first QA Play upload already proved the next real blocker is missing privacy-policy metadata
- privacy policy, Data safety responses, and account deletion support are not yet release-ready

Concrete work order:

1. Decide whether the Play Console account should be personal or organization before any store setup begins.
2. Create or confirm the Play Console account and complete developer verification.
3. If the account is a new personal account, plan for device verification and the 12-tester / 14-day closed-testing gate up front.
4. Create the QA Play Console app with package id `com.quietroom.mobile.qa` for internal testing.
5. Reserve `com.quietroom.mobile` for the production Play listing.
6. Finalize the public and QA app names plus icon approach before taking Play screenshots or writing listing copy.
7. Confirm the real Android upload key is stored safely and remains the release-signing source of truth.
8. Verify Firebase / Google Cloud include the release SHA fingerprints that Google sign-in needs.
9. Audit Android permissions and remove anything not genuinely needed for the first public release.
10. Publish a public privacy policy URL and enter it on both Play app records before retrying upload.
11. Draft Data safety, app-content declarations, support contact details, and other store metadata while the first upload path is being validated.
12. Increment Android `versionCode` / `versionName` and verify the first release bundle targets the current required API level.
13. Build an Android App Bundle for the QA app and confirm internal testing distribution works.
14. Build an Android App Bundle for the prod app and enroll in Play App Signing during the first upload flow.
15. If email/password signup remains available, ship or document the required account deletion flow both in-app and on the web.
16. Use internal testing on the QA app first, then closed testing as needed, and only move the prod app to production after the policy and testing gates are satisfied.

Repo-specific blockers to close before first upload:

- Play now requires privacy-policy metadata before the first QA internal-testing upload can complete
- the Android permission surface has not been audited for store review
- store compliance declarations are not yet prepared
- account deletion is still a product and policy gap

Phase 3 acceptance:

- the Play Console account is created and verified
- release builds no longer use the debug keystore
- Firebase / Google Cloud include the release signing fingerprints that production auth needs
- the first Android App Bundle uploads successfully to Play Console
- privacy policy, Data safety, and app-content declarations are filled out with answers that match the shipped app
- if personal-account testing requirements apply, the closed-test gate is satisfied and production access is granted

## Phase 4: App Store Prep

Goal:

- be ready for TestFlight beta and then App Store review

Tasks:

- enroll in the Apple Developer Program if not already done
- create the App Store Connect prod app record
- create the App Store Connect QA app record
- upload a QA beta build to the QA app record
- use internal TestFlight for rapid iteration on the QA app first
- use external TestFlight later for broader milestone testing if needed
- prepare screenshots, support URL, privacy policy URL, app privacy answers, age rating, and review notes
- decide whether iOS Google sign-in is required for first public release or intentionally deferred
- submit the first App Store prod version only after QA TestFlight validation is solid

Current iOS-specific note:

- iOS Google sign-in now works locally, but first-release planning should still treat it as a deliberate product requirement rather than the default beta blocker

## Recommended Sequence

Use this order unless a higher-priority product decision changes things:

1. Keep Emily on TestFlight as the real-device validation lane
2. Finalize the QA/prod app identity split so side-by-side installs are a permanent part of the plan
3. Capture feedback from repeated real-device testing and label issues as blockers vs follow-ups
4. Finalize the public app name, QA app name, and icon approach
5. Finish privacy-policy, Data safety, and account-deletion readiness work
6. Prepare the QA app for TestFlight and Play internal testing
7. Prove the QA Play upload path after metadata is in place
8. Prepare the prod app for public store submission
9. Submit to stores only after the app identity and compliance work are settled

## Suggested Task Breakdown

Treat these as separate tasks so release prep does not collapse into one large thread:

1. Branding assets
   Deliverable: finalize the door-with-cross launcher/store visual system and update the generated app asset set without changing core in-app devotional functionality.
   Likely files: `assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash-icon.png`, `assets/favicon.png`.
   Source doc: `docs/mobile-branding-asset-spec.md`.
2. TestFlight blocker triage
   Deliverable: convert Emily's feedback into release blockers, important polish, and later follow-ups.
3. Mobile QA / prod environment split
   Deliverable: support a side-by-side-installable QA app and a separate production app, including app naming, bundle/package ids, scheme selection, backend URLs, Firebase config, and release labeling.
   Strategy doc: `docs/mobile-qa-prod-environment-strategy.md`.
4. Play Console setup decision
   Deliverable: choose personal vs organization and document any resulting testing gate.
5. Android release signing
   Deliverable: keep the real upload-key path documented, recoverable, and verified for future Play uploads.
6. Firebase / Google auth release alignment
   Deliverable: add the release signing fingerprints so production Google sign-in keeps working.
7. Store compliance readiness
   Deliverable: publish privacy-policy/support URLs, draft Data safety and app-content answers, and clear the first Play upload policy gate.
   Tracker: `docs/mobile-store-compliance-readiness-effort.md`.
8. Android permission and policy audit
   Deliverable: remove any unneeded permissions and prepare accurate Data safety / disclosure answers.
9. Account deletion readiness
   Deliverable: support the required deletion path in-app and outside the app if account creation remains part of the release.
10. Store listing metadata
   Deliverable: screenshots, support URL, privacy policy URL, category, age/content rating, review notes, and listing copy.
11. First Android store build
   Deliverable: produce and upload the first signed Android App Bundle.
12. First App Store submission pass
   Deliverable: move from internal TestFlight to a public-release-ready App Store Connect submission.

## Short-Term Next Actions

These are the most practical next actions from here:

1. Review Emily's TestFlight feedback and split it into release blockers, important polish, and later follow-ups.
2. Lock the app identity split: `Quiet Room` for prod and `Quiet Room QA` for the tester build.
3. Decide whether QA needs a subtle launcher/icon differentiator for side-by-side installs.
4. Decide whether the Play Console account should be personal or organization.
5. Publish the privacy policy URL and add it to both Play app records before retrying Android upload.
6. Work through the checklist in `docs/mobile-store-compliance-readiness-effort.md`.
7. Audit Android permissions plus privacy/account-deletion requirements before preparing the first store listing.
8. Treat TestFlight as the ongoing validation lane while finishing Play metadata and compliance work in parallel.

## Notes

This plan intentionally separates:

- private beta distribution
- public product identity work
- store submission work

That separation should keep momentum high and reduce the chance that store setup becomes the blocker for the next useful round of feedback.
