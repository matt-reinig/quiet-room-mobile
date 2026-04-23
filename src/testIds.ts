export const testIds = {
  screen: "quiet-room.screen",
  header: "quiet-room.header",
  aboutButton: "quiet-room.about.open",
  profileButton: "quiet-room.profile.open",
  profileMenu: "quiet-room.profile.menu",
  profileLogoutButton: "quiet-room.profile.logout",
  profileDeleteButton: "quiet-room.profile.delete",
  profileSignInButton: "quiet-room.profile.signin",
  aiConsentModal: "quiet-room.ai-consent.modal",
  aiConsentCancelButton: "quiet-room.ai-consent.cancel",
  aiConsentAcceptButton: "quiet-room.ai-consent.accept",
  deleteAccountModal: "quiet-room.delete-account.modal",
  deleteAccountCancelButton: "quiet-room.delete-account.cancel",
  deleteAccountConfirmButton: "quiet-room.delete-account.confirm",
  deleteAccountError: "quiet-room.delete-account.error",
  reportResponseModal: "quiet-room.report-response.modal",
  reportResponseCancel: "quiet-room.report-response.cancel",
  reportResponseDone: "quiet-room.report-response.done",
  reportResponseError: "quiet-room.report-response.error",
  reportResponseNote: "quiet-room.report-response.note",
  reportResponseSubmit: "quiet-room.report-response.submit",
  reportResponseReason: "quiet-room.report-response.reason",
  conversationsButton: "quiet-room.conversations.open",
  crucifixWrapper: "quiet-room.crucifix.wrapper",
  crucifixButton: "quiet-room.crucifix.open",
  crucifixModal: "quiet-room.crucifix.modal",
  crucifixClose: "quiet-room.crucifix.close",
  crucifixImage: "quiet-room.crucifix.image",
  messageList: "quiet-room.messages.list",
  openingMessage: "quiet-room.message.opening",
  thinkingRow: "quiet-room.messages.thinking",
  promptCuesRoot: "quiet-room.prompt-cues.root",
  promptCuesToggle: "quiet-room.prompt-cues.toggle",
  promptCuesPanel: "quiet-room.prompt-cues.panel",
  modelPickerContainer: "quiet-room.model.picker",
  modelSelectedLabel: "quiet-room.model.selected",
  modelMenuButton: "quiet-room.model.toggle",
  modelMenu: "quiet-room.model.menu",
  modelMenuVoiceToggle: "quiet-room.model.voice-toggle",
  voiceModeIndicator: "quiet-room.voice-mode.indicator",
  composerWrapper: "quiet-room.composer.wrapper",
  composerInput: "quiet-room.composer.input",
  composerExpand: "quiet-room.composer.expand",
  composerFullscreenInput: "quiet-room.composer.fullscreen.input",
  composerFullscreenClose: "quiet-room.composer.fullscreen.close",
  sendButton: "quiet-room.send",
  scrollTopButton: "quiet-room.scroll.top",
  scrollNewestButton: "quiet-room.scroll.newest",
  fullscreenSendButton: "quiet-room.send.fullscreen",
  conversationsPanel: "quiet-room.conversations.panel",
  conversationsClose: "quiet-room.conversations.close",
  conversationsNew: "quiet-room.conversations.new",
  conversationsList: "quiet-room.conversations.list",
  conversationsLoadingMore: "quiet-room.conversations.loading-more",
  loginModal: "quiet-room.login.modal",
  loginClose: "quiet-room.login.close",
  loginTabSignin: "quiet-room.login.tab.signin",
  loginTabSignup: "quiet-room.login.tab.signup",
  loginTabReset: "quiet-room.login.tab.reset",
  loginAppleButton: "quiet-room.login.apple",
  loginGoogleButton: "quiet-room.login.google",
  loginEmailInput: "quiet-room.login.email",
  loginPasswordInput: "quiet-room.login.password",
  loginError: "quiet-room.login.error",
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

export function messageReportButtonTestId(index: number): string {
  return `quiet-room.message.assistant.${index}.report`;
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

export function modelOptionTestId(model: string): string {
  return `quiet-room.model.option.${model}`;
}
