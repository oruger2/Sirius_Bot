const { enqueueMessage } = require("../utils/vcReader");

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (!message.inGuild()) return;
    if (message.author.bot) return;

    await enqueueMessage(message);
  },
};
