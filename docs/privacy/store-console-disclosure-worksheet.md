# Quiet Room Store Console Disclosure Worksheet

Last updated: April 22, 2026

Use this worksheet as the copy/paste source for Play Console and App Store
Connect privacy/review fields. It is based on `docs/privacy/data-inventory.md`,
the production privacy site, current mobile app entry points, and the completed
Android permission audit.

## Truth Set Status

Stable enough for final store answers: **Yes**, with one release-candidate
verification note.

The public URLs, data inventory, AI-consent behavior, account-deletion behavior,
iOS Apple sign-in behavior, Android permission outcome, and current iOS privacy
manifest file are all documented in the repository. Before final Apple upload,
rerun the production native sync/build path and confirm the production iOS target
still includes the generated `PrivacyInfo.xcprivacy`; the current generated
native project is the QA target and includes the manifest in target resources.

## Public URLs

- Privacy policy URL: `https://quiet-room-privacy-policy.vercel.app/privacy`
- Support URL: `https://quiet-room-privacy-policy.vercel.app/support`
- Account deletion URL: `https://quiet-room-privacy-policy.vercel.app/account-deletion`
- In-app deletion path: open Quiet Room, tap the profile icon, choose `Delete Account`, then confirm.
- In-app policy links: open Quiet Room, tap the About/info control, then use `Privacy Policy`, `Support`, or `Account Deletion`.

## Google Play Console Worksheet

### App Content / Store Listing URLs

- Privacy Policy: `https://quiet-room-privacy-policy.vercel.app/privacy`
- Support / Developer contact URL: `https://quiet-room-privacy-policy.vercel.app/support`
- Account deletion URL: `https://quiet-room-privacy-policy.vercel.app/account-deletion`
- Account deletion available in app: **Yes**
- In-app deletion instructions: `Open Quiet Room, tap the profile icon, choose Delete Account, then confirm.`

### Data Safety Summary

- Does the app collect user data? **Yes**
- Is all collected user data encrypted in transit? **Yes**. App/backend/provider traffic should use HTTPS/TLS in production.
- Does the app provide a way for users to request data deletion? **Yes**
- Does the app share user data? **No**
- Tracking / advertising data use: **No**
- Ads: **No**
- Sale of user data: **No**

Quiet Room still discloses service-provider transfers in the public privacy
policy. The Play Data safety answer above uses Google's narrower "sharing"
definition: Firebase, OpenAI, hosting, and logging providers are treated as
service providers processing data on Quiet Room's behalf and under Quiet Room's
instructions.

### Play Data Types To Declare As Collected

| Play data area | Data type to select when available | Required/optional | Purpose(s) | Notes |
|---|---|---|---|---|
| Personal info | Email address | Optional | Account management, app functionality | Collected for email/password accounts and provider sign-in when available. |
| Personal info | Name | Optional | Account management, app functionality | Display name may come from sign-in providers. |
| Personal info | User IDs | Required | Account management, app functionality, security/fraud prevention | Firebase UID exists for anonymous and signed-in sessions and is used by the backend. |
| Messages / App activity | Other in-app messages or user-generated content | Required for chat functionality after consent | App functionality, personalization | User prompts and assistant replies are sent to the backend/OpenAI and stored for authenticated API sessions. |
| Sensitive personal info | Religious or philosophical beliefs / other sensitive info | Required for chat functionality when provided by the user | App functionality, personalization | Quiet Room's faith/reflection use case means user messages and derived profile data may include spiritual or religious content. |
| App activity | App interactions / other actions | Required | App functionality, analytics/diagnostics only if the form requires a diagnostics bucket | Operational metadata includes request status, model, token usage, timing, IDs, and error categories. |
| App info and performance | Diagnostics / crash or performance data if surfaced by the form | Required | App functionality, diagnostics | Use this for operational logs and error metadata if Play maps them to diagnostics. |

Do **not** declare these unless the product changes:

- Location
- Contacts
- Photos or videos
- User audio recordings
- Camera
- Microphone recording
- SMS
- Calendar
- Health and fitness
- Financial information
- Files or broad external storage/media access
- Advertising ID or ad tracking

### Android Permission Notes

Current Android release-candidate audit result:

- `android.permission.INTERNET` — keep; required for API, auth, and voice playback downloads.
- `android.permission.MODIFY_AUDIO_SETTINGS` — keep; required for voice/TTS playback audio mode.
- `android.permission.ACCESS_NETWORK_STATE` — keep; library/platform network state behavior.
- App-local AndroidX receiver permission — keep; generated receiver protection.
- `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` — keep; Play services/install-referrer stack.

Removed/blocked because they do not match shipped product behavior:

- `android.permission.RECORD_AUDIO`
- `android.permission.READ_EXTERNAL_STORAGE`
- `android.permission.WRITE_EXTERNAL_STORAGE`
- `android.permission.SYSTEM_ALERT_WINDOW`
- `android.permission.VIBRATE`

Play reviewer note for permissions:

```text
Quiet Room supports AI chat responses and text-to-speech playback. The app does not record microphone audio, does not request camera/contact/location access, and the current Android release manifest blocks RECORD_AUDIO and broad storage permissions.
```

## App Store Connect Worksheet

### App Information / Privacy URLs

