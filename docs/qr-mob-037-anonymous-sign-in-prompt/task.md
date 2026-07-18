# QR-MOB-037 – Anonymous First-Message Sign-In Prompt

## Goal

After an anonymous user sends their first message in a conversation, show a clear, non-blocking invitation to sign in so they know how to start another conversation.

Implementation and emulator evidence are recorded in [`verification.md`](./verification.md).

## Product Decision

- Render a compact pinned callout directly above the composer instead of inserting it into the transcript or automatically opening the profile menu.
- Use the copy **Want another conversation? Sign in to start one.**
- Provide one **Sign in** button that opens the existing sign-in sheet directly.
- Provide an **×** action that dismisses the callout and remember that choice for the current anonymous UID.
- Keep the conversation and assistant response visible and uninterrupted.
- Hide the prompt for registered users and before a guest has sent a message.

## Success Criteria

1. A fresh guest does not see the prompt before sending a message.
2. The prompt appears immediately after the first optimistic guest message and remains pinned above the composer.
3. The prompt appears only once and remains separate from the conversation transcript.
4. Tapping **Sign in** opens the existing sign-in sheet.
5. Registered users never see the guest prompt.
6. Dismissing the prompt keeps it hidden for the same anonymous UID across a cold relaunch.
7. Focused Android emulator E2E coverage verifies the full interaction.

## Scope

This is a mobile-only presentation change. It does not change Firebase identity semantics, anonymous retention, conversation ownership, backend APIs, QA store state, or production state.
