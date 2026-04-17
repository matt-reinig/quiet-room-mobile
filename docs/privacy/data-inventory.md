# Quiet Room Data Inventory

Last updated: April 17, 2026

Purpose:

- provide one reviewed source of truth for privacy-policy updates
- ground Play Data safety and App Privacy answers in current implementation
- document what account deletion must cover in the backend and mobile app

Task 01 status:

- implemented and ready for review
- only remaining follow-up for final disclosure wording: confirm the deployed backend operational-log retention period in days from infra/ops and replace the current placeholder gap note

Reviewed sources:

- mobile app auth, chat, and voice code in `quiet-room-mobile/src/*`
- Gabriel backend auth, conversation, profile, voice, and logging code in `../Gabriel/*`
- privacy planning docs in `docs/privacy-v2/*`

## Current-State Summary

This inventory reflects the code that exists today, not the intended future state.

Important current truths:

- Quiet Room creates anonymous Firebase Auth sessions by default and upgrades some users to email/password or Google sign-in accounts.
- Signed-in conversation history is stored in Firestore under `users/{uid}/conversations/{conversationId}`.
- Conversation content and derived spiritual-profile data are sent to OpenAI for chat generation and text-to-speech.
- The backend stores derived profile and memory documents in Firestore under `users/{uid}/meta/*`.
- The backend logs partial user content to operational logs today.
- A full account-deletion flow is not yet implemented. Individual conversation deletion exists, but account-linked backend data is not yet deleted by a single in-app or backend account-deletion path.

## Storage Map

### Firebase Auth

- Anonymous auth user: created automatically on first app launch if no session exists
- Registered auth user: email/password or Google
- Device persistence: Firebase Auth session persisted locally via `AsyncStorage`

### Firestore

- Conversations:
  - `users/{uid}/conversations/{conversationId}`
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
- Temporary MP3 voice playback files in the Expo cache directory under `quiet-room-voice/`
- In-memory chat state and streaming buffers inside the app process

### Operational logs

- Backend structured logs written via `gabriel.logging.make_log_event(...)`
- Local/dev sink: file path from `BACKEND_LOG_PATH`
- Deployed sink assumption from privacy planning: CloudWatch or equivalent platform log sink

## Inventory Matrix

