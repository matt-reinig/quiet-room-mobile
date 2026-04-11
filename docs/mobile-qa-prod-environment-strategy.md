# Mobile QA / Prod Environment Strategy

This doc defines the recommended environment and distribution strategy for `quiet-room-mobile` as we move from TestFlight-only QA into real App Store and Play Store releases.

This replaces the earlier recommendation to keep a single mobile app identity for both QA and prod.

## Handoff Update

What completed in this effort:

- we pivoted from a single mobile app identity to two installable identities: `Quiet Room` on `com.quietroom.mobile` and `Quiet Room QA` on `com.quietroom.mobile.qa`
- `app.config.js`, env selectors, native sync, and diagnostics now separate app identity from backend target
- the split is proven in practice rather than only planned: local/QA/prod verification is wired, Android smoke passed for `qa/local`, `qa/qa`, and `prod/prod`, and iOS smoke passed for `qa/qa` and `prod/prod`
- the four matching Apple / Play app records now exist, so the store identity side of the split is established too

What this means for handoff:

- the repo-side QA/prod app-variant effort is complete
- the next effort should be treated as distribution and launch-readiness work, not more variant-plumbing work
- remaining follow-up is mostly store-console, signing, tester-flow, metadata, and release-validation work

## Recommendation

Use **two app identities** from here forward so QA and prod can be installed side-by-side on the same device.

Recommended identities:

- prod app name: `Quiet Room`
- prod iOS bundle id: `com.quietroom.mobile`
- prod Android application id: `com.quietroom.mobile`
- prod URL scheme: `quietroommobile`
- QA app name: `Quiet Room QA`
- QA iOS bundle id: `com.quietroom.mobile.qa`
- QA Android application id: `com.quietroom.mobile.qa`
- QA URL scheme: `quietroommobileqa`

Recommended selectors:

- `EXPO_PUBLIC_APP_VARIANT=qa|prod`
- `EXPO_PUBLIC_RELEASE_ENV=local|qa|prod`

Use them for different purposes:

- `EXPO_PUBLIC_APP_VARIANT` chooses the app identity, launcher name, bundle id / package id, scheme, and variant-specific service files
- `EXPO_PUBLIC_RELEASE_ENV` chooses backend targets, diagnostics labeling, and preflight safety checks

## Why This Is The Right Pivot

Why this is a better fit now:

- it matches the web workflow where QA and prod are treated as intentionally separate surfaces
- it lets you keep the public production app installed while also testing QA builds on the same phone
- it makes tester behavior simpler because "use the QA app for testing" is clearer than "replace the prod app with a QA build"
- it reduces the chance of accidentally validating QA work against the wrong installed build
- it creates clean separation for Firebase registrations, OAuth clients, deep links, and future push notification routing
- it makes production feel more stable because the prod app can stay reserved for prod-candidate and public releases

Costs we are intentionally accepting:

- two App Store Connect app records instead of one
- two Play Console apps instead of one
- separate Firebase mobile app registrations for QA and prod
- separate OAuth / redirect / universal-link setup where required
- more release metadata to maintain across both app identities

For this project, that added setup is worth it because side-by-side install support is now a real requirement rather than a hypothetical later need.

## What This Means In Practice

### iOS

Use two separate iOS apps:

- QA lane: internal TestFlight on `Quiet Room QA`
- prod lane: TestFlight / App Store release candidates on `Quiet Room`

Important consequence:

- QA and prod can be installed at the same time on the same iPhone
- QA should live in its own App Store Connect record and should not be the public store app

### Android

Use two separate Android apps:

- QA lane: Play internal testing on `Quiet Room QA`
- prod lane: Play production path on `Quiet Room`

Important consequence:

- QA and prod can be installed at the same time on the same Android device
- Play Console should treat them as separate apps because they have different application ids

## Current Repo State

The current repo is already close to supporting this split, but it does not implement it yet.

What is already true:

- runtime env values are read from `process.env`
- `WEB_APP_URL` currently defaults to the QA frontend URL
- `app.config.js` already selects Google service config files from env variables
- the checked local Android Firebase file is already treated as optional and env-selectable

What still needs to change for the new strategy:

- `app.json` currently hardcodes a single app name: `Quiet Room`
- `app.json` currently hardcodes the prod bundle id: `com.quietroom.mobile`
- `app.json` currently hardcodes the prod Android package: `com.quietroom.mobile`
- `app.json` currently hardcodes a single scheme: `quietroommobile`
- there is no first-class `app variant` selector yet
- release scripts and preflight only think in terms of environment, not app identity

