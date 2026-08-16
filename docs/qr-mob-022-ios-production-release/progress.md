# QR-MOB-022 - Progress

## Current status

- Separate release worktree created for QR-MOB-022.
- Branch based on `origin/master` and merged with `origin/develop` to pick up the current production-ready mobile work.
- Task-scoped docs added here to hold the release plan and running progress.
- Screenshot upload is complete for the current iPhone and required 13-inch iPad display types. QR-MOB-028 cleanup cleared the App Store Connect setup gaps, App Privacy was completed/published by the App Store owner, and the first production App Store review package is submitted.
- Existing Play Store listing assets were found in `../quiet-room-mobile-play-store-listing/store-assets`, including the five phone screenshots, app icon export, feature graphic, and listing metadata.
- App Store Connect is signed in and the iOS version page is open for the Quiet Room app.
- Reviewer notes are present on the live App Store Connect listing.
- A cleaned screenshot bundle has been staged in `store-assets/iphone/` for the App Store Connect upload flow.
- The staged screenshots are sized at `1206x2622` and cover landing, atmosphere, login, report response, and report submitted states.
- An App Store Connect API-compatible screenshot bundle has also been staged in `store-assets/iphone-api-67/`; these five images are `1290x2796` and were uploaded as display type `APP_IPHONE_67`.
- Production release-candidate smoke is passing locally against the iOS release-simulator target.
- The older QR-MOB-022 release candidate notes reference build `26`, but App Store Connect now has newer valid production builds available. The latest valid build readback is build `30`, which prior rollout notes identify as the production hotfix upload.
- App Store Connect screenshot attachment is complete through the API: readback reports screenshot set `ba57c157-f59b-4a9b-b14f-482b28d39bc7` with `5` screenshots for `APP_IPHONE_67` and set `ad33cf8c-c159-4a33-9874-ae60fb0890cd` with `1` screenshot for `APP_IPAD_PRO_3GEN_129`.
- Chrome/Codex extension control is still unavailable after reinstall checks, so the App Store Connect UI path cannot be driven from Codex yet.
- A fresh Chrome plugin diagnostic pass confirms Google Chrome is installed and running, the Codex extension is installed/enabled in the selected `Default` profile, and the native-host manifest is correct. The approved fresh-window retry for the `Default` profile was attempted and the extension browser connection still reports unavailable.
- A Play-style API route was investigated. The prior Google Play flow worked because a local service-account JSON and Android Publisher API script were available; the Apple equivalent needs a working App Store Connect API Key ID, Issuer ID, and `.p8` key. See `app-store-connect-api-notes.md`.
- A no-submit App Store Connect screenshot uploader scaffold has been added at `scripts/upload-app-store-screenshots.mjs` and dry-run verified against the staged screenshot bundle.
- A credential-backed App Store Connect uploader attempt authenticated and resolved app id `6761866347`; App Store Connect version `1.0` exists, while `1.0.0` does not.
- Read-only App Store Connect status verification resolved version id `36f439ae-f2f6-4140-babd-14cdc6ac48ea` in state `PREPARE_FOR_SUBMISSION`, resolved `en-US` localization id `b1396952-779e-4893-9e63-d4f81ffd177e`, found `0` screenshot sets, and confirmed target display type `APP_IPHONE_63` is missing.
- The screenshot write attempt failed at `POST /appScreenshotSets` with `FORBIDDEN_ERROR`: `The API key in use does not allow this request`. The key can read enough to find the app/version, but it does not currently have screenshot/metadata write permission for this app.
- A follow-up credential-backed retry on 2026-06-19 at 21:46 CDT produced the same `FORBIDDEN_ERROR` at `POST /appScreenshotSets`; read-only status immediately afterward still showed `0` screenshot sets, so no App Store Connect screenshot changes were made.
- A credential-unblock handoff is captured in `credential-unblock-handoff.md` with the exact Apple-side permission requirement, safe verification sequence, and expected upload success shape.
- After the API key was updated, Apple accepted screenshot-set creation for `APP_IPHONE_67`. The upload completed on 2026-06-19 at 21:53 CDT: five screenshots uploaded and final readback reported `APP_IPHONE_67: set ba57c157-f59b-4a9b-b14f-482b28d39bc7, screenshots 5`.
- App Store Connect submission-readiness verification on 2026-06-19 at 22:08 CDT confirmed screenshots are not the final blocker. The live version has no build attached, unset listing fields, unset review contact fields, unset age-rating questionnaire answers, no primary category relationship, and no submission object. See `submission-readiness-audit.md`.
- QR-MOB-028 App Store Connect no-submit cleanup on 2026-06-19 attached production build `30` to version `1.0`, set copyright `2026 Quiet Room`, set IDFA to `false`, filled the listing localization fields, set primary category `LIFESTYLE`, and completed the age-rating declaration. `whatsNew` is not editable for the first version.
- Refreshed App Store screenshots on 2026-06-19 with a production iOS release-simulator capture of the normal post-consent conversation flow and the signed-in conversations/history pane. The refreshed `APP_IPHONE_67` upload replaced the previous five screenshots and readback still reports screenshot set `ba57c157-f59b-4a9b-b14f-482b28d39bc7` with `5` screenshots.
- Current App Store Connect readiness status reports `Version state: WAITING_FOR_REVIEW`, `Submission object: present`, and `Readiness gaps: none`.

