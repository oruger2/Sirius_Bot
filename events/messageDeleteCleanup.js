const { cleanupOnMessageDelete } = require("../utils/settingsCleanup");

module.exports = {
  name: "messageDelete",
  async execute(message) {
    try {
      await cleanupOnMessageDelete(message.id);
      console.log(`[CLEANUP] messageDelete cleanup done: ${message.id}`);
    } catch (error) {
      console.error("[CLEANUP] messageDelete cleanup failed", error);
    }
  },
};
