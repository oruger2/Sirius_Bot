const { cleanupOnGuildDelete } = require("../utils/settingsCleanup");

module.exports = {
  name: "guildDelete",
  async execute(guild) {
    try {
      await cleanupOnGuildDelete(guild.id);
      console.log(`[CLEANUP] guildDelete cleanup done: ${guild.id}`);
    } catch (error) {
      console.error("[CLEANUP] guildDelete cleanup failed", error);
    }
  },
};
