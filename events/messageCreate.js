const { EmbedBuilder } = require("discord.js");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");

const DETECTION_WINDOW_MS = 5000;
const DELETE_WINDOW_MS = 10000;
const MAX_MESSAGES = 5;
const TIMEOUT_MS = 10 * 60 * 1000;

const messageHistory = new Map();
const activeTimeouts = new Map();
const processingTimeouts = new Set();

function keyOf(guildId, userId) {
  return `${guildId}:${userId}`;
}


function toReactionValue(emoji) {
  const customEmojiMatch = String(emoji).match(/^<?a?:\w+:(\d+)>?$/);
  if (customEmojiMatch) return customEmojiMatch[1];
  if (/^\d+$/.test(String(emoji))) return String(emoji);
  return emoji;
}

async function processAutoReaction(message) {
  const setting = getGuildAutoReactionSetting(message.guild.id);
  if (!setting.enabled) return;
  if (!setting.channelIds.includes(message.channel.id)) return;
  if (!Array.isArray(setting.emojis) || setting.emojis.length === 0) return;

  for (const emoji of setting.emojis) {
    try {
      await message.react(toReactionValue(emoji));
    } catch (error) {
      console.warn(`[AUTO REACTION] リアクション失敗: guild=${message.guild.id} emoji=${emoji}`);
    }
  }
}
module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (!message.guild || message.author.bot) return;

    await processAutoReaction(message);

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

    const detectionEntries = recentHistory.filter((entry) => now - entry.timestamp <= DETECTION_WINDOW_MS);

    if (detectionEntries.length < MAX_MESSAGES) return;

    const timeoutUntil = activeTimeouts.get(key) || 0;
    if (now < timeoutUntil || processingTimeouts.has(key)) return;

    const member = message.member;
    if (!member || !member.moderatable) return;

    try {
      processingTimeouts.add(key);
      activeTimeouts.set(key, now + TIMEOUT_MS);

      await member.timeout(TIMEOUT_MS, "SpamBlock: 5秒以内に5回メッセージ送信");

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
        .setDescription(`<@${member.id}> を **10分間タイムアウト** しました。`)
        .addFields(
          { name: "判定", value: "5秒以内に5回のメッセージ送信" },
          { name: "対応", value: "10秒以内のメッセージ削除 + 10分タイムアウト" },
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