# QR-MOB-033 – Search Match Navigation and Highlighting Plan

## Status

- Planning status: implemented in the isolated QR-MOB-033 worktrees; local validation complete
- Product decision: preserve one grouped search-result row per conversation
- Navigation behavior: open the representative matching message, then provide Previous/Next controls for other matches in that conversation
- Highlight behavior: emphasize the active matching message and highlight every case-insensitive occurrence of the submitted search term inside it
- Feature flag: remain under the existing `conversation_search` flag; do not introduce another flag
- Repository boundary: continue in the existing QR-MOB-033 mobile and Gabriel backend worktrees
- Data boundary: no Firestore schema change, backfill, duplicated index, or additional conversation fetch per navigation step
- Safe-area follow-up: the open Conversations drawer now uses the shared safe-area insets for its top and bottom chrome on Android and iOS

## Why This Fits the Current Implementation

The implemented search groups matches by conversation and chooses the most recent matching message as the result snippet. The backend now returns that representative `messageIndex` plus the ordered `messageIndexes` for every matching message. Mobile captures that metadata before closing the search modal, then uses the already loaded conversation detail and existing row offsets to navigate without another search or Firestore read.

The conversation detail request already returns the full ordered `messages` array. `QuietRoomScreen.tsx` renders those messages in a `ScrollView` and records each rendered row's vertical layout offset. The follow-up can use those existing offsets to jump within the loaded conversation; it does not need another database request or a different list implementation.

## Conversations Drawer Safe-Area Follow-up

The drawer previously used React Native's legacy `SafeAreaView` and fixed top/bottom padding. That did not follow the same inset source as the main screen and could leave the header or the end of the conversation list too close to device system chrome.

`ConversationsModal.tsx` now reads `useSafeAreaInsets()` from `react-native-safe-area-context`, renders the panel as a regular `View`, and applies the device's top and bottom insets in addition to the existing visual gutters. The drawer remains full-height, keeps its current width and content behavior, and does not change the search or conversation data paths.

## User Experience

1. Search results remain grouped: one row per conversation, with title, timestamp, representative snippet, and total match count.
2. Tapping a result closes the search modal and opens the conversation exactly as it does now.
3. After the conversation detail and message layouts are ready, the message list scrolls to the same representative message used for the result snippet.
4. The active message receives a subtle temporary focus treatment, and every case-insensitive substring occurrence of the submitted query inside that message is highlighted.
5. When the conversation has more than one matching message, show a compact persistent navigator below the conversation header:
   - submitted query, truncated safely for display;
   - `Match N of M`;
   - Previous and Next controls;
   - Close control that removes navigation/highlighting without leaving the conversation.
6. Previous and Next move in chronological message order, scroll the selected message into a comfortable reading position, update the ordinal, and move the highlight.
7. The initial ordinal corresponds to the representative snippet. Because the current result uses the most recent matching message, the initial selection will normally be the last match.
8. The navigation context clears when the user dismisses it, opens a different conversation through the ordinary list, starts a new chat, signs out/changes UID, or the `conversation_search` flag turns off.

## Backend Contract Changes

Affected worktree: `../worktrees/Gabriel-qr-mob-033-mvp-conversation-search`.

1. Extend `ConversationSearchMatch` in `gabriel/conversation_search.py` to retain the ordered indices of every matching message in addition to the representative `message_index` and `match_count`.
2. Keep matching and grouping unchanged: one result object per conversation and one representative snippet.
3. Add compact navigation metadata to each result:

```json
{
  "id": "conversation-id",
  "title": "Conversation title",
  "snippet": "...matching text...",
  "matchCount": 3,
  "messageIndex": 8,
  "messageIndexes": [2, 5, 8]
}
```

4. Keep `messageIndexes` in ascending message order and require `messageIndex` to be one of them.
5. Do not return full messages or additional snippets. The existing detail endpoint supplies message content after selection.
6. Preserve the current content-free instrumentation and feature-flag gate. Navigation must not cause another search endpoint or Firestore collection call.
7. Treat malformed messages exactly as the current matcher does. If no valid match exists, omit the conversation result rather than returning unusable navigation metadata.

## Mobile State and Navigation