## Completed so far

- Reviewed the tracker entry and scoped the work to production release prep only.
- Verified production mobile config with `npm run mobile:verify:prod`.
- Verified production iOS metadata with `npm run ios:testflight:status:prod` and `npm run ios:testflight:preflight:prod`.
- Regenerated native iOS artifacts with `npm run native:sync:prod`.
- Built and uploaded the production iOS release candidate through the TestFlight deploy lane.
- Confirmed the upload succeeded and the build is processing in App Store Connect.
- Drafted the App Store reviewer notes and screenshot capture plan in this folder.
- Identified the prior Play Store asset bundle and confirmed the filenames match the intended initial listing set.
- Verified the existing screenshot pack is usable as the release-facing listing bundle, with no mandatory recapture needed before submission.
- Verified the App Store Connect page still needs screenshot uploads before `Add for Review` can be used.
- Verified production links return HTTP 200:
  - `https://quiet-room-privacy-policy.vercel.app/`
  - `https://quiet-room-privacy-policy.vercel.app/privacy`
  - `https://quiet-room-privacy-policy.vercel.app/support`
  - `https://quiet-room-privacy-policy.vercel.app/account-deletion`
- Verified production iOS preflight with `npm run ios:testflight:preflight:prod`: 16 pass, 0 blocking failures. The script still reports the known nonblocking native metadata alignment warnings (`MARKETING_VERSION: 1.0`, `CURRENT_PROJECT_VERSION: 1`) while `CFBundleShortVersionString` is `1.0.0` and `CFBundleVersion` is `26`.
- Verified TypeScript with `npm run typecheck`.
- Verified the production response flow with `bash ./scripts/with-mobile-env.sh prod prod npx detox test -c ios.sim.release e2e/quiet-room.response-smoke.test.js --record-logs all --take-screenshots failing --loglevel info`.
- Verified AI consent guest coverage with focused release-simulator runs:
  - `blocks the first send until consent is accepted`
  - `accepting consent resumes the pending send`
  - `persists consent across a cold relaunch`
- Stabilized the E2E AI-consent accept helper for an iOS Detox tap timing issue where the text-effects overlay can leave the modal visible after the first tap. This was a test-only change in `e2e/`; `src/screens/QuietRoomScreen.tsx` has no release-candidate diff.
- Compared the smooth Google Play upload path against App Store Connect options. The repo has the Android Publisher API pattern documented, but no proven App Store Connect API credential set was found for screenshot upload automation.
- Added and dry-run verified `scripts/upload-app-store-screenshots.mjs`: it found the five staged screenshots, computed MD5 checksums, and made no App Store Connect changes in dry-run mode.
- Retried the uploader with local App Store Connect credentials. `--version 1.0` reached the screenshot-set creation step, but Apple rejected the write because the API key does not allow the request.
- Added and ran read-only uploader status mode: `node scripts/upload-app-store-screenshots.mjs --status`. It verified the version is editable and no screenshot set currently exists for `APP_IPHONE_63`.
- Added `credential-unblock-handoff.md` so a replacement writable API key can be dropped into `.local/app-store-connect.env` and verified without repeating the investigation.
- Retried the screenshot upload after the local credential update. Apple still rejected screenshot-set creation for the API key, and a read-only status check confirmed the version remained unchanged with `0` screenshot sets.
- Generated the API-compatible `store-assets/iphone-api-67/` screenshot set at `1290x2796`.
- Uploaded five screenshots to App Store Connect for display type `APP_IPHONE_67`; uploaded ids:
  - `01-landing.png`: `f41fbe25-9c7d-4d24-9b64-a997f42ba860`
  - `02-atmosphere.png`: `f06d0423-2da2-4064-a7d7-4ded7ab8099d`
  - `03-login.png`: `c794e29c-3d48-4fce-bd8c-59f56ed4b4a6`
  - `04-report-response.png`: `4806f73e-0560-45a0-9939-66323a0f2fd7`
  - `05-report-submitted.png`: `b3a01394-9e00-4228-a312-a5dcdd8d1a08`
