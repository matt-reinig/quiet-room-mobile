module.exports = {
  screen: 'quiet-room.screen',
  header: 'quiet-room.header',
  profileButton: 'quiet-room.profile.open',
  profileMenu: 'quiet-room.profile.menu',
  profileSignInButton: 'quiet-room.profile.signin',
  messageList: 'quiet-room.messages.list',
  openingMessage: 'quiet-room.message.opening',
  composerInput: 'quiet-room.composer.input',
  sendButton: 'quiet-room.send',
  scrollTopButton: 'quiet-room.scroll.top',
  scrollNewestButton: 'quiet-room.scroll.newest',
  promptCuesToggle: 'quiet-room.prompt-cues.toggle',
  conversationsButton: 'quiet-room.conversations.open',
  conversationsPanel: 'quiet-room.conversations.panel',
  conversationsList: 'quiet-room.conversations.list',
  conversationsNew: 'quiet-room.conversations.new',
  conversationsLoadingMore: 'quiet-room.conversations.loading-more',
  crucifixButton: 'quiet-room.crucifix.open',
  crucifixModal: 'quiet-room.crucifix.modal',
  crucifixClose: 'quiet-room.crucifix.close',
  crucifixImage: 'quiet-room.crucifix.image',
  loginModal: 'quiet-room.login.modal',
  loginEmailInput: 'quiet-room.login.email',
  loginPasswordInput: 'quiet-room.login.password',
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
  },
};
