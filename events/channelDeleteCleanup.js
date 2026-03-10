const { cleanupOnChannelDelete } = require("../utils/settingsCleanup");

module.exports = {
  name: "channelDelete",
  async execute(channel) {
    const guildId = channel.guild?.id;
    if (!guildId) return;

    try {
      await cleanupOnChannelDelete(guildId, channel.id);
      console.log(`[CLEANUP] channelDelete cleanup done: ${guildId}/${channel.id}`);
    } catch (error) {
      console.error("[CLEANUP] channelDelete cleanup failed", error);
    }
  },
};