- Verified App Store Connect readback after upload: `APP_IPHONE_67` screenshot set `ba57c157-f59b-4a9b-b14f-482b28d39bc7` contains `5` screenshots.
- Final local release-readiness checks rerun on 2026-06-19 at 21:56 CDT:
  - `npm run typecheck` passed.
  - `npm run ios:testflight:preflight:prod` passed with 16 pass, 0 blocking failures, and the same known native metadata alignment warnings.
- Added `scripts/update-app-store-readiness.mjs` with read-only and no-submit apply modes for build attachment, listing metadata, primary category, age rating, and App Review contact fields.
- Ran `npm run ios:appstore:readiness:apply` through App Store Connect API. Final successful apply reported build `30` attached, listing/category/age-rating fields set, submission object not found, and no App Review submission attempted.
- Built the production iOS release-simulator app with `npm run native:sync:prod -- ios` and `npm run detox:build:ios:prod`.
- Captured refreshed production screenshots with `bash ./scripts/with-mobile-env.sh prod prod npx detox test -c ios.sim.release e2e/quiet-room.app-store-screenshots.test.js --record-logs all --take-screenshots all --artifacts-location artifacts/qr-mob-028-app-store-screenshots --loglevel info --reuse`.
- Uploaded the refreshed screenshot set with `npm run ios:appstore:screenshots:upload -- --replace-existing`; uploaded ids:
  - `01-landing.png`: `a5493e03-e546-4e43-9ada-2a8def5cd107`
  - `02-conversation.png`: `85423a52-7ae1-4851-98ab-10ec1ac65649`
  - `03-conversations-history.png`: `7366e0c1-721e-4c76-befb-c2f3e7c7b284`
  - `04-atmosphere.png`: `e4a4aa69-574f-462e-97cb-91ba78d590b2`
  - `05-report-response.png`: `483b7e13-56d8-49a1-967c-3fd9532449ec`
- Verified refreshed screenshot readback with `npm run ios:appstore:screenshots:status`: target display type `APP_IPHONE_67` is present with `5` screenshots.
- Verified metadata/readiness readback with `npm run ios:appstore:readiness:status`: build `30` attached, listing fields set, App Review contact fields set, primary category `LIFESTYLE`, age-rating declaration complete except optional null fields, submission object not found, and `Readiness gaps: none`.
- Captured and uploaded the required 13-inch iPad screenshot from a production release-simulator app on an iPad Pro 13-inch simulator. Local file: `store-assets/ipad-pro-13/01-ipad-opening.png`; local size verification: `2064x2752`; App Store Connect readback: `APP_IPAD_PRO_3GEN_129` set `ad33cf8c-c159-4a33-9874-ae60fb0890cd`, screenshot id `cc461676-5f5c-446f-9fc0-adfd69d2bdfe`, screenshot count `1`.
- Cleared the App Store Connect Content Rights Information blocker by setting app `6761866347` to `contentRightsDeclaration: USES_THIRD_PARTY_CONTENT`.
- Cleared the App Store Connect Pricing blocker by setting base territory `USA` and one manual free price point (`customerPrice 0.0`, no start/end date).
- Confirmed Chrome is installed/running, the Codex extension is installed/enabled in the selected `Default` profile, and the native-host manifest is correct, but the extension browser connection still reports unavailable. Codex did not complete the App Privacy UI form.
- After the App Store owner completed/published App Privacy and submitted for review, verified App Store Connect readback on 2026-06-19 at 23:32 CDT: version state `WAITING_FOR_REVIEW`, attached build `30`, submission object present, and `Readiness gaps: none`.

## Remaining

- Monitor App Store Connect review status and respond to Apple if review requests follow-up.
