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

## Constraints

- Do not add SQL or RDS.
- Do not add Elasticsearch, OpenSearch, Algolia, or another search service.
- Do not change the Firestore schema.
- Do not duplicate or backfill conversation data.
- Do not add embeddings or semantic search.
- Keep the first implementation small and appropriate for the current product scale.

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
- The experience remains responsive against a representative account with approximately 350 conversations and 4,000–5,000 messages.
- Add focused automated tests for matching, casing, grouping, duplicate prevention, snippets, and empty-query behavior where practical.

## Documentation and Handoff

- Document where the search logic lives and why that location was chosen.
- Document the current scaling assumptions and the measurements collected during validation.
- Record the indicators that would justify moving to a dedicated search/indexing approach later.
- Update `docs/project-tracker.md` with the implementation branch, affected repositories, validation evidence, and final status as work progresses.

## Success Criteria

1. An authenticated user can enter a search term and find existing conversations containing that text.
2. Matching is case-insensitive and supports substrings.
3. Results are grouped by conversation and include a useful matching snippet.
4. Selecting a result opens the correct conversation.
5. No database schema or infrastructure changes are required.
6. Search timing and result-volume metrics are visible during development and validation.
7. Performance is acceptable against the representative 350-conversation / 4,000–5,000-message account.
8. Relevant automated tests pass and manual QA steps are documented.
