const { getGuildJoinSetting } = require("../utils/joinMessageSettings");

module.exports = {
  name: "guildMemberAdd",

  async execute(member) {
    const setting = getGuildJoinSetting(member.guild.id);

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
      console.error("[JOIN MESSAGE] 送信失敗", error);
    }
  },
};