- Privacy Policy URL: `https://quiet-room-privacy-policy.vercel.app/privacy`
- User Privacy Choices URL: `https://quiet-room-privacy-policy.vercel.app/account-deletion`
- Support URL: `https://quiet-room-privacy-policy.vercel.app/support`
- Account deletion in app: **Yes**
- In-app deletion instructions: `Open Quiet Room, tap the profile icon, choose Delete Account, then confirm.`

### Tracking

- Does this app use data to track users? **No**
- Does this app share data with data brokers? **No**
- Does this app use third-party advertising or advertising measurement? **No**

### App Privacy Data Types To Declare

| App Store data type | Collected? | Linked to user? | Used for tracking? | Purpose(s) | Notes |
|---|---|---|---|---|---|
| Contact Info - Email Address | Yes | Yes | No | App Functionality | Email/password and provider sign-in accounts. |
| Contact Info - Name | Yes, if provided by sign-in provider | Yes | No | App Functionality | Display name may come from Apple/Google account profile. |
| Identifiers - User ID | Yes | Yes | No | App Functionality | Firebase UID/session identity for anonymous and signed-in sessions. |
| User Content - Other User Content | Yes | Yes | No | App Functionality, Product Personalization | User prompts, assistant replies, saved conversations, and text sent for voice generation. |
| Sensitive Info | Yes | Yes | No | App Functionality, Product Personalization | Spiritual/religious reflection content and derived profile/memory may reveal religious or philosophical beliefs if the user provides that content. |
| Usage Data - Product Interaction | Yes | Yes | No | App Functionality, Diagnostics | Conversation IDs, model selection, request status, feature usage metadata, and timing/count metadata. |
| Diagnostics - Other Diagnostic Data | Yes | Yes | No | App Functionality, Diagnostics | Operational logs and error/status metadata retained up to 90 days. |

Do **not** declare these unless the product changes:

- Location
- Contacts
- Photos or videos
- Audio recordings
- Camera data
- Health and fitness
- Financial information
- Purchases
- Browsing history
- Search history
- Advertising data

### iOS Login And Privacy Manifest Notes

- Sign in with Apple: **Available on iOS**. `app.json` sets `usesAppleSignIn: true`, and the login UI includes the Apple sign-in button.
- Google sign-in: also available when configured. Apple sign-in satisfies the equivalent-login review concern for iOS.
- Privacy manifest: the current generated iOS QA target includes `PrivacyInfo.xcprivacy` in target resources. Before final production upload, rerun `npm run native:sync:prod` and confirm the production iOS target includes the equivalent manifest.

## Reviewer Notes

### Google Play Reviewer Notes

```text
Privacy Policy: https://quiet-room-privacy-policy.vercel.app/privacy
Support: https://quiet-room-privacy-policy.vercel.app/support
Account deletion: https://quiet-room-privacy-policy.vercel.app/account-deletion

In-app account deletion: open Quiet Room, tap the profile icon, choose Delete Account, then confirm.

AI consent: Quiet Room shows an AI-sharing consent prompt before the first message is sent to the AI service. If the user chooses Not now, the pending message is not sent.

Permissions: Quiet Room supports AI chat and text-to-speech playback. The Android release manifest does not request microphone recording, camera, contacts, location, notification, or broad media/storage permissions.
```

### Apple App Review Notes

```text
Privacy Policy: https://quiet-room-privacy-policy.vercel.app/privacy
Support: https://quiet-room-privacy-policy.vercel.app/support
Account deletion: https://quiet-room-privacy-policy.vercel.app/account-deletion

In-app account deletion: open Quiet Room, tap the profile icon, choose Delete Account, then confirm.

AI consent: Quiet Room shows an AI-sharing consent prompt before the first message is sent to the AI service. If the user chooses Not now, the pending message is not sent.

iOS login: Sign in with Apple is available on iOS. Google and email/password sign-in may also be available when configured.

In-app privacy links: open the About screen to access Privacy Policy, Support, and Account Deletion links.
```

## Verification Notes

- Live URL check on April 22, 2026 returned `200` for `/`, `/privacy`, `/support`, and `/account-deletion`.
- About modal links are wired to `PRIVACY_POLICY_URL`, `SUPPORT_URL`, and `ACCOUNT_DELETION_URL`.
- Signed-in account deletion is available from the profile icon menu as `Delete Account`.
- AI consent blocks the first content send until the user accepts; `Not now` closes the prompt without sending.
- Android Task 14 verified the release manifest without microphone, broad storage/media, overlay, camera, notification, or location permissions.
- Official store-doc spot check on April 22, 2026:
  - Google Play Data safety still requires developers to complete the form, review SDK/provider data collection, disclose off-device collection, and identify deletion mechanisms: `https://support.google.com/googleplay/android-developer/answer/10787469`
  - Apple App Privacy still requires privacy details for data collected by the app or third-party partners and a privacy policy URL in App Store Connect: `https://developer.apple.com/app-store/app-privacy-details/` and `https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy`

## Remaining Checklist

- [ ] Before final Apple upload, run the production native sync/build path and confirm `PrivacyInfo.xcprivacy` is included in the production iOS app target/output.
- [ ] Before final store submission, confirm the production backend uses HTTPS/TLS URLs and 90-day deployed operational-log retention.
- [ ] Before final store submission, install the exact production store-candidate builds and smoke-check About links, AI consent, Apple sign-in on iOS, and signed-in account deletion.
