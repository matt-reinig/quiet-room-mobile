# QR-MOB-022 - Screenshot plan

## Goal

Capture the production-branded release-facing screenshots and keep the filenames readable enough to use later in App Store prep notes or a handoff.

## Existing asset bundle

The earlier Play Store listing worktree already contains a ready-made bundle at:

- `../quiet-room-mobile-play-store-listing/store-assets/`

Contents:

- `phone/01-landing.png`
- `phone/02-conversation.png`
- `phone/03-about.png`
- `phone/04-login.png`
- `phone/05-atmosphere.png`
- `app-icon-512.png`
- `feature-graphic.png`
- `listing-metadata.md`

The bundle README says the conversation screenshot is a real QA capture and notes that it was a first-pass asset. The current uploaded pack is acceptable as a temporary handoff set, but it should be refreshed before final App Review submission if time allows.

## Screenshot set

Recommended refreshed set:

1. Home or opening screen with production branding
2. Normal conversation flow after AI consent has already been accepted
3. Conversations pane/history view
4. Atmosphere or reflection controls
5. Report response or support/safety affordance
6. Sign-in/account screen if a sixth screenshot is useful

## Capture rules

- Use the production app variant and production release environment.
- Keep the screenshots free of build/debug details.
- Prefer the production branding and the real app UI over any marketing mockup.
- Capture the modal or screen in a settled state before taking the shot.
- Do not make the AI consent modal a primary public listing screenshot; keep that proof in reviewer notes unless Apple specifically asks for it.
- Name captures consistently with the QR-MOB-022 task so they are easy to sort later.

## Suggested filenames

- `qr-mob-022-prod-home`
- `qr-mob-022-prod-normal-conversation`
- `qr-mob-022-prod-conversations-pane`
- `qr-mob-022-prod-atmosphere`
- `qr-mob-022-prod-report-response`
- `qr-mob-022-prod-sign-in`

## Current status

- Screenshot upload is complete and no longer blocks App Store Connect setup work.
- The App Store Connect `APP_IPHONE_67` set was refreshed on 2026-06-19 with five `1290x2796` screenshots:
  - `01-landing.png`
  - `02-conversation.png`
  - `03-conversations-history.png`
  - `04-atmosphere.png`
  - `05-report-response.png`
- The refreshed set includes the required normal post-consent conversation flow and conversations pane/history view.
- Readback with `npm run ios:appstore:screenshots:status` confirms screenshot set `ba57c157-f59b-4a9b-b14f-482b28d39bc7` contains `5` screenshots for `APP_IPHONE_67`.
- App Store Connect later required a 13-inch iPad screenshot before Add for Review. A production release-simulator screenshot was captured from an iPad Pro 13-inch simulator and uploaded as display type `APP_IPAD_PRO_3GEN_129`.
- Local iPad file: `store-assets/ipad-pro-13/01-ipad-opening.png`.
- Local size verification: `2064x2752`.
- App Store Connect readback confirms screenshot set `ad33cf8c-c159-4a33-9874-ae60fb0890cd` contains `1` screenshot for `APP_IPAD_PRO_3GEN_129`; uploaded screenshot id `cc461676-5f5c-446f-9fc0-adfd69d2bdfe`.