Affected worktree: `../worktrees/quiet-room-mobile-qr-mob-033-mvp-conversation-search`.

### Search result contract

Extend `ConversationSearchResult` and response normalization with:

- `messageIndex: number`;
- `messageIndexes: number[]`;
- validation that indices are non-negative integers, deduplicated, sorted, and contain the representative index;
- safe fallback for a temporarily mixed backend/mobile rollout: if navigation metadata is absent or invalid, retain today's behavior of opening the conversation without a jump.

### Navigation state

Add a focused state object rather than storing search-navigation concerns in the conversation model:

```ts
type ConversationSearchNavigationTarget = {
  conversationId: string;
  messageIndexes: number[];
  query: string;
  selectedPosition: number;
};
```

When a search result is selected:

1. Capture the trimmed submitted query and validated navigation metadata before calling `clearSearch()`.
2. Call the existing `openConversation(result)` path.
3. Close the modal while retaining the navigation target independently from the modal's search state.
4. Wait until the selected conversation is current, `chatLoading` is false, and the target message offset has been measured.
5. Scroll to the row with a small top context inset so the highlighted message is not pinned against the header.

### Scroll coordination

The message screen already has `listRef`, `messageOffsetsRef`, and `onLayout` callbacks. Add a pending search-jump path with higher priority than the existing automatic scroll-to-latest behavior:

- key offsets directly by conversation/message index for search navigation rather than reconstructing the current render ID;
- clear stale offsets when `currentId` changes;
- attempt the jump after both conversation hydration and target row layout;
- in `onContentSizeChange`, resolve a pending search jump before near-bottom auto-scroll;
- suppress automatic scroll-to-latest until the initial search jump completes;
- Previous/Next use the already measured offset immediately, with the same deferred-layout fallback;
- cancel pending work when navigation context is cleared or the conversation changes.

If saved indices are stale and outside the loaded message array, recompute valid matches from the loaded messages and query. If no match remains, remove the navigator and leave the conversation open without an error loop.

## Highlighting

1. Add optional `highlightQuery` and `searchMatchActive` props to `MessageBubble`.
2. Apply highlighting only to the currently selected matching message so Previous/Next clearly represents one active match at a time.
3. Preserve current inline bold/italic rendering by splitting each parsed markdown text segment again around case-insensitive query occurrences and rendering nested `Text` spans with the original emphasis plus a highlight style.
4. Highlight every occurrence inside the active message, not only the occurrence used to center the search-result snippet.
5. Add a subtle active-message border/background treatment in addition to text highlighting so the destination remains apparent if the term is short or near the edge of the viewport.
6. Use accessible contrast in light mode and do not rely on color alone; expose an accessibility label such as `Search match N of M` on the active message or navigator.
7. Do not mutate or decorate the underlying `ChatMessage.content` value.

## Result-list highlighting

1. Preserve the grouped result shape and representative snippet; apply highlighting only at render time in the Conversations drawer.
2. Highlight every case-insensitive substring occurrence of the submitted query in the result title and representative snippet.
3. Reuse the same accessible emphasis treatment as the active in-conversation match so the search term remains easy to scan before a result is opened.
4. Do not mutate or decorate the returned title or snippet strings.

## Previous/Next Navigator

Add a small `ConversationSearchMatchNavigator` component rather than further expanding `QuietRoomScreen.tsx` markup.

Props should include the display query, selected position, total matches, Previous/Next callbacks, and dismiss callback. Disable Previous on the first match and Next on the last match. Keep the component visible after each jump until explicitly dismissed or its lifecycle boundary is hit.

The navigator should not initiate backend requests. It changes only `selectedPosition` and scrolls within the already loaded conversation.

## Validation Plan

### Backend tests

Extend the existing conversation-search contract/helper tests to prove:

- grouped results still return once per conversation;
- `messageIndexes` contains all and only matching message indices in chronological order;
- `messageIndex` identifies the same representative message used for `snippet`;
- case-insensitive and substring matching produce correct indices;
- malformed messages do not corrupt indices;
- `matchCount === messageIndexes.length`;
- the response remains compact and contains no full message content beyond the representative snippet;
- feature-off requests still perform zero conversation reads.

### Mobile focused tests

Add pure tests for:

