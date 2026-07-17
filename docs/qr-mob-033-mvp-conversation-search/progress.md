# QR-MOB-033 — Conversation Search Progress

Updated: 2026-07-17

## Current status

The MVP and the accepted match-navigation follow-up are implemented and merged into mobile `develop` (`d34bcac`) and backend `develop-from-main` (`e79b904`). The in-memory TanStack Query follow-up is implemented and has completed Luna-driven Android/iOS validation for integration into mobile `develop`. The backend is deployed to all three QA Lambdas, and the existing no-cache mobile build is deployed to both QA stores. Production remains untouched.

The match-navigation implementation and validation evidence are captured in [match-navigation-plan.md](./match-navigation-plan.md).

## Mobile cache follow-up (2026-07-17)

- Added one app-level TanStack Query client for authenticated feature flags, model catalog, conversation list/detail/search reads, and registered-user AI consent.
- Scoped every server-state key by Firebase UID and removed the prior UID's cache on identity transitions.
- Invalidated conversation list/detail/search data after send, rename, and delete while leaving chat streaming, audio, and telemetry on their existing transports.
- Kept the cache in memory only. Conversation search remains behind `conversation_search`; the QA store binaries listed below still contain the earlier no-cache source.
- Reused normalized identical searches for two minutes and added a focused native repeat-search journey plus local-release-only cache-hit instrumentation.
- Luna-driven native release validation passed iOS `4/4` in `artifacts/ios.sim.release.2026-07-17 14-42-17Z/` and Android `4/4` in `artifacts/android.att.release.2026-07-17 14-49-14Z/`.
- The focused Android repeat-search journey passed `1/1` in `artifacts/android.att.release.2026-07-17 14-58-04Z/`: first search `cacheHit: false`, HTTP `200`, `1052 ms`; second search `cacheHit: true`, no network status, `42 ms`; backend stdout contained exactly one search request.
- `npm run typecheck`, `npm run mobile:verify:local-qa`, native release builds, and `git diff --check` passed. Validation used only disposable local-emulator users and did not change QA flags or QA/production data.

## QA store deployment (2026-07-16)

- Mobile source was deployed from `origin/develop` at `82e8535`.
- Android Play internal: completed release `QA internal 29` for package `com.quietroom.mobile.qa`; Play edit `09842538804049219584`; AAB SHA256 `d6742e2da100c281d76bb6f02bff5db3d66ff0a8b8808b46c08ef3a9f86e2091`.
- iOS internal TestFlight: `QuietRoomQA` build `36` uploaded successfully and is `VALID` in App Store Connect (not expired). The archive entitlements were verified for `com.quietroom.mobile.qa` and Apple Sign In.
- Android and iOS QA preflights passed with no warnings or blocking failures. The iOS archive used the manual QA provisioning profile; export required the documented App Store Connect API-key fallback after Xcode reported `exportArchive Failed to Use Accounts`.
- The temporary `conversation_search` QA allowlist remains target-only at percentage `0`; production was not changed.

## Worktrees

| Area | Worktree | Branch | Scope |
| --- | --- | --- | --- |
| Mobile | `Gabriel_App/worktrees/quiet-room-mobile-qr-mob-033-mvp-conversation-search` | `codex/qr-mob-033-mvp-conversation-search` | Search UI, result opening, match navigation/highlighting, native validation |
| Backend | `Gabriel_App/worktrees/Gabriel-qr-mob-033-mvp-conversation-search` | `codex/qr-mob-033-mvp-conversation-search-backend` | Search endpoint, navigation metadata, matching, telemetry, contract tests |

## Implementation completed

### Backend

- Added `GET /api/conversations/search?q=...`.
- Added the pure matcher in `gabriel/conversation_search.py`.
- Enforced UID-scoped Firestore reads.
- Checked the `conversation_search` feature flag before reading the conversation stream.
- Added compact grouped result summaries with deterministic ordering.
- Kept telemetry content-free.
- Added `messageIndex` and ordered `messageIndexes` to grouped results.
- Added backend contract coverage; the focused backend suite passes with `19 passed`.

### Mobile

- Added the `conversation_search` feature flag and `useConversationSearch` hook.
- Added the search modal and result states in `ConversationsModal.tsx`.
- Added case-insensitive query highlighting to matching result titles and snippets, reusing the in-conversation emphasis treatment.
- Added result selection/opening through `useChatController`.
- Added stable accessibility IDs and the focused Detox spec.
- Added backward-compatible navigation metadata normalization, deferred in-list jumps, active-message highlighting, and Previous/Next/dismiss navigation.
- Made the open Conversations drawer safe-area-aware with `react-native-safe-area-context` top/bottom insets instead of fixed system-bar padding.
- Added a deterministic three-match navigation fixture for local Detox validation.
- Added a temporary QA/local/Detox-gated custom-token launch path so the Google-only representative QA account can be used in native QA validation. This path is not enabled for ordinary production launches.
- Merged the mobile implementation into `origin/develop` at `d34bcac` and pushed it.
- Deployed backend commit `e79b904` to `gabriel_lambda`, `gabriel-profile-builder`, and `gabriel_streaming_lambda`; all three settled `Successful` on image digest `sha256:3848de48368ad8cecc5f1d477454295b487ae8a015853017dd7494d3ddc8050e`.
- Verified QA `/health` with HTTP 200 and ran an authenticated read-only live search for `mom`, which returned HTTP 200 and 279 grouped results.

## Automated and native validation

Completed checks:

- Backend focused tests: `19 passed`.
- Backend broad tests excluding the environment-dependent Lambda entrypoint: `131 passed, 18 skipped`.
- Mobile TypeScript check: passed with exit code 0.
- Native local-QA sync: passed.
- Android release Detox build: passed (`BUILD SUCCESSFUL`).
- iOS release Detox build: passed (`** BUILD SUCCEEDED **`).
- Focused conversation-search Detox flow:
  - Android: flag-off `1/1`, ordinary result `1/1`, and grouped navigation `1/1` passed individually on `emulator-15008`. A cold full-suite run also showed an emulator main-thread ANR during startup, so the individual results are the reliable Android evidence.
  - iOS: full suite `3/3` passed on the iPhone 17 simulator, including grouped navigation.
- `git diff --check`: passed in both worktrees.
- Conversations drawer safe-area Detox check: Android `1/1` on `emulator-15008`; iOS `1/1` on iPhone 17. The header close control stayed below the top system area on both platforms, and visual screenshots were captured.

The focused flow covered opening the Conversations surface, searching, seeing results and no-results state, selecting a result, jumping to the representative message, navigating `3 → 2 → 1 → 2`, highlighting the active match, dismissing navigation, returning to the message list, and restoring the normal list after clearing the search.

Latest follow-up artifacts:

- [Android grouped-navigation pass](../../artifacts/android.att.release.2026-07-17%2001-33-51Z/)
- [Android flag-off pass](../../artifacts/android.att.release.2026-07-17%2001-38-39Z/)
- [iOS grouped-navigation pass](../../artifacts/ios.sim.release.2026-07-17%2001-48-08Z/)
- [iOS full conversation-search suite](../../artifacts/ios.sim.release.2026-07-17%2001-48-33Z/)
- [Android drawer safe-area pass and screenshot](../../artifacts/android.att.release.2026-07-17%2002-07-41Z/)
- [iOS drawer safe-area pass and screenshot](../../artifacts/ios.sim.release.2026-07-17%2002-08-03Z/)

## Representative QA-data performance validation

The final local performance pass used real QA data in project `gabriel-qa-89f20` for target UID `b71cO4Azg8Sx2YofK5UFblMLCMk2`.

- Dataset: `316` conversations, `5,909` messages, approximately `5,180,168` characters.
- Searches: `10` capped searches total — four Android, four iOS, and two direct payload checks.
- Feature-flag denial: non-allowlisted access returned `404` before conversation reads.
- Backend fetch latency: min/median/max `215.22 / 236.93 / 300.31 ms`.
- Filter latency: min/median/max `21.03 / 27.925 / 31.30 ms`.
- Total backend latency: min/median/max `247.43 / 295.17 / 376.19 ms`.
- Payload samples: `133,584` bytes for `315` result rows and `18` bytes for no results.
- Android native pass: `4/4` searches passed, covering three result states and one no-results state.
- iOS native pass: `4/4` searches passed, covering three result states and one no-results state.
- Result selection opened the expected existing conversation and returned to the message list.
- Before/after conversation digests were unchanged; the pass did not write conversation data.
- The temporary target-only validation flag was restored after this performance pass, with percentage rollout remaining `0` and production untouched.

Artifacts:

- [Android performance artifacts](../../artifacts/android.att.release.2026-07-16%2006-14-04Z/)
- [iOS performance artifacts](../../artifacts/ios.sim.release.2026-07-16%2006-16-55Z/)

## Active user-viewing session

After the validation pass, a separate emulator pair was brought up so the existing devices could remain available to the user:

- Android: AVD `Galaxy_S22_Plus_Bottom_Inset_Repro`, serial `emulator-5554`.
  - Release APK installed successfully.
  - Authenticated QA session launched.
  - Current Android verification shows the Quiet Room QA app in the foreground with the Conversations menu available.
- iOS: iPhone 17 Pro, UUID `ECDD412E-2950-43FB-99FE-CEE8DFE922D1`, iOS 26.4.
  - Simulator booted and the release app installed.
  - The deep-link launch may still require the simulator's normal “Open in Quiet Room QA?” confirmation to be accepted and then rechecked.
- Existing devices were left in place: Android `emulator-15008` and iPhone 17 `7FC81BB9-2A0C-4F31-AEFD-3281BC112EFB`.
- Local backend session is running on `127.0.0.1:5002`; its log is `/tmp/qr-mob-033-view-backend.log`.
- The viewing-session feature flag is currently enabled only for the two target QA UIDs (`b71cO4Azg8Sx2YofK5UFblMLCMk2` and Emily `akPqnaK9XCTMnxtBvhq274MTHcI2`), with percentage `0`:

  `feature_flags/qa/flags/conversation_search`

  This is a temporary viewing-session change. Production remains untouched. Restore the flag after the user finishes viewing, and stop the local backend session when it is no longer needed.

The viewing session uses real QA authentication and reads QA conversation data through the local backend. It is intended for inspection only and does not perform conversation writes.

## Issues and decisions recorded

- The initial performance harness exposed emulator system-UI ANR behavior, token-selection confusion, matcher assumptions, and clear-button assumptions. Those issues were corrected before the final pass; the final Android and iOS performance runs passed.
- The main `develop` checkout and backend `develop-from-main` checkout retain unrelated local worktree edits; those edits were preserved and not included in the QR-MOB-033 commits.
- The MVP search result now opens at the representative matching message, highlights the active query, and supports Previous/Next navigation without another search or Firestore read.

## Next steps

1. If broader rollout is desired, review the target-only `conversation_search` flag before changing its QA allowlist or percentage.
2. Stop the local viewing backend/emulator session when inspection is complete.