That means the repo foundation is good, but `app.config.js` needs to grow from "service-file selection" into "full variant selection."

## Build Matrix

Recommended build matrix:

| Build Type | App Variant | Release Env | Distribution | App Identity | Backend | Firebase |
| --- | --- | --- | --- | --- | --- | --- |
| Local dev | `qa` | `local` | simulator / emulator / local device | `com.quietroom.mobile.qa` | local backend | QA or local-dev Firebase config |
| QA beta iOS | `qa` | `qa` | internal TestFlight | `com.quietroom.mobile.qa` | QA backend | QA Firebase |
| QA beta Android | `qa` | `qa` | Play internal testing | `com.quietroom.mobile.qa` | QA backend | QA Firebase |
| Prod candidate iOS | `prod` | `prod` | TestFlight / App Store submission | `com.quietroom.mobile` | prod backend | prod Firebase |
| Prod candidate Android | `prod` | `prod` | Play production-ready build | `com.quietroom.mobile` | prod backend | prod Firebase |

Recommended default developer posture:

- use the QA app variant for day-to-day development and tester distribution
- reserve the prod app variant for deliberate release-candidate validation and public release work

## Configuration Model

### 1. Introduce An Explicit App Variant

Add a variant selector alongside the release env:

```env
EXPO_PUBLIC_APP_VARIANT=qa
EXPO_PUBLIC_RELEASE_ENV=qa
```

Allowed values:

- app variant: `qa`, `prod`
- release env: `local`, `qa`, `prod`

Recommended behavior:

- `qa` variant can be paired with `local` or `qa`
- `prod` variant should normally only be paired with `prod`

### 2. Drive App Identity From The Variant In `app.config.js`

Move these fields out of hardcoded `app.json` values and compute them in `app.config.js`:

- app name
- iOS bundle identifier
- Android application id
- scheme
- variant-specific icon or badge if we decide QA should look different on the launcher

Recommended mapping:

- prod variant -> `Quiet Room`, `com.quietroom.mobile`, `quietroommobile`
- QA variant -> `Quiet Room QA`, `com.quietroom.mobile.qa`, `quietroommobileqa`

Optional but useful later:

- give the QA launcher icon a subtle visual differentiator so testers can identify it instantly

### 3. Keep Backend URLs Explicit

Do not infer QA or prod from build type alone.

Keep these explicit per release env:

- `EXPO_PUBLIC_API_BASE`
- `EXPO_PUBLIC_STREAMING_BASE`
- `EXPO_PUBLIC_WEB_APP_URL`

This keeps the app identity decision separate from the backend-target decision.

### 4. Split Firebase And OAuth By App Variant

Firebase mobile app registrations must match the bundle id / application id, so service files should be keyed by variant rather than by release env.

Recommended local files:

- `google-services.qa.json`
- `google-services.prod.json`
- `GoogleService-Info.qa.plist`
- `GoogleService-Info.prod.plist`

Then select them through env variables already supported by `app.config.js`:

- `EXPO_PUBLIC_GOOGLE_SERVICES_FILE`
- `EXPO_PUBLIC_IOS_GOOGLE_SERVICES_FILE`

Also expect separate setup for related identity-bound integrations:

- Google sign-in client ids
- Apple sign-in / associated domains as needed
- Firebase app registrations
- deep link / universal link routing
- push notification credentials if introduced later

### 5. Show Both Variant And Release Env Inside The App

Once two apps exist, testers need quick confirmation of both identity and backend.

Recommended visibility:

- show current app variant in diagnostics / settings
- show current release env in diagnostics / settings
- optionally include API host and Firebase project id
- optionally include a subtle QA-only badge in non-public diagnostics screens

### 6. Add Stronger Preflight Rules

When bundle ids and backends can vary independently, preflight needs to validate both.

Recommended checks:

1. Print the selected app variant and release env before every release build.
2. Fail if the `qa` variant is not using the QA bundle id / application id / scheme.
3. Fail if the `prod` variant is not using the prod bundle id / application id / scheme.
4. Fail if the `prod` variant points at QA backend URLs.
5. Fail if the selected variant's Firebase service file does not match the expected mobile app registration.
6. Include the intended variant and env in QA release notes.

