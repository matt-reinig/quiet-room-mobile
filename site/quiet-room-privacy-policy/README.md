# Quiet Room Privacy Policy Site

This folder is a tiny static site intended to unblock the first public privacy-policy
URL for the Quiet Room mobile apps.

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
- `/account-deletion` for the public deletion-request URL if needed

## Notes

- The current copy is intentionally first-pass and should be tightened as the app's
  final store disclosures and account-deletion flow are finalized.
- The content currently assumes the same public site can serve both `Quiet Room`
  and `Quiet Room QA`.
