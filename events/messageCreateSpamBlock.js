const { EmbedBuilder } = require("discord.js");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");

const DELETE_WINDOW_MS = 10000;

const messageHistory = new Map();
const activeTimeouts = new Map();
const processingTimeouts = new Set();

function keyOf(guildId, userId) {
  return `${guildId}:${userId}`;
}

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (!message.guild || message.author.bot || message.deleted) return;

    const setting = getGuildSpamSetting(message.guild.id);
    if (!setting.enabled) return;

    if (setting.ignoredChannelIds.includes(message.channel.id)) return;
    if (message.member?.roles?.cache?.some((role) => setting.ignoredRoleIds.includes(role.id))) return;

    const key = keyOf(message.guild.id, message.author.id);
    const now = Date.now();

    const history = messageHistory.get(key) || [];
    const recentHistory = history.filter((entry) => now - entry.timestamp <= DELETE_WINDOW_MS);
    recentHistory.push({ timestamp: now, message });
    messageHistory.set(key, recentHistory);

    const detectionWindowMs = setting.detectionWindowSeconds * 1000;
    const maxMessages = setting.maxMessages;
    const timeoutMs = setting.timeoutMinutes * 60 * 1000;

    const detectionEntries = recentHistory.filter((entry) => now - entry.timestamp <= detectionWindowMs);
    if (detectionEntries.length < maxMessages) return;

    const timeoutUntil = activeTimeouts.get(key) || 0;
    if (now < timeoutUntil || processingTimeouts.has(key)) return;

    const member = message.member;
    if (!member || !member.moderatable) return;

    try {
      processingTimeouts.add(key);
      activeTimeouts.set(key, now + timeoutMs);

      await member.timeout(timeoutMs, `SpamBlock: ${setting.detectionWindowSeconds}秒以内に${setting.maxMessages}回メッセージ送信`);

      let deletedCount = 0;
      for (const entry of recentHistory) {
        const deleted = await entry.message.delete().then(() => true).catch(() => false);
        if (deleted) deletedCount += 1;
      }

      messageHistory.set(key, []);

      if (deletedCount === 0) {
        console.warn(`[SPAM BLOCK] 10秒以内のメッセージ削除に失敗: ${key}`);
      }

      if (!setting.reportChannelId) return;

      const reportChannel = message.guild.channels.cache.get(setting.reportChannelId);
      if (!reportChannel || !reportChannel.isTextBased()) return;

      const embed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("🚨 スパム検知")
        .setDescription(`<@${member.id}> を **${setting.timeoutMinutes}分間タイムアウト** しました。`)
        .addFields(
          { name: "判定", value: `${setting.detectionWindowSeconds}秒以内に${setting.maxMessages}回のメッセージ送信` },
          { name: "対応", value: `10秒以内のメッセージ削除 + ${setting.timeoutMinutes}分タイムアウト` },
          { name: "ユーザー", value: `<@${member.id}>`, inline: true },
          { name: "チャンネル", value: `<#${message.channel.id}>`, inline: true }
        )
        .setTimestamp();

      await reportChannel.send({ embeds: [embed] });
    } catch (error) {
      activeTimeouts.delete(key);
      console.error("[SPAM BLOCK] タイムアウト処理に失敗", error);
    } finally {
      processingTimeouts.delete(key);
    }
  },
};
