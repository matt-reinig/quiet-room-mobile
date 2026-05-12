# Mobile QA / Prod App Variant Progress

Status snapshot for the side-by-side QA/prod app effort in this worktree.

## Working Today

- The app has been split into two installable identities: `Quiet Room QA` and `Quiet Room`.
- The worktree includes the variant-specific local files needed to keep moving: `.env.qa`, `.env.local.qa`, `.env.prod`, `google-services.qa.json`, `google-services.prod.json`, `GoogleService-Info.qa.plist`, and `GoogleService-Info.prod.plist`.
- `app.config.js` now resolves app name, scheme, bundle id, package id, and Firebase file selection from `EXPO_PUBLIC_APP_VARIANT` and `EXPO_PUBLIC_RELEASE_ENV`.
- Google sign-in redirect handling now follows the active app scheme.
- `npm run mobile:verify:local-qa`, `npm run mobile:verify:qa`, and `npm run mobile:verify:prod` are wired and pass.
- `npm run native:sync:local-qa`, `npm run native:sync:qa`, and `npm run native:sync:prod` are wired.
- The regenerated iOS path is usable again because the Hermes dSYM plugin fix, Pod install step, and Xcode 26 `fmt` workaround are all carried into the sync flow.
- `npm run smoke:ios:qa` and `npm run smoke:ios:prod` now target a real prompt/response smoke on the iOS simulator lanes and are wired to use a release-style embedded-JS build instead of depending on Metro.
- `npm run smoke:android:local-qa`, `npm run smoke:android:qa`, and `npm run smoke:android:prod` exist for Android smoke proof, with `qa/local` intentionally routed to Android because the local backend overlay uses `10.0.2.2` and the smoke wrapper defaults to release-style Detox builds for cleaner env proof.
- The stale `QuietRoom_API_35` AVD has been removed, and the default Android smoke target is now `Pixel34AVD_2`.
- Android native regen now restores the Detox-specific post-prebuild pieces automatically: release instrumentation config, Detox Maven/dependencies, the generated `DetoxTest`, and the scoped Android network security config needed for local/test websocket traffic.
- `npm run smoke:android:local-qa` now passes on `Pixel34AVD_2` against the QA-configured local backend on `http://10.0.2.2:5000`, proving the local Android release-smoke path end to end.
- `npm run smoke:android:qa` now passes on `Pixel34AVD_2`, proving the QA Android release-smoke path end to end.
- `npm run smoke:android:prod` now passes on `Pixel34AVD_2`, proving the prod Android release-smoke path end to end.
- `npm run smoke:ios:qa` now passes on the iOS simulator, proving the QA iOS release-smoke path end to end.
- `npm run smoke:ios:prod` now passes on the iOS simulator, proving the prod iOS release-smoke path end to end.
- iOS TestFlight deploy helpers are now wired for both lanes: `npm run ios:testflight:deploy:qa` and `npm run ios:testflight:deploy:prod`.
- PROD iOS manual App Store signing is verified locally with profile `matt profile`, UUID `94fb0f32-2364-4562-a9cc-2cd898a99018`, for `SV7SPMY2Q8.com.quietroom.mobile`, including `com.apple.developer.applesignin = Default`.
- QA iOS manual App Store signing is verified locally with profile `matt profile qa`, UUID `a4879aba-247b-4795-8f04-23049307cbeb`, for `SV7SPMY2Q8.com.quietroom.mobile.qa`, including `com.apple.developer.applesignin = Default`.
- QA iOS TestFlight build `16` has been uploaded to App Store Connect with `npm run ios:testflight:deploy:qa`.

## Optional Follow-up Proof

- Google sign-in should still be checked in a real QA or prod flow if it is part of release scope.
- The baseline smoke proof is done, but a side-by-side manual install check on physical devices is still worth doing before store submission.
- Attach the processed QA build `16` to the intended internal TestFlight group once App Store Connect processing completes.

## Exact Commands

Use these as the current proof commands in this branch:

- `qa/local`
  - `npm run mobile:verify:local-qa`
  - `npm run smoke:android:local-qa`
- `qa/qa`
  - `npm run mobile:verify:qa`
  - `npm run smoke:ios:qa`
  - `npm run smoke:android:qa`
- `prod/prod`
  - `npm run mobile:verify:prod`
  - `npm run smoke:ios:prod`
  - `npm run smoke:android:prod`
- iOS TestFlight signing/deploy
  - `npm run ios:testflight:profile:qa`
  - `npm run ios:testflight:profile:prod`
  - `npm run ios:testflight:deploy:qa`
  - `npm run ios:testflight:deploy:prod`

The smoke evidence should capture:

- the selected app variant and release env
- the resolved bundle id / package id
- the backend base URL
- one successful end-to-end interaction

## External Setup Still Needed

- The Apple and Google Play QA / prod app records now exist.
- The next external work is tester groups / tracks, metadata, and submission readiness on those records.
- Prod store records should stay on `com.quietroom.mobile`.
- Prod and QA App Store signing are both verified repo-side against refreshed manual profiles that include Sign in with Apple.
- Any remaining store-side tester groups, release tracks, or metadata still have to be created or verified outside the repo.
- If Google sign-in or other Firebase-backed features are in scope, the matching console-side app settings still need to be kept aligned with the two app records.

## Current Status

- `qa/qa` config verification passes.
- `qa/local` config verification passes.
- `prod/prod` config verification passes.
- `npm run smoke:android:local-qa` passes on `Pixel34AVD_2` against the local backend.
- `npm run smoke:android:qa` passes on `Pixel34AVD_2`.
- `npm run smoke:android:prod` passes on `Pixel34AVD_2`.
- `npm run smoke:ios:qa` passes on the iOS simulator.
- `npm run smoke:ios:prod` passes on the iOS simulator.
- `npm run ios:testflight:profile:prod` passes with the refreshed Sign in with Apple-enabled App Store profile.
- `npm run ios:testflight:deploy:prod` uploaded `Quiet Room` build `14` to App Store Connect/TestFlight with manual profile `94fb0f32-2364-4562-a9cc-2cd898a99018`.
- `npm run ios:testflight:profile:qa` passes with refreshed manual profile `matt profile qa`, UUID `a4879aba-247b-4795-8f04-23049307cbeb`, for `SV7SPMY2Q8.com.quietroom.mobile.qa`.
- `npm run ios:testflight:deploy:qa` uploaded `Quiet Room QA` build `16` to App Store Connect/TestFlight with manual profile `a4879aba-247b-4795-8f04-23049307cbeb`.
- The scripted smoke definition is now a basic prompt/response flow rather than only a shell-render check.
- Repo-side variant/env plumbing, baseline smoke proof, shared iOS TestFlight deploy commands, and QA/prod iOS upload validation are complete.
