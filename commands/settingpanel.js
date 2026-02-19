const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { getGuildJoinSetting } = require("../utils/joinMessageSettings");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");

function mentionList(ids, type) {
  if (!ids || ids.length === 0) return "なし";
  if (type === "channel") return ids.map((id) => `<#${id}>`).join(", ");
  return ids.map((id) => `<@&${id}>`).join(", ");
}

function buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting) {
  return new EmbedBuilder()
    .setColor("Blue")
    .setTitle("⚙️ サーバー設定パネル")
    .setDescription("Join / Leave メッセージとスパムブロックをこのパネルから設定できます。")
    .addFields(
      {
        name: "📥 Joinメッセージ",
        value:
          `状態: **${joinSetting.enabled ? "ON" : "OFF"}**\n` +
          `チャンネル: ${joinSetting.channelId ? `<#${joinSetting.channelId}>` : "未設定"}\n` +
          `メッセージ: ${joinSetting.message || "未設定"}`,
      },
      {
        name: "📤 Leaveメッセージ",
        value:
          `状態: **${leaveSetting.enabled ? "ON" : "OFF"}**\n` +
          `チャンネル: ${leaveSetting.channelId ? `<#${leaveSetting.channelId}>` : "未設定"}\n` +
          `メッセージ: ${leaveSetting.message || "未設定"}`,
      },
      {
        name: "🛡️ スパムブロック",
        value:
          `状態: **${spamSetting.enabled ? "ON" : "OFF"}**\n` +
          "判定: **5秒以内に5回送信で10分タイムアウト（10秒以内のメッセージ削除）**\n" +
          `レポート先: ${spamSetting.reportChannelId ? `<#${spamSetting.reportChannelId}>` : "未設定（送信なし）"}\n` +
          `除外チャンネル: ${mentionList(spamSetting.ignoredChannelIds, "channel")}\n` +
          `除外ロール: ${mentionList(spamSetting.ignoredRoleIds, "role")}`,
      },
      {
        name: "✨ 自動リアクション",
        value:
          `状態: **${autoReactionSetting.enabled ? "ON" : "OFF"}**\n` +
          `対象チャンネル: ${mentionList(autoReactionSetting.channelIds, "channel")}\n` +
          `絵文字: ${(autoReactionSetting.emojis || []).join(", ") || "なし"}`,
      }
    )
    .setFooter({
      text: "[user] = ユーザー表示 / [membercount] = サーバー人数",
    });
}

function buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting) {
  const joinRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("joinmsg_toggle")
      .setLabel(joinSetting.enabled ? "Join OFF" : "Join ON")
      .setStyle(joinSetting.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("joinmsg_open_modal")
      .setLabel("Join 設定")
      .setStyle(ButtonStyle.Primary)
  );

  const leaveRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("leavemsg_toggle")
      .setLabel(leaveSetting.enabled ? "Leave OFF" : "Leave ON")
      .setStyle(leaveSetting.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("leavemsg_open_modal")
      .setLabel("Leave 設定")
      .setStyle(ButtonStyle.Primary)
  );

  const spamRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("spamblock_toggle")
      .setLabel(spamSetting.enabled ? "SpamBlock OFF" : "SpamBlock ON")
      .setStyle(spamSetting.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("spamblock_open_modal")
      .setLabel("SpamBlock 設定")
      .setStyle(ButtonStyle.Secondary)
  );

  const reactionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("autoreact_toggle")
      .setLabel(autoReactionSetting.enabled ? "AutoReact OFF" : "AutoReact ON")
      .setStyle(autoReactionSetting.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("autoreact_open_modal")
      .setLabel("AutoReact 設定")
      .setStyle(ButtonStyle.Secondary)
  );

  return [joinRow, leaveRow, spamRow, reactionRow];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("settingpanel")
    .setDescription("サーバー設定パネルを開きます（Join/Leave/SpamBlock/AutoReaction）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ 管理者のみ使用できます。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildId = interaction.guild.id;
    const joinSetting = getGuildJoinSetting(guildId);
    const leaveSetting = getGuildLeaveSetting(guildId);
    const spamSetting = getGuildSpamSetting(guildId);
    const autoReactionSetting = getGuildAutoReactionSetting(guildId);

    await interaction.reply({
      embeds: [buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting)],
      components: buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting),
      flags: MessageFlags.Ephemeral,
    });
  },

  buildPanel,
  buildButtons,
};