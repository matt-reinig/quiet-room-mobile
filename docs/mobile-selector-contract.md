# Mobile Selector Contract

Source of truth: `src/testIds.ts`

## Screen shell

- `quiet-room.screen`
- `quiet-room.header`

## Header controls

- `quiet-room.conversations.open`
- `quiet-room.about.open`
- `quiet-room.profile.open`
- `quiet-room.crucifix.open`

## Messages

- `quiet-room.messages.list`
- `quiet-room.message.opening`
- `quiet-room.message.user.{index}`
- `quiet-room.message.assistant.{index}`
- `quiet-room.message.assistant.{index}.copy`
- `quiet-room.message.assistant.{index}.voice`
- `quiet-room.messages.thinking`

Notes:

- Message indices are based on the real chat messages, not the opening greeting.
- The opening greeting has its own dedicated selector.

## Prompt cues

- `quiet-room.prompt-cues.root`
- `quiet-room.prompt-cues.toggle`
- `quiet-room.prompt-cues.panel`
- `quiet-room.prompt-cues.option.{cueId}`

## Composer

- `quiet-room.model.toggle`
- `quiet-room.composer.input`
- `quiet-room.composer.expand`
- `quiet-room.send`
- `quiet-room.composer.fullscreen.input`
- `quiet-room.composer.fullscreen.close`
- `quiet-room.send.fullscreen`

## Conversations

- `quiet-room.conversations.panel`
- `quiet-room.conversations.close`
- `quiet-room.conversations.new`
- `quiet-room.conversations.list`
- `quiet-room.conversation.{conversationId}.row`
- `quiet-room.conversation.{conversationId}.menu`
- `quiet-room.conversation.{conversationId}.rename`
- `quiet-room.conversation.{conversationId}.delete`
- `quiet-room.conversations.rename.input`
- `quiet-room.conversations.rename.cancel`
- `quiet-room.conversations.rename.save`

## Login

- `quiet-room.login.modal`
- `quiet-room.login.close`
- `quiet-room.login.tab.signin`
- `quiet-room.login.tab.signup`
- `quiet-room.login.tab.reset`
- `quiet-room.login.google`
- `quiet-room.login.email`
- `quiet-room.login.password`
- `quiet-room.login.signin`
- `quiet-room.login.signup`
- `quiet-room.login.reset`

## Rule

Do not hardcode coordinate taps when a selector exists.
If a test needs a new selector, add it to `src/testIds.ts` first and keep the naming consistent.
