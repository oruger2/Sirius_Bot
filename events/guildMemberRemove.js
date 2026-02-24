const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");

module.exports = {
  name: "guildMemberRemove",

  async execute(member) {
    const setting = await getGuildLeaveSetting(member.guild.id);

    if (!setting.enabled || !setting.channelId || !setting.message) {
      return;
    }

    const channel = member.guild.channels.cache.get(setting.channelId);
    if (!channel || !channel.isTextBased()) {
      return;
    }

    const content = setting.message
      .replaceAll("[user]", `<@${member.id}>`)
      .replaceAll("[membercount]", String(member.guild.memberCount));

    try {
      await channel.send({ content });
    } catch (error) {
      console.error("[LEAVE MESSAGE] 送信失敗", error);
    }
  },
};
