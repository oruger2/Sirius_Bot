const { ChannelType, PermissionsBitField } = require("discord.js");
const { getGuildXpSetting, addUserXp } = require("../utils/xpSystem");

const XP_PER_MESSAGE = 5;
const XP_COOLDOWN_MS = 60 * 1000;

const recentXpMap = new Map();

function makeCooldownKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const setting = await getGuildXpSetting(message.guild.id);
    if (!setting.enabled) return;

    const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
    if (!textLike.includes(message.channel.type)) return;
    if (setting.ignoredChannelIds.includes(message.channel.id)) return;

    const cooldownKey = makeCooldownKey(message.guild.id, message.author.id);
    const now = Date.now();
    const lastGrantedAt = recentXpMap.get(cooldownKey) || 0;
    if (now - lastGrantedAt < XP_COOLDOWN_MS) return;

    recentXpMap.set(cooldownKey, now);

    const result = await addUserXp(message.guild.id, message.author.id, XP_PER_MESSAGE);
    if (!result.leveledUp || !setting.notifyChannelId) return;

    const notifyChannel = message.guild.channels.cache.get(setting.notifyChannelId);
    if (!notifyChannel || !textLike.includes(notifyChannel.type)) return;

    const botMember = message.guild.members.me;
    const notifyPerms = notifyChannel.permissionsFor(botMember);
    if (!notifyPerms?.has(PermissionsBitField.Flags.SendMessages)) return;

    await notifyChannel.send({
      content: `🎉 <@${message.author.id}> がレベルアップ！ **Lv.${result.after.level}** になりました（XP: ${result.after.xp}）`,
    });
  },
};
