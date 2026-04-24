# Quiet Room Data Inventory

Last updated: April 21, 2026

Purpose:

- provide one reviewed source of truth for privacy-policy updates
- ground Play Data safety and App Privacy answers in current implementation
- document what account deletion covers in the backend and mobile app

Task 12 status:

- refreshed for the public privacy-policy and account-deletion site update
- incorporates the implemented AI-consent, account-deletion, and operational-logging decisions from the privacy-v2 workstreams
- uses 90 days as the operational-log retention policy and documents that operational logs are not individually deleted during account deletion

Reviewed sources:

- mobile app auth, chat, consent, account-deletion, and voice code in `quiet-room-mobile/src/*`
- Gabriel backend auth, account, conversation, AI-consent, profile, voice, and logging code in `../Gabriel/*` and the active privacy task worktrees
- privacy planning docs in `docs/privacy-v2/*`

## Current-State Summary

This inventory reflects the implemented Quiet Room behavior that the public policy must describe.

Important current truths:

- Quiet Room creates an anonymous Firebase Auth session by default.
- Users can sign in or create accounts with email/password, Google, and, on iOS, Apple sign-in.
- Chat messages are blocked before first AI-sharing consent. Anonymous consent is stored locally on device; signed-in consent is persisted in the backend user document through `GET/PUT /api/account/ai-consent`.
- Conversation content, selected context, and derived profile/memory data are sent to OpenAI for chat generation and text-to-speech when a user consents and sends content.
- Conversation history and derived profile/memory data are stored in Firestore under `users/{uid}` for authenticated API requests. Registered accounts can list and revisit conversation history in the app.
- In-app account deletion exists for signed-in accounts from the profile icon menu through `Delete Account`.
- Backend `DELETE /api/account` deletes known Firestore user data and then deletes the Firebase Auth user.
- Operational logs are metadata-first, retained for up to 90 days in deployed logging, and are not generally deleted individually when an account is deleted.

## Storage Map

### Firebase Auth

- Anonymous auth user: created automatically on first app launch if no session exists
- Registered auth user: email/password, Google, or Apple
- Device persistence: Firebase Auth session persisted locally via `AsyncStorage`

### Firestore

- User document:
  - `users/{uid}`
  - may include account-adjacent backend state such as `aiConsent`
- Conversations:
  - `users/{uid}/conversations/{conversationId}`
- Memory documents:
  - `users/{uid}/memories/{memoryId}`
- Legacy profile:
  - `users/{uid}/meta/spiritual_profile`
- Legacy profile snapshots:
  - `users/{uid}/meta/profile_*`
- Split-memory profile docs:
  - `users/{uid}/meta/spiritual_profile_core`
  - `users/{uid}/meta/spiritual_profile_recent`
  - `users/{uid}/meta/spiritual_profile_meta`
  - `users/{uid}/meta/spiritual_profile_history/entries/{entryId}`
- Feature-flag config:
  - `feature_flags/{env}/flags/{flagName}`
  - note: this is admin configuration, not standard app-collected user content, but some flags may target specific user UIDs

### Device / transient storage

- Firebase Auth session tokens in `AsyncStorage`
- Anonymous AI-consent flag in `AsyncStorage`
- Signed-in AI-consent cache in `AsyncStorage`, mirrored from backend state
- Temporary MP3 voice playback files in the Expo cache directory under `quiet-room-voice/`
- In-memory chat state and streaming buffers inside the app process

### Operational logs

- Backend structured logs written via `gabriel.logging.make_log_event(...)`
- Local/dev sink: file path from `BACKEND_LOG_PATH`
- Deployed sink: CloudWatch or equivalent platform logging
- Production posture: metadata-first, with known content preview fields dropped unless a non-production debug override is explicitly enabled

## Inventory Matrix

