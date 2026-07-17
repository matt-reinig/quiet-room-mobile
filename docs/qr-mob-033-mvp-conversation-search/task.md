# QR-MOB-033 – MVP Conversation Search

## Goal

Add a lightweight conversation search experience that lets authenticated users find previous conversations without introducing new infrastructure or changing the existing Firestore schema.

## Background

Quiet Room already stores conversations and messages in Firestore, but users cannot currently search their conversation history. At the app's current scale, fetching a user's existing messages and filtering them in memory should be a practical MVP and avoids the cost and complexity of SQL, RDS, a dedicated search service, or duplicated search data.

The implementation should be intentionally simple, while collecting enough performance information to show when this approach may need to evolve.

## Requirements

- First inspect the existing mobile, backend, and Firestore conversation-loading paths so the implementation fits the current architecture cleanly.
- Search only conversations belonging to the authenticated user.
- Reuse the current Firestore schema and existing data-access patterns.
- Fetch the user's existing messages and perform a case-insensitive substring search in memory.
- Group matching messages by conversation so each conversation appears once in the results.
- Show a useful snippet from a matching message, along with the existing title or timestamp information needed to identify the conversation.
- Include the identifiers needed to open the correct conversation from a search result.
- Define sensible behavior for empty and whitespace-only queries.
- Handle loading, errors, and no-results states.
- Support multiple matches within a conversation without producing duplicate conversation rows.
- Gate the mobile search UI and backend search endpoint behind the existing per-user feature-flag system using `conversation_search`, defaulting to off when the flag is missing or unavailable.

## Constraints

- Do not add SQL or RDS.
- Do not add Elasticsearch, OpenSearch, Algolia, or another search service.
- Do not change the Firestore schema.
- Do not duplicate or backfill conversation data.
- Do not add embeddings or semantic search.
- Keep the first implementation small and appropriate for the current product scale.
- When `conversation_search` is off, do not show or submit mobile search and do not read conversation documents through the backend search endpoint.

## Instrumentation

Add development logging or equivalent instrumentation for:

- Firestore fetch duration.
- Number of conversations fetched.
- Number of messages fetched and searched.
- In-memory filtering duration.
- Number of matching messages.
- Number of matching conversations.
- Total search duration.
- Errors and unexpectedly large result sets.

## Validation

- Search is case-insensitive.
- Partial-word and substring matches work.
- Results only include the authenticated user's conversations.
- Several matching messages in one conversation produce one conversation result.
- The displayed snippet comes from a matching message.
- Selecting a result opens the correct conversation.
- Empty, whitespace-only, loading, error, and no-results states behave correctly.
- Flag-off users do not see search, a direct search endpoint request is rejected before any conversation collection read, and flag-on users receive the complete search experience.
- The experience remains responsive against a representative account with approximately 350 conversations and 4,000–5,000 messages.
- Add focused automated tests for matching, casing, grouping, duplicate prevention, snippets, and empty-query behavior where practical.

## Documentation and Handoff

- Document where the search logic lives and why that location was chosen.
- Document the current scaling assumptions and the measurements collected during validation.
- Record the indicators that would justify moving to a dedicated search/indexing approach later.
- Update `docs/project-tracker.md` with the implementation branch, affected repositories, validation evidence, and final status as work progresses.

## Validation Evidence (2026-07-16)

- `npm run native:sync:local-qa` passed.
- Release Detox builds passed for Android (`android.att.release`) and iOS (`ios.sim.release`).
- The focused `e2e/quiet-room.conversation-search.test.js` passed 2/2 tests on Android `emulator-15008` and 2/2 tests on the iPhone 17 simulator.
- The Android rerun corrected a pagination-specific test assertion: after clearing search, `seed-conv-025` is the guaranteed first-page normal-list row, while the searched `seed-conv-005` conversation is intentionally older than that page.
- Validation used only local Firebase Auth/Firestore emulators and disposable seeded users; no representative QA account, QA flag, production data, schema, or infrastructure was changed.
- Passing Detox artifacts are in `artifacts/android.att.release.2026-07-16 05-20-16Z/` and `artifacts/ios.sim.release.2026-07-16 05-21-37Z/`. The representative QA performance measurement is documented below; live QA Lambda deployment remains a separate follow-up requiring AWS reauthentication.

## Representative QA Performance Evidence (2026-07-16)

- Ran the performance/navigation pass against the real QA project through the backend worktree at `127.0.0.1:5002`; the backend was not deployed because `aws sts get-caller-identity` reported an expired AWS session.
- Temporarily enabled `conversation_search` only for UID `b71cO4Azg8Sx2YofK5UFblMLCMk2` with percentage `0`, left production untouched, and restored the original QA flag document exactly after validation.
- Non-allowlisted direct search returned `404 feature_unavailable` before conversation reads. The target account baseline was 316 conversations, 5,909 messages, and 5,180,168 message characters; the before/after digest and counts were unchanged.
- Ten enabled searches were capped: four Android native, four iOS native, and two direct read-only payload checks. Backend fetch/filter/total min/median/max timings were 215.22/236.93/300.31 ms, 21.03/27.925/31.30 ms, and 247.43/295.17/376.19 ms. No oversized-result threshold was hit. Payload samples were 133,584 bytes for 315 results and 18 bytes for no results.
- Android `android.att.release` on `emulator-15008` passed 4/4 searches (3 result, 1 no-result), with end-to-end min/median/max of 6,817/11,800/12,052 ms. iOS `ios.sim.release` passed 4/4 (3 result, 1 no-result), with 2,256/7,309/7,383 ms. Both selected the expected existing conversation and returned to the message list.
- Artifacts: `artifacts/android.att.release.2026-07-16 06-14-04Z/` and `artifacts/ios.sim.release.2026-07-16 06-16-55Z/`.

## Success Criteria

1. An authenticated user can enter a search term and find existing conversations containing that text.
2. Matching is case-insensitive and supports substrings.
3. Results are grouped by conversation and include a useful matching snippet with the submitted term visibly highlighted in the result title or snippet.
4. Selecting a result opens the correct conversation.
5. No database schema or infrastructure changes are required.
6. Search timing and result-volume metrics are visible during development and validation.
7. Performance is acceptable against the representative 350-conversation / 4,000–5,000-message account.
8. Relevant automated tests pass and manual QA steps are documented.
9. The feature defaults off and can be enabled for a QA allowlist without a new mobile build or backend deploy.

## Accepted Post-MVP UX Follow-up

Preserve one grouped result row per conversation. Highlight every case-insensitive occurrence of the submitted term in the result title/snippet. When the user selects a result, open the conversation at the exact representative matching message, visibly highlight the submitted search term in that active message, and provide Previous/Next navigation through the conversation's other matching messages without additional Firestore reads. The open Conversations drawer must also keep its header and list content inside the device safe areas on Android and iOS. The implementation-ready plan is `docs/qr-mob-033-mvp-conversation-search/match-navigation-plan.md`.

## Accepted Mobile Cache Follow-up

Use TanStack Query as the app-level in-memory server-state cache for feature flags, model catalog, conversation list/detail/search reads, and registered-user AI consent. Scope every key by Firebase UID, clear the prior UID on identity transitions, and invalidate conversation list/detail/search keys after send, rename, or delete. Keep chat/audio streaming and fire-and-forget telemetry on their existing transports. Repeated identical searches may be reused for two minutes and must not create another Firestore read while fresh. The implementation and validation plan is `docs/qr-mob-033-mvp-conversation-search/frontend-cache-plan.md`.
