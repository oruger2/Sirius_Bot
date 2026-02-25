const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const { getGuildJoinSetting } = require("../utils/joinMessageSettings");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");
const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");
const { getGuildXpSetting } = require("../utils/xpSystem");

function formatDateWithDays(date) {
  const now = Date.now();
  const diffDays = Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));
  return `<t:${Math.floor(date.getTime() / 1000)}:F>（${diffDays}日前）`;
}

function countChannelsByType(guild) {
  const counts = {
    text: 0,
    voice: 0,
    category: 0,
    announcement: 0,
    forum: 0,
    stage: 0,
    thread: 0,
    other: 0,
  };

  guild.channels.cache.forEach((channel) => {
    switch (channel.type) {
      case ChannelType.GuildText:
        counts.text += 1;
        break;
      case ChannelType.GuildVoice:
        counts.voice += 1;
        break;
      case ChannelType.GuildCategory:
        counts.category += 1;
        break;
      case ChannelType.GuildAnnouncement:
        counts.announcement += 1;
        break;
      case ChannelType.GuildForum:
        counts.forum += 1;
        break;
      case ChannelType.GuildStageVoice:
        counts.stage += 1;
        break;
      case ChannelType.PublicThread:
      case ChannelType.PrivateThread:
      case ChannelType.AnnouncementThread:
        counts.thread += 1;
        break;
      default:
        counts.other += 1;
        break;
    }
  });

  return counts;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("サーバー情報と設定パネル項目のON/OFFを表示します"),

  async execute(interaction) {
    const guild = interaction.guild;
    const owner = await guild.fetchOwner();

    const [joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting] = await Promise.all([
      getGuildJoinSetting(guild.id),
      getGuildLeaveSetting(guild.id),
      getGuildSpamSetting(guild.id),
      getGuildAutoReactionSetting(guild.id),
      getGuildShortLinkSetting(guild.id),
      getGuildXpSetting(guild.id),
    ]);

    const channelCount = countChannelsByType(guild);

    const embed = new EmbedBuilder()
      .setColor("Blurple")
      .setTitle(`🖥️ ${guild.name} のサーバー情報`)
      .setThumbnail(guild.iconURL({ size: 512 }))
      .addFields(
        { name: "サーバー名", value: guild.name, inline: true },
        { name: "サーバーID", value: guild.id, inline: true },
        { name: "作成者", value: `<@${owner.id}>`, inline: true },
        { name: "作成日", value: formatDateWithDays(guild.createdAt), inline: false },
        { name: "メンバー数", value: `${guild.memberCount}人`, inline: true },
        {
          name: "サーバーブースト",
          value: `レベル ${guild.premiumTier}（${guild.premiumSubscriptionCount || 0}ブースト）`,
          inline: true,
        },
        { name: "ロール数", value: `${guild.roles.cache.size}個`, inline: true },
        {
          name: "チャンネル数（種類別）",
          value:
            `テキスト: ${channelCount.text}\n` +
            `ボイス: ${channelCount.voice}\n` +
            `カテゴリ: ${channelCount.category}\n` +
            `アナウンス: ${channelCount.announcement}\n` +
            `フォーラム: ${channelCount.forum}\n` +
            `ステージ: ${channelCount.stage}\n` +
            `スレッド: ${channelCount.thread}\n` +
            `その他: ${channelCount.other}`,
          inline: false,
        },
        {
          name: "settingpanel 項目ON/OFF",
          value:
            `Join: **${joinSetting.enabled ? "ON" : "OFF"}**\n` +
            `Leave: **${leaveSetting.enabled ? "ON" : "OFF"}**\n` +
            `SpamBlock: **${spamSetting.enabled ? "ON" : "OFF"}**\n` +
            `AutoReaction: **${autoReactionSetting.enabled ? "ON" : "OFF"}**\n` +
            `ShortLinkBlock: **${shortLinkSetting.enabled ? "ON" : "OFF"}**\n` +
            `XP: **${xpSetting.enabled ? "ON" : "OFF"}**`,
          inline: false,
        }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