| Data Type | Collected | Stored | Shared | With Who | Purpose | Retention | Deletion |
|---|---|---|---|---|---|---|---|
| Firebase Auth account data: UID, email, display name, provider, anonymous status | Yes | Yes | Yes | Firebase Authentication | Sign-in, account persistence, identify the user to the backend | Until the auth account is deleted; local session persists until sign-out, account deletion, or app data clear | Signed-in account deletion calls `DELETE /api/account`, then deletes the Firebase Auth user. Sign-out clears the registered local session and starts a new anonymous session. |
| Firebase ID tokens / auth session artifacts | Yes | Yes | Yes | Firebase Authentication and Quiet Room backend | Authenticate API requests | Device-local until sign-out, token refresh, account deletion, or app data clear | Cleared or replaced locally after sign-out/account deletion; backend does not persist the raw token as application data. |
| AI-sharing consent state | Yes | Yes | Limited | Quiet Room backend and Firestore for signed-in users; local device storage for anonymous users | Record whether the user consented to sending message content to the AI service | Signed-in consent is stored with the user document until account deletion; anonymous consent remains local until app data is cleared or the consent flag is reset | Deleted with the user document during account deletion for signed-in accounts; anonymous local consent can be removed by clearing app data. |
| Conversation messages: user prompts and assistant replies | Yes | Yes for authenticated API sessions; registered users can list and revisit history in the app | Yes | Quiet Room backend, Firestore, OpenAI | Deliver chat, reload history for signed-in users, generate future responses | Account-linked product data is retained until the conversation or account is deleted unless otherwise stated | Individual conversations can be deleted through `DELETE /api/conversations/{conversationId}`. Signed-in account deletion deletes conversation documents under `users/{uid}`. |
| Conversation metadata: conversation ID, title, createdAt, updatedAt, currentModel | Yes | Yes | Limited | Quiet Room backend and Firestore | List conversations, restore state, show titles, keep model selection consistent | Stored with the conversation until conversation or account deletion | Deleted with the conversation document or signed-in account deletion. |
| Anonymous-session flag on conversations (`isAnon`) | Yes | Yes when the conversation is saved from an anonymous session | No external sharing beyond normal backend processing | Quiet Room backend and Firestore | Distinguish anonymous history from authenticated history in storage | Stored with the conversation document while that document exists | Deleted if the related conversation document or associated user document is deleted. |
| Timezone metadata (`tzOffsetMinutes`) attached to chats and profile records | Yes | Yes | Yes | Quiet Room backend, Firestore, OpenAI | Add local-time context to prompts and profile updates | Stored with conversations and profile records while those records exist | Deleted when related conversation/profile records are deleted. |
| Derived spiritual profile (`spiritual_profile`) | Yes, derived from conversation content | Yes | Yes | Quiet Room backend, Firestore, OpenAI | Personalize future replies and maintain continuity across sessions | Account-linked product data retained until account deletion; no standalone automatic pruning limit in code | Deleted during signed-in account deletion. Some stale pointers are also cleaned when an individual conversation is deleted. |
| Legacy profile snapshots (`meta/profile_*`) | Yes, derived from conversations | Yes | Yes | Quiet Room backend, Firestore, OpenAI | Preserve historical profile snapshots for profile-builder context | Account-linked product data retained until account deletion | Deleted during signed-in account deletion. |
| Split-memory profile docs (`spiritual_profile_core`, `spiritual_profile_recent`, `spiritual_profile_meta`) | Feature-flag dependent, derived from conversations | Yes | Yes | Quiet Room backend, Firestore, OpenAI | Store long-term and recent inferred context for future personalization | Account-linked product data retained until account deletion | Deleted during signed-in account deletion. |
| Split-memory history entries (`spiritual_profile_history/entries/*`) | Feature-flag dependent, derived from conversations | Yes | Yes | Quiet Room backend, Firestore, OpenAI | Track memory/profile evolution over time | Account-linked product data retained until account deletion | Deleted during signed-in account deletion. |
| Memory documents (`users/{uid}/memories/*`) | Feature-dependent, derived from conversations | Yes | Yes when used for AI context | Quiet Room backend, Firestore, OpenAI | Preserve user-linked memory/context for future personalization | Account-linked product data retained until account deletion | Deleted during signed-in account deletion. |
| Voice request text for TTS: direct text or saved assistant message content | Yes | Not as a dedicated voice record | Yes | Quiet Room backend and OpenAI TTS | Generate playable voice audio for assistant text | Transient for the voice request itself; source content may still exist in conversations and operational metadata logs | No separate voice-record deletion because the endpoint does not persist a standalone voice artifact. Source conversation content is deleted with conversation/account deletion. |
| Temporary voice playback files on device | Yes | Yes, device cache only | No | Local device only | Playback assistant audio | Cache lifetime only; files are removed after cleanup or when the OS clears cache | Deleted locally during cleanup or by OS cache eviction; users can also clear app data. |
| Feature-flag evaluation context tied to a UID | Yes | Yes, if a UID is manually allowlisted in Firestore admin config | No end-user third-party sharing | Quiet Room backend and Firestore | Enable or disable features for rollout control | Until admin config changes | Removed when the flag configuration is edited; not part of standard user-facing account deletion. |
| Operational logs: UID, conversation ID, model, token usage, status/error category, request metadata, message/profile/assistant lengths, and operational timing | Yes | Yes | Yes | Backend logging sink such as CloudWatch or equivalent platform logging | Diagnostics, security review, incident response, recent usage debugging, account/support operations | Deployed operational logs are retained for up to 90 days and then expire automatically. Local/dev logs persist until manually rotated or deleted. | Not generally deleted individually as part of conversation or account deletion; log entries may remain until the 90-day retention window expires. Production logs are metadata-first and should not duplicate conversation content as the primary support/debugging record. |

