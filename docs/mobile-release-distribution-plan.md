# Mobile Release And Distribution Plan

This plan is for the next distribution milestones after local mobile bring-up.

Current priority:

1. Get Emily on a beta build
2. Finalize the app identity for public release
3. Prepare Google Play release
4. Prepare App Store / TestFlight release

Confirmed current tester detail:

- Emily is on iPhone
- the preferred rapid-iteration path should therefore be internal TestFlight

## Why Emily Beta Comes First

This is the fastest path to real user validation without blocking on store paperwork.

Why it comes before store submission:

- it gets the app onto a real non-dev phone quickly
- it validates onboarding, chat, layout, auth, and general feel outside the emulator/simulator
- it helps confirm what still feels unfinished before store screenshots, copy, and review metadata are prepared
- it avoids turning Play Store / App Store setup into the critical path too early

## Current Project State

The app is already far enough along that release planning can focus on distribution and polish rather than basic mobile bring-up.

What is already true:

- Android package id is `com.quietroom.mobile`
- iOS bundle id is `com.quietroom.mobile`
- icon asset paths are already wired in Expo config
- Android emulator bring-up is working on this Mac
- iOS simulator bring-up is working on this Mac
- local mobile docs already include an Android phone APK workflow

Important current gaps:

- Android release builds are still signed with the debug keystore
- account deletion flow is not yet implemented
- privacy policy / store disclosure work is not yet fully prepared

## Phase 1: Get Emily On A Beta Build

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

## Phase 2: Finalize Public App Identity

Goal:

- get the app ready to look like a real public product instead of an internal mobile project

Tasks:

- final public app name is `Quiet Room`
- finalize the app icon artwork
- confirm splash and adaptive icon assets still look correct after final art is chosen

Why this phase should happen before store submission:

- screenshots, listings, and TestFlight invites should reflect the real product identity
- changing core branding late creates churn across both stores

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

- Android package id is already `com.quietroom.mobile`
- `google-services.json` is already wired into Expo/native Android config when present locally
- there is already a local release APK workflow in `docs/mobile-apk-phone-workflow.md`
- there is no `eas.json`, so the clearest current store-build path is the native Android/Gradle project rather than an EAS-managed Play submission flow
- `android/app/build.gradle` still signs release builds with the debug keystore
- Android versioning is still at `versionCode 1` / `versionName 1.0.0`
- the visible Android app name is still `quiet-room-mobile`
- the manifest still declares sensitive-or-review-worthy permissions that should be audited for production, including `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`
- privacy policy, Data safety responses, and account deletion support are not yet release-ready

Concrete work order:

1. Decide whether the Play Console account should be personal or organization before any store setup begins.
2. Create or confirm the Play Console account and complete developer verification.
3. If the account is a new personal account, plan for device verification and the 12-tester / 14-day closed-testing gate up front.
4. Finalize the public app name and icon before taking Play screenshots or writing listing copy.
5. Create a real Android release keystore and wire release signing so `release` no longer uses the debug keystore.
6. Export the release SHA fingerprints and update Firebase / Google Cloud so Google sign-in still works once the signing key changes.
7. Audit Android permissions and remove anything not genuinely needed for the first public release.
8. Increment Android `versionCode` / `versionName` and verify the first release bundle targets the current required API level.
9. Build an Android App Bundle for release and enroll in Play App Signing during the first upload flow.
10. Prepare listing copy, screenshots, category, content rating, app content declarations, support contact details, and privacy policy URL.
11. If email/password signup remains available, ship or document the required account deletion flow both in-app and on the web.
12. Use internal testing first, then closed testing as needed, and only move to production after the policy and testing gates are satisfied.

Repo-specific blockers to close before first upload:

- release signing is not production-ready yet
- the public app identity is not final yet
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
- create the App Store Connect app record
- upload a beta build
- use internal TestFlight for rapid iteration first
- use external TestFlight later for broader milestone testing if needed
- prepare screenshots, support URL, privacy policy URL, app privacy answers, age rating, and review notes
- decide whether iOS Google sign-in is required for first public release or intentionally deferred
- submit the first App Store version only after TestFlight validation is solid

Current iOS-specific note:

- iOS Google sign-in now works locally, but first-release planning should still treat it as a deliberate product requirement rather than the default beta blocker

## Recommended Sequence

Use this order unless a higher-priority product decision changes things:

1. Get Emily onto internal TestFlight
2. Capture feedback from repeated real-device testing
3. Finalize the public app name and icon
4. Add privacy-policy and account-deletion readiness work
5. Prepare Google Play internal testing
6. Prepare external TestFlight / App Store milestone readiness
7. Submit to stores only after the app identity and compliance work are settled

## Short-Term Next Actions

These are the most practical next actions from here:

1. Move directly into a TestFlight path for Emily.
2. Create and upload the first iOS beta build.
3. Add Emily as a tester and verify install on her phone.
4. Decide on the final public app name.
5. Decide whether the Play Console account should be personal or organization.
6. Create the Android release keystore plan before any Play upload work starts.
7. Audit Android permissions plus privacy/account-deletion requirements before preparing the first store listing.

## Notes

This plan intentionally separates:

- private beta distribution
- public product identity work
- store submission work

That separation should keep momentum high and reduce the chance that store setup becomes the blocker for the next useful round of feedback.
