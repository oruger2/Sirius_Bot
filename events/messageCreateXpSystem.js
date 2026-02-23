const { EmbedBuilder } = require("discord.js");
const { getGuildXpSetting, addUserXp, MAX_LEVEL } = require("../utils/xpSystem");

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (!message.guild || message.author.bot || message.deleted) return;

    const setting = getGuildXpSetting(message.guild.id);
    if (!setting.enabled) return;
    if (!setting.notifyChannelId) return;
    if (setting.ignoredChannelIds.includes(message.channel.id)) return;

    const gain = Math.floor(Math.random() * 6) + 5;
    const result = addUserXp(message.guild.id, message.author.id, gain);

    if (!result.leveledUp) return;

    const notifyChannel = message.guild.channels.cache.get(setting.notifyChannelId);
    if (!notifyChannel || !notifyChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("🎉 レベルアップ！")
      .setDescription(`<@${message.author.id}> のレベルが **${result.after.level}** になりました！`)
      .addFields(
        { name: "現在XP", value: `${result.after.xp}`, inline: true },
        {
          name: "次レベルまで",
          value: result.after.level >= MAX_LEVEL ? "最大レベル到達" : `${result.after.neededXp} XP`,
          inline: true,
        }
      )
      .setTimestamp();

    await notifyChannel.send({ embeds: [embed] }).catch(() => null);
  },
};