## External Sharing Map

### Firebase

- Firebase Authentication receives:
  - account identifiers
  - credentials and provider metadata
  - session lifecycle data
- Firestore stores:
  - conversation records
  - profile/memory records
  - signed-in AI-consent state
  - related account-linked backend state

### OpenAI

- Chat endpoint sends:
  - current conversation context
  - prior message excerpts used for context
  - derived spiritual profile/memory context
  - timezone-derived prompt metadata
  - requested model selection
- Voice endpoint sends:
  - text to synthesize as audio
- Profile builder sends:
  - conversation transcript text
  - existing profile / snapshot context
  - split-memory history context when enabled

Quiet Room shows an AI-sharing consent prompt before the first message send. If the user does not consent, the pending message is not sent.

### Logging sink

- Backend structured logs may include:
  - UID
  - conversation ID
  - model names
  - token usage
  - status/error details
  - request timing and counts/lengths
- Production-oriented logs should not include:
  - raw request or response bodies
  - full prompts
  - assistant replies
  - profile text
  - TTS input text
  - content preview fields such as `last_user_message`, `profile_preview`, or `text_preview`

## Deletion Notes

What exists now:

- signed-out local cleanup that returns the app to an anonymous session
- individual conversation deletion
- first-send AI-sharing consent gate
- backend AI-consent persistence for signed-in users
- backend `DELETE /api/account`
- in-app signed-in account deletion from the profile icon menu via `Delete Account`
- deletion of known Firestore user data:
  - `users/{uid}` user document
  - `users/{uid}/conversations/*`
  - `users/{uid}/memories/*`
  - `users/{uid}/meta/*`
  - `users/{uid}/meta/spiritual_profile_history/entries/*`
- deletion of the Firebase Auth user

Expected account-deletion result:

- the signed-in Firebase Auth user is deleted
- known account-linked conversation, profile, memory, and AI-consent data under `users/{uid}` is deleted
- the mobile app resets to a new anonymous session after deletion succeeds

Remaining deletion exceptions:

- operational logs are not individually deleted and may remain until the 90-day retention window expires
- device cache or local app data may remain until app cleanup, OS cache eviction, uninstall, or manual app-data clearing
- admin-managed feature-flag allowlists that manually reference a UID are not part of the standard account-deletion endpoint and must be handled administratively if needed

## Support / Debugging Access Rule

Quiet Room does not rely on operational logs as the primary place to review conversation content.

If user-content review is needed for support or debugging, review should be scoped to the relevant account/conversation data in Firestore or equivalent canonical product storage. Operational logs should be used to locate request IDs, conversation IDs, timing, model, status, and error categories, not as a second archive of user conversations.

## Store / Reviewer Wording Inputs

- Privacy policy URL: `https://quiet-room-privacy-policy.vercel.app/privacy`
- Account deletion URL: `https://quiet-room-privacy-policy.vercel.app/account-deletion`
- Support URL: `https://quiet-room-privacy-policy.vercel.app/support`
- In-app account deletion path: open Quiet Room, tap the profile icon, choose `Delete Account`, then confirm.
- AI disclosure/consent: Quiet Room shows an AI-sharing consent prompt before the first message is sent to the AI service. If the user chooses `Not now`, the message is not sent.
- Operational logs: deployed operational logs are metadata-first, retained for up to 90 days, and not generally deleted individually when an account is deleted.
