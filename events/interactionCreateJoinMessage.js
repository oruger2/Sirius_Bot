const {
  MessageFlags,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const {
  getGuildJoinSetting,
  setGuildJoinSetting,
} = require("../utils/joinMessageSettings");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");
const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");
const { getGuildXpSetting } = require("../utils/xpSystem");
const settingpanel = require("../commands/settingpanel");

function isAdmin(interaction) {
  return interaction.inGuild() && interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

function renderSettingPanel(guildId, page = 1) {
  const joinSetting = getGuildJoinSetting(guildId);
  const leaveSetting = getGuildLeaveSetting(guildId);
  const spamSetting = getGuildSpamSetting(guildId);
  const autoReactionSetting = getGuildAutoReactionSetting(guildId);
  const shortLinkSetting = getGuildShortLinkSetting(guildId);
  const xpSetting = getGuildXpSetting(guildId);

  return {
    embeds: [settingpanel.buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting)],
    components: settingpanel.buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting, page),
  };
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    const isTarget =
      (interaction.isButton() && ["joinmsg_toggle", "joinmsg_open_modal"].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "joinmsg_modal");

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = getGuildJoinSetting(guildId);

    if (interaction.isButton() && interaction.customId === "joinmsg_toggle") {
      if (!setting.channelId || !setting.message) {
        return interaction.reply({
          content: "⚠️ ONにする前にチャンネルIDとメッセージを設定してください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      setGuildJoinSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(renderSettingPanel(guildId, 1));
    }

    if (interaction.isButton() && interaction.customId === "joinmsg_open_modal") {
      const modal = new ModalBuilder().setCustomId("joinmsg_modal").setTitle("Joinメッセージ設定");

      const channelInput = new TextInputBuilder()
        .setCustomId("channel_id")
        .setLabel("送信先チャンネルID")
        .setPlaceholder("123456789012345678")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(setting.channelId || "");

      const messageInput = new TextInputBuilder()
        .setCustomId("join_message")
        .setLabel("参加メッセージ")
        .setPlaceholder("[user] さん、ようこそ！現在 [membercount] 人です。")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue(setting.message || "");

      modal.addComponents(
        new ActionRowBuilder().addComponents(channelInput),
        new ActionRowBuilder().addComponents(messageInput)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "joinmsg_modal") {
      const channelId = interaction.fields.getTextInputValue("channel_id").trim();
      const message = interaction.fields.getTextInputValue("join_message").trim();
      const channel = interaction.guild.channels.cache.get(channelId);

      const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
      if (!channel || !textLike.includes(channel.type)) {
        return interaction.reply({
          content: "❌ テキストチャンネルのIDを入力してください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      const botMember = interaction.guild.members.me;
      const channelPerms = channel.permissionsFor(botMember);
      if (!channelPerms?.has(PermissionsBitField.Flags.SendMessages)) {
        return interaction.reply({
          content: "❌ そのチャンネルに送信権限がありません。",
          flags: MessageFlags.Ephemeral,
        });
      }

      setGuildJoinSetting(guildId, { ...setting, channelId, message });

      return interaction.reply({
        ...renderSettingPanel(guildId, 1),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
