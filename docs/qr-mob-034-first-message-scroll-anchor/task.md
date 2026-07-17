# QR-MOB-034 – First-Message Scroll Anchor Reliability

## Goal

Make the first user message in a brand-new conversation pin near the top of the mobile message list as reliably as follow-up messages, without regressing anonymous-session recovery, conversation persistence, keyboard behavior, or reply streaming.

## Reported Behavior

Observed on Android on 2026-07-16:

- Current QA fails to pin the first message consistently.
- Production failed once and succeeded twice in a three-attempt spot check.
- Follow-up messages in an established conversation pin correctly.
- The failure leaves the opening Quiet Room message visible and the newly sent user message much lower in the viewport instead of moving it near the top.

## Reproduction Evidence

The existing Detox test `e2e/quiet-room.scroll-anchor.test.js` reproduced the failure with a QA-configured Android build:

- message-list frame: `y=176`, `height=1045`
- opening-message bottom: `725`; expected at or above `177`
- first-user-message top offset: `588`; expected at most `20`

The successful measured run used the QA `versionCode 22` test artifact, which shares the relevant `QuietRoomScreen` anchor implementation with current `develop`. A current QA `versionCode 28` automation attempt also showed first-send instability, but launch and tap readiness in the existing Detox harness were too flaky to treat that run as clean quantitative evidence. Real-device observation is therefore part of the acceptance matrix.

Prior evidence is under the sibling QR-MOB-029 E2E worktree at:

`artifacts/android.att.release.2026-07-16 22-06-50Z/`

## Current Technical Boundary

The first-send path is unique because it combines all of these transitions:

1. `QuietRoomScreen` arms the pending send anchor.
2. `useChatController.sendMessage(...)` may await Firebase token or anonymous-recovery work.
3. The first optimistic user message is inserted.
4. A new conversation ID replaces `null`.
5. The opening message and first user message are measured.
6. The message-list minimum height must grow enough to make the requested anchor offset scrollable.
7. The scroll must settle while keyboard, streaming, and content-size events continue.

Follow-up sends do not have the new-conversation ID transition and usually begin with an already-scrollable message list.

The current screen code attempts to preserve pending anchor state when `currentId` changes. The observed result shows that preservation alone is insufficient; the failure is most likely an ordering/range-readiness race between optimistic message insertion, message measurement, content-size growth, and the final `scrollTo(...)`.

The QA line also differs from production because QR-MOB-031 calls `getIdTokenWithAnonymousRecovery(...)` before committing the optimistic first-message state. That extra asynchronous boundary is a plausible amplifier, but older QA evidence shows it is not the sole origin of the race.

## Constraints

- Keep this a mobile-only fix unless new evidence proves a backend change is required.
- Preserve QR-MOB-031 deleted-anonymous-session recovery semantics.
- Preserve QR-MOB-032 anonymous conversation restoration and active-conversation persistence.
- Do not weaken registered-user authentication failures into anonymous fallback.
- Do not change message ordering, request payloads, model selection, streaming, or conversation-title behavior.
- Do not solve the issue with arbitrary delays that only mask timing on one device.
- Do not change production or QA release state as part of implementation without separate approval.

## Success Criteria

1. A first message sent from a genuinely new conversation pins within the same near-top tolerance used by the existing anchor test.
2. The opening message is scrolled above the visible message-list viewport after the anchor settles.
3. The user message stays stable while the assistant reply begins and streams.
4. Follow-up message anchoring remains correct.
5. Anonymous valid-session, anonymous recovered-session, and registered-user sends retain their current identity and persistence guarantees.
6. Android QA and production configurations both pass repeated first-send trials.
7. iOS first-send and follow-up behavior does not regress.
8. Focused automated coverage fails before the fix and passes reliably afterward.

## Deliverables

- Root-cause notes backed by event-order or measurement evidence.
- A minimal implementation in the existing anchor/send boundary.
- Hardened first-send and follow-up automated coverage.
- Repeated Android QA/prod configuration results plus an iOS regression pass.
- Tracker and plan updates containing exact commands and artifact paths.
