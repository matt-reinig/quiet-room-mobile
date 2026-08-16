# QR-MOB-033 – MVP Conversation Search Plan

## Status

- Planning status: ready for implementation
- Implementation status: search and match navigation complete and confirmed live on QA by the product owner; app-wide mobile server-state cache implemented locally with native QA promotion pending
- Mobile branch: `codex/qr-mob-033-mvp-conversation-search`
- Mobile worktree: `../worktrees/quiet-room-mobile-qr-mob-033-mvp-conversation-search`
- Backend branch: `codex/qr-mob-033-mvp-conversation-search-backend`
- Backend worktree: `../worktrees/Gabriel-qr-mob-033-mvp-conversation-search`
- Backend base: the current `origin/develop-from-main`; create and verify this separate worktree before any Gabriel edits
- Database boundary: read existing conversation documents only; do not change the Firestore schema, backfill data, or mutate the representative QA account
- Feature flag: `conversation_search`, evaluated per authenticated UID and defaulting to off in every environment

### Implementation handoff

- Mobile implementation is in `../worktrees/quiet-room-mobile-qr-mob-033-mvp-conversation-search`.
- Backend implementation is in `../worktrees/Gabriel-qr-mob-033-mvp-conversation-search` on `codex/qr-mob-033-mvp-conversation-search-backend`.
- Backend contract validation passes with 19 tests; mobile TypeScript validation passes with `npm run typecheck`.
- The focused Detox spec at `e2e/quiet-room.conversation-search.test.js` passed on the rebuilt local-QA Android and iOS targets on 2026-07-16. The capped representative QA performance/navigation pass also passed against the real QA account through the local backend branch; the backend was not deployed because the AWS session had expired.
- Post-MVP UX feedback is captured in `docs/qr-mob-033-mvp-conversation-search/match-navigation-plan.md`: preserve grouped results, jump to the representative message, highlight the submitted term, and navigate additional matches with Previous/Next controls.
- The accepted cache follow-up is implemented as documented in `docs/qr-mob-033-mvp-conversation-search/frontend-cache-plan.md`: TanStack Query caches reusable reads in memory, scopes all authenticated keys by UID, and invalidates conversation state after mutations while leaving chat/audio streaming unchanged.

## Worktree and Repository Boundary

QR-MOB-033 is a two-repository implementation and must remain split across two isolated worktrees:

| Repository | Worktree | Branch | Scope |
| --- | --- | --- | --- |
| `quiet-room-mobile` | `../worktrees/quiet-room-mobile-qr-mob-033-mvp-conversation-search` | `codex/qr-mob-033-mvp-conversation-search` | Native search UI, mobile request/state wiring, navigation, test IDs, and Detox coverage |
| `Gabriel` | `../worktrees/Gabriel-qr-mob-033-mvp-conversation-search` | `codex/qr-mob-033-mvp-conversation-search-backend` | Authenticated search endpoint, Firestore read/filter logic, aggregate instrumentation, and pytest coverage |

Do not implement backend files in the mobile worktree or reuse the dirty primary Gabriel checkout. The backend worktree is the first implementation setup step; it is not required merely to finish this planning handoff.

## Architecture Findings

The current mobile and backend paths make server-side in-memory filtering the smallest complete MVP:

1. `src/hooks/useChatController.ts` initially requests `GET /api/conversations`, which returns only a 20-item metadata page. It fetches `GET /api/conversations/<id>` only after a conversation is selected.
2. The mobile state therefore does not contain all historical messages. Searching only hydrated mobile state would silently miss older conversations, while fetching every detail endpoint would create hundreds of requests.
3. `gabriel_routes/conversations.py` already authenticates each request and scopes reads to `users/{uid}/conversations`. Each conversation document contains its `messages` array.
4. A single authenticated backend endpoint can stream that user's conversation documents once, filter their embedded messages in memory, and return compact grouped results. The app can then use the existing detail endpoint when a result is opened.

Decision: add an authenticated backend search endpoint and keep the mobile app responsible for query entry, display state, and navigation only. Do not download the complete message corpus to the device.

## Representative QA Baseline

On 2026-07-15, a read-only aggregate measurement used QA project `gabriel-qa-89f20` and UID `b71cO4Azg8Sx2YofK5UFblMLCMk2`. No message text was printed or retained, and no writes were performed.

