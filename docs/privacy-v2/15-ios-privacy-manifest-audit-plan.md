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

## Audit Result - April 23, 2026

Status: complete for the current local QA iOS release-candidate path.

### App-level answer

Yes. Quiet Room needs an app-level privacy manifest. Apple privacy manifests describe data collected by the app and required-reason API usage, and Quiet Room collects account identifiers, user content, support/reporting content, interaction metadata, and operational diagnostics. The app also ships React Native/CocoaPods native code that uses required-reason API categories.

The tracked source of truth is `expo.ios.privacyManifests` in `app.json`. Expo prebuild writes that into `ios/QuietRoomQA/PrivacyInfo.xcprivacy`, and React Native's CocoaPods privacy-manifest aggregation appends required-reason API declarations during `pod install`. The generated `ios/` tree is intentionally not the persistent source because it is ignored in this repo.

### Reviewed shipped iOS dependencies/APIs

Reviewed the current iOS dependency set from `package.json`, `ios/Podfile`, `ios/Podfile.lock`, the generated `ios/Pods` privacy resources, and app source usage:

- Expo SDK `~54.0.33` and React Native `0.81.5`
- `@react-native-async-storage/async-storage` / `RNCAsyncStorage`
- `@react-native-google-signin/google-signin`, `GoogleSignIn 9.1.0`, `AppAuth 2.0.0`, `GTMAppAuth 5.0.0`, `GTMSessionFetcher 3.5.0`, `GoogleUtilities 8.1.0`, `PromisesObjC 2.4.0`, and `AppCheckCore 11.2.0`
- Expo modules used by the app, including Apple authentication, auth session/web browser, file system, AV playback, clipboard, crypto, constants, application, linking, splash screen, and related Expo modules
- `react-native-webview`
- Firebase JS SDK usage for authentication in `src/lib/firebase.ts`
- App data flows from the privacy inventory/policy: account identity, auth identifiers, conversation/profile/memory content, support/report content, conversation/model/consent metadata, performance data, and error/operational diagnostics

SDK privacy resources found in the generated iOS dependency tree include AppAuth, GTMAppAuth, GTMSessionFetcher, GoogleSignIn, GoogleUtilities, PromisesObjC, React Native core/cxxreact, Expo Application, Expo Constants, Expo FileSystem, and RNCAsyncStorage.

### Manifest declarations

`app.json` now declares `NSPrivacyTracking: false` and no tracking domains. It declares these linked, non-tracking collected data types:

- `NSPrivacyCollectedDataTypeName`
- `NSPrivacyCollectedDataTypeEmailAddress`
- `NSPrivacyCollectedDataTypeUserID`
- `NSPrivacyCollectedDataTypeSensitiveInfo`
- `NSPrivacyCollectedDataTypeOtherUserContent`
- `NSPrivacyCollectedDataTypeCustomerSupport`
- `NSPrivacyCollectedDataTypeProductInteraction`
- `NSPrivacyCollectedDataTypePerformanceData`
- `NSPrivacyCollectedDataTypeOtherDiagnosticData`

The app-level purposes are App Functionality for all declared data types, with Product Personalization also declared for sensitive info, other user content, and product interaction data because conversation/memory/profile context is used to personalize the in-app experience.

React Native/CocoaPods aggregation appends the required-reason API categories in the generated app manifest:

- `NSPrivacyAccessedAPICategoryFileTimestamp`: `C617.1`, `0A2A.1`, `3B52.1`
- `NSPrivacyAccessedAPICategoryUserDefaults`: `CA92.1`, `C56D.1`
- `NSPrivacyAccessedAPICategoryDiskSpace`: `E174.1`, `85F4.1`
- `NSPrivacyAccessedAPICategorySystemBootTime`: `35F9.1`

### Verification

- `npm run native:sync:qa -- ios` completed successfully. CocoaPods logged privacy-manifest aggregation and appended the required-reason APIs to the generated app manifest.
- `plutil -lint ios/QuietRoomQA/PrivacyInfo.xcprivacy` returned `OK`.
- `ios/QuietRoomQA.xcodeproj/project.pbxproj` includes `PrivacyInfo.xcprivacy in Resources`, so the generated app manifest is included in the QuietRoomQA target.
- `npm run ios:testflight:preflight:qa` passed with no blocking failures.
- `npm run detox:build:ios:qa` completed successfully and produced `ios/build/Build/Products/Release-iphonesimulator/QuietRoomQA.app`.
- `plutil -lint ios/build/Build/Products/Release-iphonesimulator/QuietRoomQA.app/PrivacyInfo.xcprivacy` returned `OK`.
- The built app bundle contains the app-level `PrivacyInfo.xcprivacy` plus dependency privacy bundles for Google/Auth, Expo, React Native, PromisesObjC, and RNCAsyncStorage.

### Correctness explanation

The app-level manifest is required because the app itself collects data types covered by Apple's privacy manifest schema; dependency manifests alone do not describe Quiet Room's own account, content, support, interaction, and diagnostics data collection. The implementation is correct for this Expo-managed native flow because the persistent declarations live in tracked Expo config, prebuild generates the app target manifest, CocoaPods/React Native aggregation adds required-reason API declarations, and the release simulator artifact contains a valid packaged manifest.

---

## Definition Of Done

- Quiet Room has a documented yes/no answer on app-level privacy-manifest requirements
- the shipped iOS dependency/API set has been reviewed for privacy-manifest relevance
- `PrivacyInfo.xcprivacy` has been added and wired correctly if needed
- the iOS release candidate reflects the final manifest decision
- App Store submission readiness is improved by removing uncertainty around privacy-manifest compliance
