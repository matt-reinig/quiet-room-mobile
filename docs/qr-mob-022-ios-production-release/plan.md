# QR-MOB-022 - iOS production release plan

## Goal

Prepare the first Quiet Room production App Store release through verification, screenshot capture, metadata/reviewer-note prep, build generation, upload, and release-readiness checks, but stop before submitting the build for App Review.

## Scope

- Work in the separate QR-MOB-022 release worktree.
- Review the privacy-v2 deliverables and store disclosure worksheet.
- Verify production app config, Firebase config, privacy manifest packaging, and store links.
- Capture the release-facing screenshot set for the App Store / review package. Before final submission, refresh the public listing screenshots so they show the normal app flow after consent rather than centering the AI-consent modal.
- Draft the App Store reviewer notes and submission-facing copy.
- Generate the production iOS release candidate and upload it to App Store Connect/TestFlight.
- Capture progress and release-readiness notes in this folder.

## Out of scope

- Final App Review submission.
- Any post-submission App Store operations.

## Initial checklist

1. Confirm the QR-MOB-022 task context from `docs/project-tracker.md`.
2. Audit the production release docs and disclosure requirements.
3. Verify production env, signing, and native app metadata.
4. Capture the screenshot set and reviewer-note draft.
5. Regenerate native iOS artifacts if needed.
6. Build and upload the production candidate.
7. Record what is complete and what still needs a human submission step.

## Screenshot refresh direction

- Replace the current first-pass screenshot set before final App Review submission if possible.
- Include at least one normal conversation-flow screenshot with consent already accepted, so the listing shows the app experience rather than an interruption state.
- Include the conversations pane/history view so App Store viewers can see that signed-in users can return to prior conversations.
- Keep AI consent documented in reviewer notes and compliance materials; it does not need to be a primary public listing screenshot unless a later review requirement asks for it.
