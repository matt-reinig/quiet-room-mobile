export const testIds = {
  screen: "quiet-room.screen",
  header: "quiet-room.header",
  aboutButton: "quiet-room.about.open",
  profileButton: "quiet-room.profile.open",
  conversationsButton: "quiet-room.conversations.open",
  crucifixButton: "quiet-room.crucifix.open",
  messageList: "quiet-room.messages.list",
  openingMessage: "quiet-room.message.opening",
  thinkingRow: "quiet-room.messages.thinking",
  promptCuesRoot: "quiet-room.prompt-cues.root",
  promptCuesToggle: "quiet-room.prompt-cues.toggle",
  promptCuesPanel: "quiet-room.prompt-cues.panel",
  modelMenuButton: "quiet-room.model.toggle",
  composerInput: "quiet-room.composer.input",
  composerExpand: "quiet-room.composer.expand",
  composerFullscreenInput: "quiet-room.composer.fullscreen.input",
  composerFullscreenClose: "quiet-room.composer.fullscreen.close",
  sendButton: "quiet-room.send",
  fullscreenSendButton: "quiet-room.send.fullscreen",
  conversationsPanel: "quiet-room.conversations.panel",
  conversationsClose: "quiet-room.conversations.close",
  conversationsNew: "quiet-room.conversations.new",
  conversationsList: "quiet-room.conversations.list",
  loginModal: "quiet-room.login.modal",
  loginClose: "quiet-room.login.close",
  loginTabSignin: "quiet-room.login.tab.signin",
  loginTabSignup: "quiet-room.login.tab.signup",
  loginTabReset: "quiet-room.login.tab.reset",
  loginGoogleButton: "quiet-room.login.google",
  loginEmailInput: "quiet-room.login.email",
  loginPasswordInput: "quiet-room.login.password",
  loginSigninButton: "quiet-room.login.signin",
  loginSignupButton: "quiet-room.login.signup",
  loginResetButton: "quiet-room.login.reset",
} as const;

export function messageBubbleTestId(role: "assistant" | "user", index: number): string {
  return `quiet-room.message.${role}.${index}`;
}

export function messageCopyButtonTestId(index: number): string {
  return `quiet-room.message.assistant.${index}.copy`;
}

export function messageVoiceButtonTestId(role: "assistant" | "user", index: number): string {
  return `quiet-room.message.${role}.${index}.voice`;
}

export function promptCueTestId(id: string): string {
  return `quiet-room.prompt-cues.option.${id}`;
}

export function conversationRowTestId(id: string): string {
  return `quiet-room.conversation.${id}.row`;
}

export function conversationMenuButtonTestId(id: string): string {
  return `quiet-room.conversation.${id}.menu`;
}

export function conversationRenameButtonTestId(id: string): string {
  return `quiet-room.conversation.${id}.rename`;
}

export function conversationDeleteButtonTestId(id: string): string {
  return `quiet-room.conversation.${id}.delete`;
}
