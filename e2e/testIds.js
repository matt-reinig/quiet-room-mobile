module.exports = {
  screen: "quiet-room.screen",
  header: "quiet-room.header",
  messageList: "quiet-room.messages.list",
  openingMessage: "quiet-room.message.opening",
  composerInput: "quiet-room.composer.input",
  sendButton: "quiet-room.send",
  promptCuesToggle: "quiet-room.prompt-cues.toggle",
  conversationsButton: "quiet-room.conversations.open",
  loginModal: "quiet-room.login.modal",
  thinkingRow: "quiet-room.messages.thinking",
  message: {
    user(index) {
      return `quiet-room.message.user.${index}`;
    },
    assistant(index) {
      return `quiet-room.message.assistant.${index}`;
    },
  },
};
