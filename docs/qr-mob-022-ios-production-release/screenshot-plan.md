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

The bundle README says the conversation screenshot is a real QA capture and notes that it was a first-pass asset, but the current pack is good enough to serve as the handoff set without mandatory recapture.

## Screenshot set

Recommended first pass:

1. Home screen
2. About modal with privacy/support/account-deletion links
3. AI consent modal
4. iOS sign-in sheet with Sign in with Apple visible
5. Report response modal
6. Delete account confirmation modal

## Capture rules

- Use the production app variant and production release environment.
- Keep the screenshots free of build/debug details.
- Prefer the production branding and the real app UI over any marketing mockup.
- Capture the modal or screen in a settled state before taking the shot.
- Name captures consistently with the QR-MOB-022 task so they are easy to sort later.

## Suggested filenames

- `qr-mob-022-prod-home`
- `qr-mob-022-prod-about-links`
- `qr-mob-022-prod-ai-consent`
- `qr-mob-022-prod-ios-login`
- `qr-mob-022-prod-report-response`
- `qr-mob-022-prod-delete-account`

## Current status

- Screenshot capture is no longer a blocker.
- The current release candidate, reviewer notes, and the existing `store-assets` bundle form the handoff set for the final store package.
