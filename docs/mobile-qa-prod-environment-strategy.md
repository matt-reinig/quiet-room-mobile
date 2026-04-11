# Mobile QA / Prod Environment Strategy

This doc defines the recommended environment and distribution strategy for `quiet-room-mobile` as we move from TestFlight-only QA into real App Store and Play Store releases.

## Recommendation

Use a **single public app identity** first:

- iOS bundle id: `com.quietroom.mobile`
- Android application id: `com.quietroom.mobile`

Then split **distribution track** and **backend environment** rather than creating a second QA app immediately.

That means:

- iOS QA uses internal TestFlight
- iOS prod uses the same App Store app record and same bundle id
- Android QA uses Google Play internal testing
- Android prod uses the same Play Console app and same application id

Recommended release env names:

- `local`
- `qa`
- `prod`

## Why This Is The Right First Step

This repo is not yet set up for a clean QA/prod split, but it is already close enough that an env-driven strategy is much lower risk than introducing a second mobile app identity.

Why we should start this way:

- it keeps App Store Connect and Play Console simpler
- it avoids maintaining separate QA and prod app records immediately
- it avoids duplicating bundle ids, package ids, Firebase app registrations, screenshots, and listing metadata
- it matches how TestFlight and Play internal testing are commonly used for pre-release validation
- it still gives us a clean path to move QA testers onto production later

## What This Means In Practice

### iOS

Use one app identity with two release lanes:

- `qa` lane: internal TestFlight builds that point at QA services
- `prod` lane: App Store release candidates and final production releases that point at prod services

Important consequence:

- the QA build and the App Store build will not be separate side-by-side apps on the same phone
- they are different builds of the same app identity

This is acceptable for the current phase because Emily is already using TestFlight as the QA lane.

### Android

Use the same application id with Play tracks:

- `qa` lane: Play internal testing
- optional broader beta lane: Play closed testing
- `prod` lane: Play production

Important consequence:

- Android QA and prod also will not be separate side-by-side apps if they share the same application id

This is the closest equivalent to the current TestFlight flow.

## When To Introduce A Separate QA App

Do **not** start with a separate QA app unless one of these becomes necessary:

- you need QA and prod installed side-by-side on the same device
- you need QA-only push notifications, OAuth clients, or deep links that cannot share identity cleanly
- you need internal users to test QA while keeping a stable public version installed at the same time
- TestFlight / Play internal testing becomes too limiting for your workflow

If that later becomes necessary, the QA app should use:

- iOS bundle id: `com.quietroom.mobile.qa`
- Android application id: `com.quietroom.mobile.qa`
- visible name: `Quiet Room QA`

That should be treated as a later phase because it creates extra store and Firebase overhead.

## Current Repo State

The current mobile repo is effectively QA-first:

- runtime env values are read from `process.env`
- `WEB_APP_URL` currently defaults to the QA frontend URL
- the checked local Android Firebase file currently points at the QA Firebase project
- service config files are already selected through env variables in `app.config.js`

This is a good base for an env split because we do not need to redesign the app architecture first.

## Build Matrix

Recommended build matrix:

| Build Type | Release Env | Distribution | App Identity | Backend | Firebase |
| --- | --- | --- | --- | --- | --- |
| Local dev | `local` | local run / simulator / emulator | `com.quietroom.mobile` | local backend | QA-aligned or local dev config |
| QA beta iOS | `qa` | internal TestFlight | `com.quietroom.mobile` | QA backend | QA Firebase |
| QA beta Android | `qa` | Play internal testing | `com.quietroom.mobile` | QA backend | QA Firebase |
| Prod candidate iOS | `prod` | TestFlight / App Store submission | `com.quietroom.mobile` | prod backend | prod Firebase |
| Prod candidate Android | `prod` | Play production-ready build | `com.quietroom.mobile` | prod backend | prod Firebase |

## Configuration Model

### 1. Introduce An Explicit Public Release Env

Add a single public env selector:

```env
EXPO_PUBLIC_RELEASE_ENV=qa
```

Allowed values:

- `local`
- `qa`
- `prod`

This should become the canonical runtime label shown in diagnostics and used by preflight checks.

### 2. Keep Backend URLs Explicit

Do not infer QA or prod from build type alone.

Keep these explicit per environment:

- `EXPO_PUBLIC_API_BASE`
- `EXPO_PUBLIC_STREAMING_BASE`
- `EXPO_PUBLIC_WEB_APP_URL`