- search-result navigation metadata normalization and mixed-version fallback;
- case-insensitive highlight segmentation, repeated matches, empty query, and no-match content;
- preservation of bold/italic segment styles while highlighting;
- Previous/Next bounds and selected ordinal;
- stale-index recomputation against loaded messages.

### Native Detox

Extend `e2e/quiet-room.conversation-search.test.js` with a deterministic conversation containing at least three matching messages separated by enough content to require visible scrolling.

Run the same focused spec on Android and iOS and prove:

1. Search still shows one grouped conversation row and the correct aggregate match count.
2. Tapping the row opens the conversation at the representative message.
3. The matching term and active message have stable test IDs and are visible.
4. `Match 3 of 3` is shown initially for the most recent representative match.
5. Previous moves to match 2 and then match 1, each time changing the ordinal, visible target, and active highlight.
6. Next moves forward again and respects disabled bounds.
7. Dismiss removes the navigator/highlight but leaves the conversation open.
8. Selecting an ordinary conversation afterward does not restore stale search navigation.
9. Flag-off behavior remains unchanged.

Use stable IDs for the navigator, ordinal, Previous, Next, dismiss, active matched message, and highlighted text container. Capture screenshots at the initial, previous, and next destinations for visual review.

### Representative QA validation

- Keep the `b7…` account read-only and use the existing temporary target-only QA flag process only when QA mutation is explicitly authorized.
- Choose one query known to have multiple matching messages without recording the query or message text in logs/docs.
- Perform one search, open the grouped result, navigate Previous/Next, and verify the expected ordinal and scrolling on Android and iOS.
- This follow-up should add one search read per platform only; Previous/Next must add zero Firestore reads.
- Confirm before/after conversation digest and counts remain unchanged.

## Delivery Sequence

1. Update the backend matcher/result contract and backend tests.
2. Update mobile response normalization with backward-compatible navigation metadata handling.
3. Add independent search-navigation state and pending scroll coordination.
4. Add active-message highlighting and the match navigator component.
5. Add focused helper tests and extend Android/iOS Detox coverage.
6. Run backend contracts, mobile typecheck, local-QA config verification, native sync/build, and focused Detox on both platforms.
7. When explicitly authorized and AWS/QA access is available, deploy behind the existing allowlist flag and run the capped read-only representative QA navigation pass.
8. Record artifacts and final evidence in the QR-MOB-033 docs and tracker.

## Definition of Done

- Results remain grouped once per conversation.
- Opening a result scrolls to the exact message represented by its snippet.
- The active message and all query occurrences within it are visibly highlighted.
- Previous/Next navigates every matching message in chronological order without a new network or Firestore request.
- Navigation survives the modal closing but clears at the documented lifecycle boundaries.
- Stale or absent navigation metadata degrades safely to opening the conversation normally.
- Existing feature-flag, privacy, read-only QA, and no-schema-change boundaries remain intact.
- The open Conversations drawer keeps its header and list content inside the top and bottom device safe areas on Android and iOS.
- Backend, focused mobile, Android Detox, and iOS Detox validation pass with artifacts.

## Implementation Evidence

- Backend: `ConversationSearchMatch` retains ordered matching indices and `/api/conversations/search` returns `messageIndex` and `messageIndexes`; the focused contract suite passes `19/19`.
- Mobile: response normalization safely falls back when navigation metadata is absent or invalid; `QuietRoomScreen` owns independent navigation state, deferred offset-based jumps, lifecycle clearing, active-message highlighting, and the compact navigator.
- Android release: the flag-off, ordinary-result, and grouped-navigation cases each pass individually on `emulator-15008`. The grouped-navigation case verifies the representative `Match 3 of 3`, Previous/Next movement, active highlight, dismiss behavior, and ordinary-conversation stale-context clearing.
- iOS release: the full conversation-search suite passes `3/3` on iPhone 17, including the same grouped-navigation flow.
- Drawer safe-area follow-up: the focused Detox check passes `1/1` on Android (`closeFrame.y=105` px) and `1/1` on iOS (`closeFrame.y=78` pt); screenshots are captured in the latest Android and iOS artifacts.
- Local validation only: the local Firebase emulator `dev` flag was enabled for Detox; no QA or production flag/data was changed by this follow-up validation.
