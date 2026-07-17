# Mobile Scroll Anchor Experiment

## Goal

Make the mobile post-send pinning behavior feel closer to desktop.

On desktop, the effect feels good because the interface is already in motion and the sent message settles smoothly toward the top. On mobile, the default behavior felt more like the whole chat view suddenly jumping upward.

## What desktop does

The web app uses browser-native smooth scrolling in `quiet-room/src/components/ChatWindow.tsx` with `scrollTo(..., { behavior: "smooth" })` and related browser scroll behavior.

That implementation is simple on web because the browser gives us native smooth scrolling and handles the visual transition for us.

## Why mobile was harder

React Native `ScrollView.scrollTo` only gives us `animated: true | false`.

It does **not** give us the same browser-style API for:

- explicit smooth-scroll timing
- custom easing
- desktop-like scroll choreography

That meant the mobile version stopped being a simple parity change once we tried to control the feel.

## Experiments we tried

### 1. Native animated scroll

We changed the post-send anchor move from an immediate jump to `scrollTo(..., animated: true)`.

Result:

- better than a pure snap in some cases
- still did not really match the desktop feel

### 2. Native animated scroll plus a short delay

We tried delaying the post-send scroll before starting the native animation.

Tried values included:

- `400ms`
- `100ms`
- `0ms` was also discussed conceptually

Result:

- a delay made the movement feel more intentional
- but it also made the old content remain visible before the movement started
- this still did not recreate the desktop effect

### 3. Custom duration-controlled scrolling

We tried to make the mobile scroll take a specific duration instead of relying on platform defaults.

We experimented with:

- JS-driven per-frame scrolling
- staged native scroll steps
- visual transform-based motion

Result:

- one version looked like the chat was "inching along"
- changing the duration did not reliably produce the expected UX improvement
- the motion started to feel engineered rather than natural

## What we learned

- The desktop solution does not port directly to React Native.
- Mobile native `animated` scroll is much more limited than browser smooth scrolling.
- Making the mobile view "move slower" is not the same thing as matching the desktop UX.
- The desktop feel likely depends on broader screen-state choreography, not only on scroll timing.

## Final decision for now

We reverted the experiment and restored the pre-experiment mobile behavior in `src/screens/QuietRoomScreen.tsx`.

Reason:

- the current experiment path was adding complexity without delivering the right feel
- the visible result still was not what we wanted
- this is better revisited later as a broader UX design pass rather than as a narrow timing tweak

## Good next step later

If we revisit this, we should treat it as a UX problem, not just a scroll-speed problem.

Questions to answer next time:

- What exact visual moment on desktop feels good?
- Is the desired effect really a scroll, or a coordinated content transition?
- Should mobile intentionally behave differently instead of trying to mimic desktop 1:1?

## Current status

- the timing experiment is reverted
- the original mobile behavior was restored rather than forcing browser-style motion into React Native
- app refreshed on simulator and phone after the revert

## Follow-through: QR-MOB-034 reliability fix

The timing experiment and the first-message reliability problem are separate concerns. QR-MOB-034 does **not** reintroduce JS-driven scrolling, arbitrary delays, or a custom duration. It makes the existing native anchor reliable by treating each send as a durable transaction:

- bind the anchor to the exact optimistic user message before the conversation-ID transition
- keep the transaction pending when the message has not been exposed or measured yet
- retry from layout, content-size, and scroll events until the requested offset is reachable and observed
- retain the minimum scroll-content height through reply completion so React Native cannot clamp the settled anchor back down
- release automatic pinning only after deliberate user interaction or a send failure

The shared lesson with the web fix is that first-send anchoring is a layout/state-readiness problem, not primarily a scroll-speed problem. Mobile still intentionally uses native scrolling; the reliability fix lives in `docs/qr-mob-034-first-message-scroll-anchor/implementation-notes.md` and does not claim desktop motion parity.