| Measurement | Result |
| --- | ---: |
| Conversation documents fetched | 316 |
| Firestore document reads per full search | 316 |
| Searchable messages | 5,909 |
| Message text characters | 5,180,168 |
| One local Firestore fetch | 734.8 ms |
| Median in-memory case-insensitive filter, common term | 10.863 ms |
| Median in-memory case-insensitive filter, no-match term | 11.265 ms |

The baseline is slightly larger than the task's 4,000–5,000-message target. Filtering is inexpensive relative to fetching, so the MVP should minimize full-history fetch frequency and return only grouped result summaries. One submitted search on this account currently means approximately 316 Firestore document reads, not 5,909 reads, because messages are embedded in each conversation document.

## Product Behavior

- Search appears inside the existing authenticated Conversations modal.
- The search controls render only when `conversation_search` is enabled. Missing flags, feature-flag load failures, and explicit false values all preserve the current conversations experience with no search UI.
- Use an explicit Search action and keyboard submit instead of querying on every keystroke. This keeps Firestore reads predictable.
- Trim the query before submission. An empty or whitespace-only query performs no request and shows the ordinary conversation list.
- While a non-empty search is active, show dedicated loading, error, no-results, and results states.
- Each result appears once per conversation and shows the existing title, updated timestamp, a snippet from the most recent matching message, and optionally the aggregate match count when it is greater than one.
- Matching uses Unicode-aware case folding and substring matching. Partial words are valid.
- Selecting a result closes the modal, registers the result's conversation summary in controller state if it was outside the loaded 20-item page, sets it active, and lets the existing conversation-detail request load its messages.
- Clearing search restores the normal paginated conversation list without discarding already loaded conversation state.

## Backend Implementation

Affected repository: `Gabriel`.

1. Add `GET /api/conversations/search?q=<query>` in `gabriel_routes/conversations.py` or a small adjacent search module used by that blueprint.
2. Authenticate with the existing `verify_token(request)` dependency, then evaluate `is_feature_enabled("conversation_search", uid, default=False)` before constructing or streaming the conversation query.
3. Return a stable feature-unavailable response when the flag is off. The flag-off path must perform zero reads from `users/{uid}/conversations`.
4. When enabled, read only `users/{uid}/conversations`.
5. Validate and trim `q`; reject missing/blank queries and cap query length to a documented safe maximum.
6. Extract matching and snippet construction into pure functions:
   - ignore malformed messages and non-string content;
   - compare `query.casefold()` with `content.casefold()`;
   - count every matching message;
   - emit one result per conversation;
   - create a whitespace-normalized, bounded snippet centered around the match;
   - choose the most recent matching message within each conversation;
   - sort grouped results by `updatedAt` descending with a deterministic ID tie-breaker.
7. Return only compact fields needed by mobile: `id`, `title`, `createdAt`, `updatedAt`, `snippet`, and `matchCount`. Do not return complete message arrays.
8. Inject the existing `log_event` dependency into the conversations blueprint and emit an aggregate `conversation_search` event containing fetch duration, filter duration, total duration, conversation/message/character counts, matching-message and matching-conversation counts, and an oversized-result indicator. Never log the query or message/snippet text; query length is sufficient.
9. Log flag-denied requests and failures with the same content-free aggregate boundary. Establish documented warning thresholds initially around 500 conversations, 10,000 messages, 10 million characters, or two seconds total, then revise them from QA evidence.

The endpoint returns `404 {"code":"feature_unavailable"}` before opening the user conversation collection when the flag is off, `400 {"code":"invalid_query"}` for missing, blank, or overlong queries, and `500 {"code":"search_failed"}` for a Firestore stream failure. Successful responses contain only an `items` array of grouped summaries.

## Mobile Implementation

Affected repository: `quiet-room-mobile`.

1. Add `conversation_search` to `SUPPORTED_FEATURE_FLAGS` in `src/lib/featureFlags.ts` and read it with `useFeatureFlag("conversation_search", false)`.
2. Add a `ConversationSearchResult` type alongside the existing conversation types.
3. Add a focused `useConversationSearch` hook for the authenticated request and search state rather than expanding the already large `useChatController` networking surface. The hook must be disabled/reset when the flag is false and must not submit a search request in that state.
4. Extend `useChatController` with one narrow `openConversation` operation that can merge a search-result summary into `ConversationsById` before setting `currentId`. Reuse it for ordinary list selection and search-result selection.
5. Extend `ConversationsModal.tsx` with:
   - a labeled search input, submit action, and clear action;
   - result rows with title, timestamp, snippet, and optional match count;
   - accessible labels and stable test IDs;
   - explicit loading, error, no-results, and blank-query behavior;
   - separation between normal pagination and search results so scrolling search results does not trigger `loadMoreConversations`.
