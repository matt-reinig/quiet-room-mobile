# QR-MOB-033 – Mobile Server-State Cache

## Status

- Implementation status: complete in the QR-MOB-033 mobile worktree; TypeScript and focused cache validation pass
- Package: TanStack Query (`@tanstack/react-query`)
- Persistence: memory only; no server response is written to device storage
- Identity boundary: every server-state key is scoped by Firebase UID and the previous UID's cache is removed on logout, login, account deletion, or anonymous recovery
- Rollout boundary: conversation search remains gated by `conversation_search`; the shared cache is behavior-preserving infrastructure and does not expose a new product surface
- Native validation: the focused iOS search suite passes 4/4; Android release build/sync pass, but the focused Android rerun remains required because the local emulator was blocked by repeated system-app ANRs

## Decision

Use one app-level `QueryClientProvider` and a centralized UID-scoped key factory. Adopt the cache for reusable request/response reads while preserving the transports that have different semantics.

TanStack Query owns:

- feature flags;
- model catalog;
- first and subsequent conversation-list pages;
- conversation details;
- submitted conversation searches;
- registered-user AI consent.

The existing specialized flows remain outside the query cache:

- streaming chat via Fetch/XHR and incremental rendering;
- streamed voice/audio playback;
- fire-and-forget client events;
- report submission and account deletion request bodies;
- React component state and anonymous consent in `AsyncStorage`.

This is intentionally an in-memory session cache. Persisting conversation or search data across process restarts would add sensitive-data retention, migration, and encryption decisions that are not required for the performance problem.

## Cache Policy

| Data | Key shape | Freshness | Invalidation/removal |
| --- | --- | ---: | --- |
| Feature flags | `user / uid / feature-flags` | 30 seconds | Explicit `refresh()` invalidates before fetching; UID transition removes |
| Model catalog | `user / uid / model-catalog` | 30 seconds | Feature-flag refresh invalidates; UID transition removes |
| Conversation pages | `user / uid / conversations / page / cursor` | 30 seconds | Send, rename, and delete invalidate the page prefix |
| Conversation detail | `user / uid / conversation / id` | 30 seconds | Send and rename invalidate; delete removes |
| Conversation search | `user / uid / conversation-search / case-and-whitespace-normalized-query` | 2 minutes | Send, rename, and delete invalidate all searches; entries are garbage-collected after 15 minutes |
| AI consent | `user / uid / ai-consent` | 5 minutes | Successful consent writes update the cached value immediately |

Automatic refetch on mount, focus, and reconnect is disabled. Mobile screen transitions and app foregrounding therefore do not create surprise Firestore search reads. Failed conversation searches are not automatically retried, preserving the explicit-search/read-cost boundary.

## Mutation Consistency

- A completed streamed response invalidates the current detail, all list pages, and all searches for the resolved UID.
- Rename invalidates the renamed detail, list pages, and searches after the local optimistic title update.
- Delete removes the detail and invalidates list pages and searches after the local removal.
- Consent PUT updates the corresponding consent query after the backend and local fallback writes succeed.
- Authentication transitions remove all query entries under the previous UID before the new identity can reuse server state.
- Query functions consume TanStack Query's cancellation signal, so removing an old UID also aborts its in-flight HTTP reads; request guards prevent token-resolution races from starting a removed old-UID query afterward.
- A manual feature-flag refresh also invalidates the model catalog because the available backend-owned model set depends on current flag state.

## Validation

- `npm run typecheck`
- Focused query-client smoke proving that two fresh reads of one key execute the fetch once, case/whitespace-normalized search keys are stable, removing one UID clears only that user's entries, another UID's entry remains intact, and removing an in-flight old-UID query aborts it without restoring cached data
- `npm run mobile:verify:local-qa`
- Expo production bundle for Android and iOS
- Focused iOS conversation-search Detox journeys: 4/4 passing in `artifacts/ios.sim.release.2026-07-17 03-52-47Z/`, covering flag-off behavior, safe areas, search/open/clear, grouped message jumps, highlighting, and Previous/Next
- Android release bundle, native sync, and Detox build pass. The focused Android run remains outstanding: `artifacts/android.att.release.2026-07-17 03-53-29Z/` records a local emulator failure caused by Digital Wellbeing, followed by a System UI ANR after reboot, rather than an app assertion or React Native failure
- Before QA promotion, rerun the focused Android journey on a healthy emulator and capture one repeated identical search with instrumentation showing `cacheHit: true`

## Definition of Done

- All reusable authenticated mobile GET paths use the shared QueryClient.
- Cache entries cannot cross Firebase UID boundaries.
- Conversation mutations cannot leave list, detail, or search results silently fresh.
- Streaming and audio behavior are unchanged.
- Conversation search remains feature-flagged and explicit; cached repeat searches do not add Firestore reads.
- TypeScript, bundle, focused cache, and iOS native search validation pass; a healthy Android native rerun is the remaining QA-promotion gate.
