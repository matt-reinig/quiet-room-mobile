# Quiet Room Privacy Policy Site

This folder is a tiny static site for the public Quiet Room privacy, support, and
account-deletion URLs used by the production mobile app and store review.

## Suggested deployment

- Create a new Vercel project named `quiet-room-privacy-policy`.
- Set the project root to `site/quiet-room-privacy-policy`.
- No build command is required.
- Output directory should remain the project root.

## Current production deployment

- Base URL: `https://quiet-room-privacy-policy.vercel.app`
- Privacy policy: `https://quiet-room-privacy-policy.vercel.app/privacy`
- Support: `https://quiet-room-privacy-policy.vercel.app/support`
- Account deletion: `https://quiet-room-privacy-policy.vercel.app/account-deletion`

## Suggested public routes

- `/privacy` for the Play Console and App Store Connect privacy-policy URL
- `/support` for store support/contact metadata
- `/account-deletion` for the public account-deletion explanation URL

## Reviewer-note inputs

- Privacy policy: `https://quiet-room-privacy-policy.vercel.app/privacy`
- Account deletion: `https://quiet-room-privacy-policy.vercel.app/account-deletion`
- Support: `https://quiet-room-privacy-policy.vercel.app/support`
- In-app deletion path: open Quiet Room, tap the profile icon, choose `Delete Account`, then confirm.
- AI disclosure/consent: Quiet Room shows an AI-sharing consent prompt before the first message is sent to the AI service.

## Notes

- The content is production-only and should not reference non-production app
  names, bundle identifiers, package identifiers, or backend details.
- Deployed operational logs are described as metadata-first and retained for up to
  90 days, matching the privacy-v2 Task 11 policy.
