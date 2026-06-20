# QR-MOB-022 - App Store submission readiness audit

Verification time: 2026-06-19 23:32 CDT

Source of truth: App Store Connect API readback using the local API key in `/Users/mjreinig/projects/Gabriel_App/.local/app-store-connect.env`.

## Verified complete

- App: `Quiet Room`
- Bundle ID: `com.quietroom.mobile`
- App Store Connect app id: `6761866347`
- App Store version id: `36f439ae-f2f6-4140-babd-14cdc6ac48ea`
- Version string: `1.0`
- Version state: `WAITING_FOR_REVIEW`
- Release type: `AFTER_APPROVAL`
- Submission object: present, so the App Review package has been submitted.
- Attached build: build `30`, id `6dcf703d-72fc-4011-a9d2-374eaeec0a8f`
- Copyright: `2026 Quiet Room`
- Uses IDFA: `false`
- Screenshot localization: `en-US`, id `b1396952-779e-4893-9e63-d4f81ffd177e`
- Screenshot set: `APP_IPHONE_67`, id `ba57c157-f59b-4a9b-b14f-482b28d39bc7`
- Screenshot count: `5`; refreshed upload includes a normal post-consent conversation screenshot and a signed-in conversations/history pane screenshot.
- Required iPad screenshot set: `APP_IPAD_PRO_3GEN_129`, id `ad33cf8c-c159-4a33-9874-ae60fb0890cd`
- Required iPad screenshot count: `1`; uploaded screenshot id `cc461676-5f5c-446f-9fc0-adfd69d2bdfe`; local file `store-assets/ipad-pro-13/01-ipad-opening.png` verified at `2064x2752`.
- Listing fields are set for description, keywords, marketing URL, promotional text, and support URL.
- Support URL is set to `https://quiet-room-privacy-policy.vercel.app/support`
- Privacy policy URL is set to `https://quiet-room-privacy-policy.vercel.app/privacy`
- Reviewer notes are present and include privacy, support, account deletion, AI consent, login, and in-app policy link guidance.
- App Review contact fields are set.
- Primary category: `LIFESTYLE`
- Age-rating declaration is complete except optional/null fields `kidsAgeBand` and `developerAgeRatingInfoUrl`.
- Content Rights Information is set to `USES_THIRD_PARTY_CONTENT`.
- Pricing is set to free: base territory `USA`, one manual price using the USA `0.0` price point, with no start/end date.

## Readiness result

`npm run ios:appstore:readiness:status` reports `Version state: WAITING_FOR_REVIEW`, `Submission object: present`, and `Readiness gaps: none`.

The version is now waiting for Apple review.

App Store Connect's Add-for-Review checklist later surfaced four additional gates. The 13-inch iPad screenshot, Content Rights Information, and Pricing gates were cleared and verified by API readback. The App Store owner completed/published App Privacy and submitted the version for review.

## Build candidate note

The older QR-MOB-022 notes reference production iOS build `26`, but App Store Connect currently has newer valid production builds available. Build `30` is now attached to App Store version `1.0`:

- build `30`: id `6dcf703d-72fc-4011-a9d2-374eaeec0a8f`, `VALID`, uploaded `2026-06-18T20:25:44-07:00`, not expired, non-exempt encryption `false`

Prior rollout notes also identify build `30` as the QR-MOB-027 production hotfix upload.

## Recommended next steps

1. Monitor App Store Connect review status.
2. Respond to Apple if review requests follow-up.
