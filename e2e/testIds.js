module.exports = {
  screen: 'quiet-room.screen',
  header: 'quiet-room.header',
  profileButton: 'quiet-room.profile.open',
  profileMenu: 'quiet-room.profile.menu',
  profileLogoutButton: 'quiet-room.profile.logout',
  profileDeleteButton: 'quiet-room.profile.delete',
  profileSignInButton: 'quiet-room.profile.signin',
  anonymousSignInPrompt: 'quiet-room.anonymous-signin-prompt',
  anonymousSignInPromptButton: 'quiet-room.anonymous-signin-prompt.signin',
  aiConsentModal: 'quiet-room.ai-consent.modal',
  aiConsentCancelButton: 'quiet-room.ai-consent.cancel',
  aiConsentAcceptButton: 'quiet-room.ai-consent.accept',
  deleteAccountModal: 'quiet-room.delete-account.modal',
  deleteAccountCancelButton: 'quiet-room.delete-account.cancel',
  deleteAccountConfirmButton: 'quiet-room.delete-account.confirm',
  deleteAccountError: 'quiet-room.delete-account.error',
  reportResponseModal: 'quiet-room.report-response.modal',
  reportResponseCancel: 'quiet-room.report-response.cancel',
  reportResponseDone: 'quiet-room.report-response.done',
  reportResponseError: 'quiet-room.report-response.error',
  reportResponseNote: 'quiet-room.report-response.note',
  reportResponseSubmit: 'quiet-room.report-response.submit',
  reportResponseReason: 'quiet-room.report-response.reason',
  reportResponseContextScope: 'quiet-room.report-response.context-scope',
  reportResponseForm: 'quiet-room.report-response.form',
  messageList: 'quiet-room.messages.list',
  openingMessage: 'quiet-room.message.opening',
  modelPickerContainer: 'quiet-room.model.picker',
  modelSelectedLabel: 'quiet-room.model.selected',
  composerWrapper: 'quiet-room.composer.wrapper',
  composerInput: 'quiet-room.composer.input',
  composerExpand: 'quiet-room.composer.expand',
  composerFullscreenInput: 'quiet-room.composer.fullscreen.input',
  modelMenuButton: 'quiet-room.model.toggle',
  voiceModeIndicator: 'quiet-room.voice-mode.indicator',
  sendButton: 'quiet-room.send',
  fullscreenSendButton: 'quiet-room.send.fullscreen',
  scrollTopButton: 'quiet-room.scroll.top',
  scrollNewestButton: 'quiet-room.scroll.newest',
  promptCuesToggle: 'quiet-room.prompt-cues.toggle',
  modelMenu: 'quiet-room.model.menu',
  modelMenuVoiceToggle: 'quiet-room.model.voice-toggle',
  conversationsButton: 'quiet-room.conversations.open',
  conversationsPanel: 'quiet-room.conversations.panel',
  conversationsClose: 'quiet-room.conversations.close',
  conversationsList: 'quiet-room.conversations.list',
  conversationsNew: 'quiet-room.conversations.new',
  conversationsLoadingMore: 'quiet-room.conversations.loading-more',
  conversationsSearchInput: 'quiet-room.conversations.search.input',
  conversationsSearchSubmit: 'quiet-room.conversations.search.submit',
  conversationsSearchClear: 'quiet-room.conversations.search.clear',
  conversationsSearchLoading: 'quiet-room.conversations.search.loading',
  conversationsSearchError: 'quiet-room.conversations.search.error',
  conversationsSearchNoResults: 'quiet-room.conversations.search.no-results',
  conversationSearchNavigator: 'quiet-room.conversation-search.navigator',
  conversationSearchOrdinal: 'quiet-room.conversation-search.ordinal',
  conversationSearchPrevious: 'quiet-room.conversation-search.previous',
  conversationSearchNext: 'quiet-room.conversation-search.next',
  conversationSearchDismiss: 'quiet-room.conversation-search.dismiss',
  conversationsRenameInput: 'quiet-room.conversations.rename.input',
  conversationsRenameCancel: 'quiet-room.conversations.rename.cancel',
  conversationsRenameSave: 'quiet-room.conversations.rename.save',
  crucifixWrapper: 'quiet-room.crucifix.wrapper',
  crucifixButton: 'quiet-room.crucifix.open',
  crucifixModal: 'quiet-room.crucifix.modal',
  crucifixClose: 'quiet-room.crucifix.close',
  crucifixImage: 'quiet-room.crucifix.image',
  loginModal: 'quiet-room.login.modal',
  loginClose: 'quiet-room.login.close',
  loginAppleButton: 'quiet-room.login.apple',
  loginGoogleButton: 'quiet-room.login.google',
  loginEmailInput: 'quiet-room.login.email',
  loginPasswordInput: 'quiet-room.login.password',
  loginError: 'quiet-room.login.error',
  loginSigninButton: 'quiet-room.login.signin',
  thinkingRow: 'quiet-room.messages.thinking',
  message: {
    user(index) {
      return `quiet-room.message.user.${index}`;
    },
    assistant(index) {
      return `quiet-room.message.assistant.${index}`;
    },
    voice(role, index) {
      return `quiet-room.message.${role}.${index}.voice`;
    },
    report(index) {
      return `quiet-room.message.assistant.${index}.report`;
    },
  },
  conversation: {
    row(id) {
      return `quiet-room.conversation.${id}.row`;
    },
    rename(id) {
      return `quiet-room.conversation.${id}.rename`;
    },
  },
  conversationSearchResultRow(id) {
    return `quiet-room.conversation-search.${id}.row`;
  },
  conversationSearchSnippet(id) {
    return `quiet-room.conversation-search.${id}.snippet`;
  },
  conversationSearchActiveMessage(conversationId, messageIndex) {
    return `quiet-room.conversation-search.${conversationId}.message.${messageIndex}`;
  },
  conversationSearchHighlight(conversationId, messageIndex) {
    return `quiet-room.conversation-search.${conversationId}.highlight.${messageIndex}`;
  },
  modelOption(model) {
    return `quiet-room.model.option.${model}`;
  },
};
