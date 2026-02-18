const { EmbedBuilder } = require("discord.js");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");

const WINDOW_MS = 3000;
const MAX_MESSAGES = 5;
const TIMEOUT_MS = 10 * 60 * 1000;

const messageHistory = new Map();
const activeTimeouts = new Map();

function keyOf(guildId, userId) {
  return `${guildId}:${userId}`;
}

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const setting = getGuildSpamSetting(message.guild.id);
    if (!setting.enabled) return;

    if (setting.ignoredChannelIds.includes(message.channel.id)) return;
    if (message.member?.roles?.cache?.some((role) => setting.ignoredRoleIds.includes(role.id))) return;

    const key = keyOf(message.guild.id, message.author.id);
    const now = Date.now();

    const history = messageHistory.get(key) || [];
    const recent = history.filter((entry) => now - entry.timestamp <= WINDOW_MS);
    recent.push({ timestamp: now, message });
    messageHistory.set(key, recent);

    if (recent.length < MAX_MESSAGES) return;

    const timeoutUntil = activeTimeouts.get(key) || 0;
    if (now < timeoutUntil) return;

    const member = message.member;
    if (!member || !member.moderatable) return;

    try {
      for (const entry of recent) {
        await entry.message.delete().catch(() => null);
      }

      await member.timeout(TIMEOUT_MS, "SpamBlock: 3秒以内に5回メッセージ送信");
      activeTimeouts.set(key, now + TIMEOUT_MS);
      messageHistory.set(key, []);

      if (!setting.reportChannelId) return;

      const reportChannel = message.guild.channels.cache.get(setting.reportChannelId);
      if (!reportChannel || !reportChannel.isTextBased()) return;

      const embed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("🚨 スパム検知")
        .setDescription(`<@${member.id}> を **10分間タイムアウト** しました。`)
        .addFields(
          { name: "判定", value: "3秒以内に5回のメッセージ送信" },
          { name: "対応", value: "該当スパムメッセージ削除 + 10分タイムアウト" },
          { name: "ユーザー", value: `<@${member.id}>`, inline: true },
          { name: "チャンネル", value: `<#${message.channel.id}>`, inline: true }
        )
        .setTimestamp();

      await reportChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error("[SPAM BLOCK] タイムアウト処理に失敗", error);
    }
  },
};
