# QR-MOB-034 – First-Message Scroll Anchor Reliability Plan

## Implementation Status

The implementation is complete in:

- Worktree: `../worktrees/quiet-room-mobile-qr-mob-034-first-message-scroll-anchor`
- Branch: `codex/qr-mob-034-first-message-scroll-anchor`
- Base: `origin/develop` at `b5368ce`

The implementation fixes the shared first-send timing race and accounts for the QA-only timing amplifier without rolling back QR-MOB-031 or QR-MOB-032. Native acceptance remains open only for the required physical Android matrix, which cannot be run without an attached device.

## Working Hypothesis

The anchor is armed before the first user message exists. The code later derives the desired offset from message layout, grows a minimum content height, and tries to scroll once enough range exists. On a new conversation, this overlaps with an asynchronous auth/recovery boundary and a `currentId: null -> generated ID` render transition.

The current refs protect pending state from an obvious reset, but the scroll can still be attempted against stale or insufficient content measurements and never receive a definitive retry after the list becomes scrollable. QA loses this race more often because current `develop` performs token/recovery work before optimistic insertion; production currently inserts the optimistic message before its token await. Production's observed intermittent failure demonstrates that the underlying range/layout race predates that difference.

Treat this as a state-transition correctness problem, not a scroll-animation tuning problem.

## Phase 1 – Establish a Deterministic Baseline

1. Start with the existing test and implementation:
   - `e2e/quiet-room.scroll-anchor.test.js`
   - `src/screens/QuietRoomScreen.tsx`
   - `src/hooks/useChatController.ts`
   - `src/lib/firebase.ts`
2. Harden test readiness before using failures as product evidence:
   - wait for the composer to be enabled and stable before tapping
   - make AI-consent handling explicit
   - ensure every trial creates a genuinely new conversation
   - distinguish a failed/slow tap from a successfully sent but unanchored message
3. Capture the first-send event sequence with temporary development-only diagnostics:
   - anchor armed
   - token/recovery start and completion
   - optimistic message committed
   - conversation ID transition
   - user-message layout offset
   - viewport and content height
   - computed desired top and maximum scroll top
   - every scroll request and resulting offset
   - any anchor release/reset and its reason
4. Run at least five baseline trials per Android configuration before modifying behavior.

Do not leave noisy production logging behind. Convert useful invariants into focused tests or remove the temporary diagnostics before handoff.

## Phase 2 – Make the Anchor a Durable Send Transaction

Prefer the smallest design that makes readiness explicit. The implementation should satisfy these invariants:

- One send action owns one anchor transaction.
- A conversation ID transition cannot silently invalidate that transaction.
- The transaction is not resolved until the target user message has a measured offset.
- The transaction is not resolved until `contentHeight - viewportHeight` can reach the desired offset.
- A scroll request is followed by observed-offset confirmation, not a fixed number of blind animation-frame retries.
- Reply completion may release padding/anchor state only after the first anchor has either settled or been deliberately cancelled by user interaction.
- A deliberate user drag/touch still cancels automatic pinning.

Implementation options to evaluate, in order:

1. Give the pending anchor a stable send key independent of `currentId` (for example, a locally generated send ID plus the optimistic user-message identity).
2. Arm or bind the anchor when the optimistic user message is committed rather than before an arbitrary-length auth await.
3. Drive retries from measured layout/content-size/scroll events until the explicit range and settled-offset conditions are true.
4. If moving optimistic insertion before token recovery materially simplifies the sequence, do so only with a documented rollback/reconciliation path for token failure and recovered anonymous UID changes.

Avoid timer-based delays and broad rewrites of the chat controller.

## Phase 3 – Preserve Authentication and Persistence Guarantees

Exercise these paths explicitly:

1. Registered user with a valid token.
2. Anonymous user with a valid token.
3. Anonymous user whose deleted Firebase identity is recovered on send.
4. Registered user with a token failure; it must remain an error and must not become anonymous.
5. Cold relaunch after a successful anonymous send; the active conversation must still restore.

Reuse QR-MOB-031 and QR-MOB-032 coverage instead of weakening their assertions. If the solution changes optimistic state ordering, add a focused failure-path test proving an auth error does not leave a phantom saved conversation or send under the wrong UID.

## Phase 4 – Automated Verification

At minimum run:

```bash
npm run typecheck
npx detox test -c android.att.release e2e/quiet-room.scroll-anchor.test.js --record-logs all --take-screenshots all
```

Extend or add focused coverage for:

- first send in a new conversation
- follow-up send in the same conversation
- first send with a multiline composer value
- first send with keyboard open on Android
- anchor stability while a reply streams
- user drag cancelling the anchor
- anonymous recovery and cold-relaunch persistence suites affected by any controller change

Use the repo's environment wrappers and configuration verification for QA/prod variants. Record the exact commands actually used; do not treat an offline/unit smoke as proof of native layout behavior.

## Phase 5 – Repeated Native Matrix

Required before declaring the fix ready:

| Platform/configuration | Identity path | Minimum repeated result |
| --- | --- | --- |
| Android QA | registered or normal test account | 10/10 first-send anchors |
| Android QA | valid anonymous session | 10/10 first-send anchors |
| Android QA | recovered anonymous session | 3/3 recovery sends and anchors |
| Android production config | registered or normal test account | 10/10 first-send anchors |
| Android QA | established conversation follow-up | 10/10 anchors |
| iOS QA | first send and follow-up | 5/5 each |

For every measured run, use the existing near-top assertion rather than visual judgment alone. Keep screenshots for at least one passing first send and one passing follow-up per platform/configuration.

Physical-device verification is required for the Android QA configuration because that is where the regression was reported consistently. Store upload/deployment is outside this task unless separately approved.

## Acceptance Details

- Use the existing test tolerance unless device evidence justifies a documented cross-device tolerance adjustment.
- The opening message bottom must be at or above the message-list top after settling.
- The first user message must remain near the top for the stability sampling window.
- The assistant response must render below the anchored user message.
- No visible snap back to the opening card may occur when `currentId`, loading, streaming, keyboard, or content height changes.

## Expected Files

Likely implementation/test surface:

- `src/screens/QuietRoomScreen.tsx`
- `src/hooks/useChatController.ts` only if optimistic ordering or send identity must change
- `e2e/quiet-room.scroll-anchor.test.js`
- focused unit/helper tests if anchor coordination is extracted
- `docs/qr-mob-034-first-message-scroll-anchor/`
- `docs/project-tracker.md`

Do not expand into unrelated conversation search, audio playback, backend chat, or release work.

## Completion Checklist

- [x] Root cause is proven with event/measurement evidence. See `implementation-notes.md`.
- [x] The focused test fails before the fix for the product reason, not tap or startup flakiness.
- [x] The implementation uses readiness/settlement conditions rather than arbitrary delays.
- [x] First-send and follow-up automated coverage passes in reached-message runs; intermittent QA/backend setup failures are documented.
- [x] QR-MOB-031 recovery boundary remains intact; anonymous continuity passes across three cold relaunches.
- [x] QR-MOB-032 persistence boundary remains intact in the anonymous continuity pass.
- [x] Android QA/prod configuration results are recorded in `verification.md`.
- [x] iOS QA simulator build, first-send/follow-up matrix, and consent-helper result are recorded in `verification.md`.
- [ ] Physical Android QA verification is recorded; no physical Android device is attached in this workspace.
- [x] `git diff --check`, typecheck, and relevant tests pass.
- [x] Tracker notes include branch, base, commands, and artifact paths.
- [x] No store deployment or backend/database mutation occurred without separate approval; verification was limited to local builds/tests and existing QA/prod-config artifacts.