| Data Type | Collected | Stored | Shared | With Who | Purpose | Retention | Deletion |
|---|---|---|---|---|---|---|---|
| Firebase Auth account data: UID, email, display name, provider, anonymous status | Yes | Yes | Yes | Firebase Authentication | Sign-in, account persistence, identify the user to the backend | Until the auth account is deleted; local session persists until sign-out or app data clear | No single in-app/backend account deletion flow yet; sign-out clears the local session but does not delete the auth account |
| Firebase ID tokens / auth session artifacts | Yes | Yes | Yes | Firebase Authentication and Quiet Room backend | Authenticate API requests | Device-local until sign-out, token refresh, or app data clear | Cleared on sign-out locally; backend does not persist the raw token as application data |
| Conversation messages: user prompts and assistant replies | Yes | Yes for signed-in users | Yes | Quiet Room backend, Firestore, OpenAI | Deliver chat, reload history, generate future responses | Persisted until conversation deletion today; no full account-deletion path yet | Individual conversations can be deleted via `DELETE /api/conversations/{conversationId}`; account-wide deletion not yet implemented |
| Conversation metadata: conversation ID, title, createdAt, updatedAt, currentModel | Yes | Yes | Limited | Quiet Room backend and Firestore | List conversations, restore state, show titles, keep model selection consistent | Persisted with the conversation until conversation deletion today | Deleted with the conversation document; no account-wide deletion flow yet |
| Anonymous-session flag on conversations (`isAnon`) | Yes | Yes when the conversation is saved from an anonymous session | No external sharing beyond normal backend processing | Quiet Room backend and Firestore | Distinguish anonymous history from authenticated history in storage | Stored with the conversation document while that document exists | Deleted only if the related conversation document is deleted |
| Timezone metadata (`tzOffsetMinutes`) attached to chats and profile records | Yes | Yes | Yes | Quiet Room backend, Firestore, OpenAI | Add local-time context to prompts and profile updates | Stored with conversations and profile records while those records exist | Deleted when the related conversation/profile records are deleted |
| Derived spiritual profile (`spiritual_profile`) | Yes, derived from conversation content | Yes | Yes | Quiet Room backend, Firestore, OpenAI | Personalize future replies and maintain continuity across sessions | Persisted until future account deletion; no standalone retention limit in code | No user-facing delete flow yet; some fields are cleaned when a conversation is individually deleted if stale pointers remain |
| Legacy profile snapshots (`meta/profile_*`) | Yes, derived from conversations | Yes | Yes | Quiet Room backend, Firestore, OpenAI | Preserve historical profile snapshots for profile-builder context | Persisted until future account deletion; no automatic pruning in code | No account-wide deletion flow yet |
| Split-memory profile docs (`spiritual_profile_core`, `spiritual_profile_recent`, `spiritual_profile_meta`) | Feature-flag dependent, derived from conversations | Yes | Yes | Quiet Room backend, Firestore, OpenAI | Store long-term and recent inferred context for future personalization | Persisted until future account deletion; no automatic pruning in code | No account-wide deletion flow yet |
| Split-memory history entries (`spiritual_profile_history/entries/*`) | Feature-flag dependent, derived from conversations | Yes | Yes | Quiet Room backend, Firestore, OpenAI | Track memory/profile evolution over time | Persisted until future account deletion; no automatic pruning in code | No account-wide deletion flow yet |
| Voice request text for TTS: direct text or saved assistant message content | Yes | Not as a dedicated voice record | Yes | Quiet Room backend and OpenAI TTS | Generate playable voice audio for assistant text | Transient for the request itself; content may still exist in conversations and logs | No separate voice-record deletion because the endpoint does not persist a standalone voice artifact |
| Temporary voice playback files on device | Yes | Yes, device cache only | No | Local device only | Playback assistant audio | Cache lifetime only; files are removed after cleanup or when the OS clears cache | Deleted locally during cleanup or by OS cache eviction |
| Feature-flag evaluation context tied to a UID | Yes | Yes, if a UID is manually allowlisted in Firestore admin config | No end-user third-party sharing | Quiet Room backend and Firestore | Enable or disable features for rollout control | Until admin config changes | Removed only when the flag configuration is edited; not currently part of account deletion work |
| Operational logs: UID, conversation ID, model, token usage, status, and truncated content previews such as `last_user_message`, `profile_preview`, and `text_preview` | Yes | Yes | Yes | Backend logging sink, assumed CloudWatch in deployed environments | Diagnostics, security review, incident response, usage debugging | Local/dev logs persist until manually rotated or deleted; deployed log retention is not defined in this repository and must be fixed before public policy text claims a concrete number of days | Not currently part of user-facing deletion; log entries may remain after conversation or account deletion |

## External Sharing Map

### Firebase

- Firebase Authentication receives:
  - account identifiers
  - credentials and provider metadata
  - session lifecycle data

### OpenAI

- Chat endpoint sends:
  - current conversation context
  - prior message excerpts used for context
  - derived spiritual profile text
  - timezone-derived prompt metadata
  - requested model selection
- Voice endpoint sends:
  - text to synthesize as audio
- Profile builder sends:
  - conversation transcript text
  - existing profile / snapshot context
  - split-memory history context when enabled

### Logging sink

- Backend structured logs include:
  - UID
  - conversation ID
  - model names
  - token usage
  - status/error details
  - truncated previews of some user or derived content

## Deletion Notes

What exists now:

- signed-out local cleanup
- individual conversation deletion
- some stale profile pointers are removed when a single conversation is deleted

What does not exist yet:

- backend `DELETE /api/account`
- deletion of Firebase Auth user
- deletion of all Firestore conversation/profile/history records in one flow
- deletion-aware cleanup of operational logs

That means current privacy-policy and store-deletion language must not overclaim account deletion until Task 04 and Task 05 are implemented.

## Gaps That Still Need Resolution

### 1. Operational-log retention is not yet codified

The planning docs require a concrete log-retention period in days, but this repository does not currently define one for deployed logging. Before policy copy or store forms are finalized, production logging must adopt an explicit retention setting and this document should be updated with the exact number.

### 2. Account deletion is not yet truthful as a product promise

The app currently supports account creation, but there is not yet a complete account-deletion path covering:

- Firebase Auth
- Firestore conversations
- legacy profile docs
- split-memory docs
- profile history docs

### 3. AI consent is planned but not implemented

Task 03 expects explicit consent tracking before sending user content to OpenAI. That state does not yet exist in the current mobile or backend implementation, so it is intentionally absent from this inventory as current stored data.
