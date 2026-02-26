const { cleanupOnRoleDelete } = require("../utils/settingsCleanup");

module.exports = {
  name: "roleDelete",
  async execute(role) {
    try {
      await cleanupOnRoleDelete(role.guild.id, role.id);
      console.log(`[CLEANUP] roleDelete cleanup done: ${role.guild.id}/${role.id}`);
    } catch (error) {
      console.error("[CLEANUP] roleDelete cleanup failed", error);
    }
  },
};