6. Wire the flag, search hook, and `openConversation` through `QuietRoomScreen.tsx`. Reset transient search state when the flag turns off or the authenticated user changes; decide during implementation whether closing/reopening the modal preserves the last query, with reset-on-user-change required.
7. Add client-side request-duration logging for end-to-end latency without logging the query text or returned snippet content.

## Tests and Validation

### Backend automated tests

Extend the existing conversation blueprint contract tests to cover:

- authentication and per-UID collection scoping;
- flag-off rejection before any conversation collection stream and flag-on access;
- case-insensitive and partial-word matches;
- multiple matching messages grouped into one conversation result;
- match counts and deterministic result ordering;
- snippets containing the matched text and obeying the length bound;
- malformed messages ignored safely;
- empty, whitespace-only, overlong, no-result, and Firestore-error behavior;
- aggregate instrumentation fields with no query or message content;
- proof that the endpoint performs one collection stream and no writes.

### Mobile automated tests

- Keep matching/grouping correctness primarily in backend unit tests because that is where the logic lives.
- Add focused tests for response normalization and blank-query behavior if those are extracted as pure mobile helpers.
- Use the repo's current native E2E runner, Detox, rather than Playwright. Playwright is appropriate only for an optional Expo web validation and is not the native mobile oracle.
- Add `e2e/quiet-room.conversation-search.test.js`, building on `e2e/quiet-room.conversations-menu.test.js` and the shared login/backend helpers.
- Add stable search input, submit, clear, status, result-row, and snippet test IDs to `src/testIds.ts` and `e2e/testIds.js`.
- Run at least these two native search journeys on both Android and iOS:
  1. Submit a mixed-case partial query whose fixture has multiple matching messages in one older conversation; assert one result row, a matching snippet, then tap it and prove the correct conversation opens even though it was outside the initial 20-item page.
  2. Submit a no-match query and assert the no-results state, then clear search and prove the ordinary paginated conversation list returns.
- Cover whitespace-only/no-request, request failure/retry, loading, grouping counts, and deterministic sorting in focused lower-level tests so the native E2E remains small and reliable.
- Add a flag-off Detox assertion proving the search controls are absent, then launch with the existing feature-flag override for `conversation_search: true` to run the search journeys. Backend contract tests separately prove a direct flag-off endpoint request cannot read conversations.
- Use local/test-support seeded users for deterministic E2E data. Do not change the `b7…` account as part of automated setup.

Suggested focused native commands after local-QA sync/build:

```bash
E2E_API_BASE=http://127.0.0.1:5002 bash ./scripts/with-mobile-env.sh qa local \
  npx detox test -c android.att.release e2e/quiet-room.conversation-search.test.js \
  --record-logs all --take-screenshots all

E2E_API_BASE=http://127.0.0.1:5002 bash ./scripts/with-mobile-env.sh qa local \
  npx detox test -c ios.sim.release e2e/quiet-room.conversation-search.test.js \
  --record-logs all --take-screenshots all
```

The exact attached Android emulator configuration may be adjusted to the available device, but the focused spec and Android/iOS parity requirement remain fixed.

### Native validation evidence (2026-07-16)

- Environment: local Firebase Auth emulator `127.0.0.1:9099`, local Firestore emulator `127.0.0.1:8080`, and the backend worktree running at `127.0.0.1:5002`. The `conversation_search` flag and all disposable E2E users/conversations were created only in the local emulators; no QA or production Firestore writes were made.
- Native preparation: `npm run native:sync:local-qa` passed, including Detox Android Gradle wiring, iOS pods, and QA signing configuration.
- Android build: `bash ./scripts/with-mobile-env.sh qa local npx detox build -c android.att.release` passed (`BUILD SUCCESSFUL`, 842 tasks).
- iOS build: `bash ./scripts/with-mobile-env.sh qa local npx detox build -c ios.sim.release` passed (`** BUILD SUCCEEDED **`).
- Android Detox: `android.att.release` on `emulator-15008` passed 2/2 tests (74.044 seconds) on the rerun. The first run exposed only an invalid test assumption: `seed-conv-005` is outside the initial paginated list; the focused spec now asserts the newest seeded `seed-conv-025` row after clear.
- iOS Detox: `ios.sim.release` on iPhone 17 (`7FC81BB9-2A0C-4F31-AEFD-3281BC112EFB`) passed 2/2 tests (23.781 seconds).
- Artifacts: `artifacts/android.att.release.2026-07-16 05-20-16Z/` and `artifacts/ios.sim.release.2026-07-16 05-21-37Z/` contain Detox logs, traces, screenshots, and device logs for the passing runs.