This makes it much harder to ship a prod build that still points at QA by accident.

### 3. Split Firebase Config By Environment

Keep separate local untracked service config files for QA and prod:

- `google-services.qa.json`
- `google-services.prod.json`
- `GoogleService-Info.qa.plist`
- `GoogleService-Info.prod.plist`

Then select them through env variables already supported by `app.config.js`:

- `EXPO_PUBLIC_GOOGLE_SERVICES_FILE`
- `EXPO_PUBLIC_IOS_GOOGLE_SERVICES_FILE`

### 4. Keep One App Identity For Now

For the recommended first phase:

- app name remains `Quiet Room`
- iOS bundle id remains `com.quietroom.mobile`
- Android application id remains `com.quietroom.mobile`

Do not append `QA` to the public app name unless we intentionally switch to a separate QA app identity later.

### 5. Add In-App Environment Visibility

QA and prod builds should be visibly distinguishable somewhere inside the app, but not through a second app identity.

Recommended visibility:

- show current release env in a diagnostics / settings screen
- optionally include the API host and Firebase project id in that diagnostics area
- optionally show a subtle QA-only badge in a non-public diagnostics area if testers need a quick check

Do not make the public launcher name or icon environment-specific in phase 1.

## Local Secret And Env File Layout

Keep secrets and service files untracked, but standardize naming.

Recommended local files:

- `.env.local`
- `.env.qa`
- `.env.prod`
- `google-services.qa.json`
- `google-services.prod.json`
- `GoogleService-Info.qa.plist`
- `GoogleService-Info.prod.plist`

Recommended committed templates:

- `.env.example`
- `.env.qa.example`
- `.env.prod.example`

The repo should provide scripts that copy or load the chosen env before building, rather than requiring manual edits to `.env`.

## Recommended Build Scripts

Add simple explicit scripts later such as:

- `npm run mobile:env:qa`
- `npm run mobile:env:prod`
- `npm run ios:testflight:qa`
- `npm run ios:testflight:prod`
- `npm run android:build:qa`
- `npm run android:build:prod`

These do not need to be fancy.

Their main job is to:

- load the right env file
- select the right Firebase service files
- print the chosen env clearly before build
- fail fast if required variables are missing

## Distribution Strategy

### iOS QA

Use internal TestFlight for QA:

- build with `EXPO_PUBLIC_RELEASE_ENV=qa`
- point at QA backend and QA Firebase
- distribute through internal TestFlight

### iOS Prod

Use the same bundle id for production:

- build with `EXPO_PUBLIC_RELEASE_ENV=prod`
- point at prod backend and prod Firebase
- upload through the same App Store Connect app record

### Android QA

Use Play internal testing:

- build with `EXPO_PUBLIC_RELEASE_ENV=qa`
- point at QA backend and QA Firebase
- upload to the Play internal testing track

### Android Prod

Use the same application id for production:

- build with `EXPO_PUBLIC_RELEASE_ENV=prod`
- point at prod backend and prod Firebase
- upload to the production path in Play Console

## Safety Rules

To keep QA and prod from getting mixed up, add these rules:

1. Every release build must print the selected release env during preflight.
2. Preflight must fail if `prod` is selected but placeholder URLs or QA Firebase config are still in use.
3. Preflight must fail if `qa` is selected but prod endpoints are wired accidentally.
4. iOS and Android release notes should include the intended env during QA distribution.
5. The app should expose the active env and backend host somewhere visible to testers.

## Implementation Plan

Recommended order:

1. Add `EXPO_PUBLIC_RELEASE_ENV` and diagnostics display.
2. Add `.env.qa` / `.env.prod` conventions plus example files.
3. Add QA/prod service config file naming conventions.
4. Extend `app.config.js` and release scripts to select env-specific service files.
5. Add QA/prod preflight scripts that verify API base, web URL, Firebase project, and service files.
6. Add Android Play internal testing as the QA Android lane.
7. Only consider a second QA app identity if the side-by-side install need becomes real.

## Recommended Decision

For this repo, the recommended decision is:

- **yes** to a deliberate QA/prod environment split
- **yes** to using TestFlight as the iOS QA lane
- **yes** to using Play internal testing as the Android QA lane
- **no** to creating a second QA app identity right now

That gives us the smallest change set with the highest release payoff.