## Transition Plan From Current State

The safest migration path is:

1. Keep `com.quietroom.mobile` reserved as the production identity.
2. Create new QA identities:
   - iOS: `com.quietroom.mobile.qa`
   - Android: `com.quietroom.mobile.qa`
3. Create new QA store records:
   - App Store Connect app record for `Quiet Room QA`
   - Play Console app for `Quiet Room QA`
4. Create QA Firebase registrations and service files that match the new ids.
5. Teach `app.config.js` and scripts to build the QA app variant.
6. Let Emily stay on the current TestFlight build until the QA variant exists.
7. Move Emily and future testers onto the new QA app once the first side-by-side installable build is ready.
8. After that migration, keep the prod app variant for prod-candidate validation and public release only.

This avoids disturbing the existing prod-shaped identifiers while still giving QA its own permanent home.

## Local Secret And Env File Layout

Keep secrets and service files untracked, but standardize naming around the new split.

Recommended local files:

- `.env.local.qa`
- `.env.qa`
- `.env.prod`
- `google-services.qa.json`
- `google-services.prod.json`
- `GoogleService-Info.qa.plist`
- `GoogleService-Info.prod.plist`

Recommended committed templates:

- `.env.local.qa.example`
- `.env.qa.example`
- `.env.prod.example`

The repo should provide scripts that load the chosen env and variant before building, rather than requiring manual edits.

## Recommended Build Scripts

Add simple explicit scripts later such as:

- `npm run mobile:variant:qa`
- `npm run mobile:variant:prod`
- `npm run mobile:env:qa`
- `npm run mobile:env:prod`
- `npm run ios:testflight:qa`
- `npm run ios:testflight:prod`
- `npm run android:internal:qa`
- `npm run android:bundle:prod`

These do not need to be fancy.

Their main job is to:

- load the right env file
- set the right app variant
- select the right Firebase service files
- print the chosen variant and env clearly before build
- fail fast if required variables are missing or mismatched

## Distribution Strategy

### iOS QA

Use internal TestFlight for QA:

- build with `EXPO_PUBLIC_APP_VARIANT=qa`
- build with `EXPO_PUBLIC_RELEASE_ENV=qa`
- point at QA backend and QA Firebase
- distribute through the QA App Store Connect record

### iOS Prod

Use the prod bundle id for production:

- build with `EXPO_PUBLIC_APP_VARIANT=prod`
- build with `EXPO_PUBLIC_RELEASE_ENV=prod`
- point at prod backend and prod Firebase
- upload through the public App Store Connect record

### Android QA

Use Play internal testing for the QA app:

- build with `EXPO_PUBLIC_APP_VARIANT=qa`
- build with `EXPO_PUBLIC_RELEASE_ENV=qa`
- point at QA backend and QA Firebase
- upload to the QA Play Console app

### Android Prod

Use the prod application id for production:

- build with `EXPO_PUBLIC_APP_VARIANT=prod`
- build with `EXPO_PUBLIC_RELEASE_ENV=prod`
- point at prod backend and prod Firebase
- upload to the prod Play Console app

## Implementation Plan

Recommended order:

1. Add `EXPO_PUBLIC_APP_VARIANT` and keep `EXPO_PUBLIC_RELEASE_ENV`.
2. Extend `app.config.js` to compute app name, ids, scheme, and service files from the chosen variant.
3. Add `.env.local.qa` / `.env.qa` / `.env.prod` conventions plus example files.
4. Add QA/prod preflight scripts that verify variant, ids, API base, web URL, Firebase project, and service files.
5. Create QA Firebase app registrations and matching local service-file naming.
6. Create the QA App Store Connect record and QA Play Console app.
7. Move Emily onto the new QA app once the first side-by-side installable build is ready.
8. Keep prod builds reserved for release-candidate and public-release use.

## Recommended Decision

For this repo, the recommended decision is:

- **yes** to a deliberate QA/prod environment split
- **yes** to a deliberate QA/prod app-identity split now
- **yes** to using TestFlight as the iOS QA lane for the QA app
- **yes** to using Play internal testing as the Android QA lane for the QA app
- **yes** to reserving the prod app identity for prod-only builds
- **no** to continuing with a single app identity for both lanes

That gives us the workflow you actually want: two different apps on the same device, with QA and prod behaving like intentionally separate products.
