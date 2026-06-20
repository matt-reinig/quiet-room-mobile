# QR-MOB-022 - App Store submission readiness audit

Verification time: 2026-06-19 22:08 CDT

Source of truth: App Store Connect API readback using the local API key in `/Users/mjreinig/projects/Gabriel_App/.local/app-store-connect.env`.

## Verified complete

- App: `Quiet Room`
- Bundle ID: `com.quietroom.mobile`
- App Store Connect app id: `6761866347`
- App Store version id: `36f439ae-f2f6-4140-babd-14cdc6ac48ea`
- Version string: `1.0`
- Version state: `PREPARE_FOR_SUBMISSION`
- Release type: `AFTER_APPROVAL`
- Submission object: not found, so no App Review submission has been created.
- Screenshot localization: `en-US`, id `b1396952-779e-4893-9e63-d4f81ffd177e`
- Screenshot set: `APP_IPHONE_67`, id `ba57c157-f59b-4a9b-b14f-482b28d39bc7`
- Screenshot count: `5`
- Support URL is set to `https://quiet-room-privacy-policy.vercel.app/support`
- Privacy policy URL is set to `https://quiet-room-privacy-policy.vercel.app/privacy`
- Reviewer notes are present and include privacy, support, account deletion, AI consent, login, and in-app policy link guidance.

## Not ready yet

Screenshots are not the final blocker. The same API readback showed these submission-readiness gaps:

- No build is attached to App Store version `1.0`; the build relationship returned `null`.
- Version copyright is `null`.
- Listing localization fields are unset: `description`, `keywords`, `marketingUrl`, `promotionalText`, and `whatsNew`.
- App review contact fields are unset: `contactFirstName`, `contactLastName`, `contactPhone`, and `contactEmail`.
- Age rating declaration answers are unset. Most questionnaire fields returned `null`; only override fields returned `NONE`.
- Primary category relationship returned `null`.

## Build candidate note

The older QR-MOB-022 notes reference production iOS build `26`, but App Store Connect currently has newer valid production builds available. The latest valid build readback is:

- build `30`: id `6dcf703d-72fc-4011-a9d2-374eaeec0a8f`, `VALID`, uploaded `2026-06-18T20:25:44-07:00`, not expired, non-exempt encryption `false`

Prior rollout notes also identify build `30` as the QR-MOB-027 production hotfix upload. Before submission, attach the intended build deliberately, likely build `30` if the hotfix is meant to be part of the first App Store submission.

## Recommended next steps

1. Attach the intended valid build to version `1.0`.
2. Fill the App Store listing fields from the existing store metadata where appropriate.
3. Fill the App Review contact fields with the App Store owner contact.
4. Complete the age-rating questionnaire and primary category.
5. Rerun App Store Connect API readback and UI review.
6. Stop before pressing the final App Review submission action.
