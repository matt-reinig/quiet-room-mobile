# QR-MOB-037 – Anonymous First-Message Sign-In Prompt

## Goal

After an anonymous user sends their first message in a conversation, show a clear, non-blocking invitation to sign in so they know how to start another conversation.

Implementation and emulator evidence are recorded in [`verification.md`](./verification.md).

## Product Decision

- Render a compact callout directly after the first guest message instead of automatically opening the profile menu.
- Use the copy **Want another conversation? To start another conversation, please sign in.**
- Provide one **Sign in** button that opens the existing sign-in sheet directly.
- Keep the conversation and assistant response visible and uninterrupted.
- Hide the prompt for registered users and before a guest has sent a message.

## Success Criteria

1. A fresh guest does not see the prompt before sending a message.
2. The prompt appears immediately after the first optimistic guest message and remains anchored to that first message.
3. The prompt appears only once in the rendered conversation, even after follow-up messages.
4. Tapping **Sign in** opens the existing sign-in sheet.
5. Registered users never see the guest prompt.
6. Focused Android emulator E2E coverage verifies the full interaction.

## Scope

This is a mobile-only presentation change. It does not change Firebase identity semantics, anonymous retention, conversation ownership, backend APIs, QA store state, or production state.
