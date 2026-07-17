# QR-MOB-034 implementation notes

## Scope

- Branch: `codex/qr-mob-034-first-message-scroll-anchor`
- Worktree: `../worktrees/quiet-room-mobile-qr-mob-034-first-message-scroll-anchor`
- Base: `origin/develop` at `b5368ce`
- Mobile-only change; no backend, database, store, or release-state mutation.

## Root cause

The first-send anchor was armed before the async token/recovery boundary and before the optimistic message was visible. During the `currentId: null -> generated conversation ID` transition, the resolver could observe a transient render with no user message and disarm the pending transaction. When the anchor did resolve, reply completion immediately removed the synthetic minimum content height. React Native then clamped the list to its natural maximum, producing the observed post-stream frame:

```text
list y=189 h=737
opening y=-70 h=635 bottom=565
first user y=607 h=132 top offset=418
```

The temporary runtime probe showed the conversation was valid (`currentId` set, two messages, loading false) while all anchor refs had already been cleared. The pre-fix baseline from the sibling audit worktree is preserved in `../worktrees/quiet-room-mobile-qr-mob-029-e2e-audit/artifacts/android.att.release.2026-07-16 22-06-50Z/`.

## Implementation

`QuietRoomScreen` now treats a send anchor as a durable transaction:

1. The controller binds the anchor to the exact optimistic user-message index and content before updating conversation state.
2. A render that has not exposed that message yet leaves the transaction pending instead of cancelling it.
3. Layout, content-size, and scroll events retry from measured state until the target offset is both reachable and observed.
4. The message-list minimum height is applied to the scroll content so the requested offset is actually reachable.
5. Keyboard show/hide, message/render commits, loading/conversation-ID changes, and reply completion all re-enter the same measured-target refresh path, covering native layout events that can arrive without a matching JS content-size callback.
6. Reply completion no longer removes the anchor range; it remains until the user drags or starts another send, preventing the visible snap-back.
7. Token/recovery failure explicitly cancels the pending transaction without changing the existing authentication behavior.

The focused Detox coverage now waits for composer/send readiness, creates a genuinely new conversation, covers first-send, follow-up, multiline input, reply stability, and manual scroll cancellation, and uses Jest numeric assertions rather than Detox native matchers.

## Scroll rationale and related fixes

The earlier mobile scroll experiment in `docs/mobile-scroll-anchor-experiment.md` was intentionally reverted because React Native does not expose the same smooth-scroll controls as the browser, and timing hacks did not produce the desired desktop feel. QR-MOB-034 addresses the separate correctness issue without changing that decision: the native scroll request is allowed to happen only after the target message is measured and the requested offset is reachable.

The web analogue is documented in the sibling repo at `../quiet-room/docs/scroll-anchoring-fix.md`. Both fixes preserve a pending first-send anchor until layout/range readiness is real; the implementations remain platform-specific.