### Representative QA performance pass (2026-07-16)

- The pass used UID `b71cO4Azg8Sx2YofK5UFblMLCMk2` read-only against the QA project through the backend worktree running locally at `127.0.0.1:5002`. AWS preflight failed with an expired session, so the backend branch was not deployed to the live QA Lambda.
- A temporary QA `conversation_search` flag was enabled only for the target UID with `percentage=0`; production remained untouched. The original flag document was restored exactly after the run.
- The non-allowlisted authenticated request returned `404 feature_unavailable`, and the denied event recorded zero conversation/message reads.
- The account baseline was 316 conversation documents, 5,909 messages, and 5,180,168 message characters. The run submitted ten enabled searches total: four Android, four iOS, and two direct read-only payload checks.
- Backend aggregate timings across ten searches were: Firestore fetch 215.22/236.93/300.31 ms (min/median/max), in-memory filter 21.03/27.925/31.30 ms, and total 247.43/295.17/376.19 ms. No search crossed the oversized-result thresholds. Search payload samples were 133,584 bytes for 315 grouped results and 18 bytes for no results.
- Android `android.att.release` on `emulator-15008` passed four searches with three result states and one no-results state; end-to-end search timings were 6,817/11,800/12,052 ms (min/median/max). iOS `ios.sim.release` passed four searches with the same state distribution; timings were 2,256/7,309/7,383 ms.
- Each native run selected the expected existing result, closed the modal, and returned to the message list. A before/after content digest and aggregate counts confirmed the QA conversation data was unchanged.
- Performance artifacts: `artifacts/android.att.release.2026-07-16 06-14-04Z/` and `artifacts/ios.sim.release.2026-07-16 06-16-55Z/`.

## Scaling Decision Gates

Keep this MVP while representative total latency remains responsive and per-search reads are acceptable. Revisit a dedicated index only when measured evidence shows one or more of:

- full-history fetch latency repeatedly exceeds the documented two-second warning threshold;
- accounts materially exceed the initial 500-conversation / 10,000-message envelope;
- search frequency makes full collection reads operationally expensive;
- document payload growth approaches Firestore or mobile/backend memory constraints;
- product requirements expand to typo tolerance, ranking, semantic search, or cross-field search.

## Delivery Sequence

1. Create `../worktrees/Gabriel-qr-mob-033-mvp-conversation-search` on branch `codex/qr-mob-033-mvp-conversation-search-backend` from the current `origin/develop-from-main`; verify its baseline before editing.
2. Add the authenticated, `conversation_search`-gated endpoint, pure matcher/snippet helpers, structured instrumentation, and backend tests in that backend worktree.
3. Add mobile flag support, search types/state, Conversations modal UI, and the safe open-result controller path.
4. Run backend tests, mobile typecheck/config verification, and focused lower-level tests.
5. Regenerate local-QA native projects and run the focused Detox search spec on Android and iOS against deterministic seeded data.
6. Deploy only to QA when explicitly requested and AWS credentials are valid; the capped read-only `b7…` performance and navigation pass is complete locally against real QA data.
7. Record aggregate measurements and Detox artifacts here, update `docs/project-tracker.md`, and leave production/indexing work out of scope.

Implementation and local native validation complete steps 1–5. Step 6 remains the explicitly requested QA deployment/performance-measurement handoff.

## Definition of Done

- Authenticated substring search returns compact, grouped conversation results from the current Firestore schema.
- Blank, loading, error, no-results, clear, and result-selection flows work accessibly on Android and iOS.
- Searches cannot cross UID boundaries and do not write to Firestore.
- With `conversation_search` missing/off, the current mobile experience is unchanged and the backend search path performs no conversation reads.
- QA allowlisting can enable search for the designated user while non-allowlisted users and prod remain off.
- Focused backend and mobile tests pass.
- Read counts, payload size, fetch/filter/total timing, and scaling thresholds are documented from representative QA validation; live QA deployment remains the only outstanding release step.
- Tracker notes identify both repository branches, verification evidence, and final status.
