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
const { getGuildJoinSetting } = require("../utils/joinMessageSettings");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");
const {
  getGuildSpamSetting,
  setGuildSpamSetting,
} = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");
const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");
const settingpanel = require("../commands/settingpanel");

function isAdmin(interaction) {
  return interaction.inGuild() && interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

function parseIdList(text) {
  return [...new Set(
    String(text || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}

function renderSettingPanel(guildId) {
  const joinSetting = getGuildJoinSetting(guildId);
  const leaveSetting = getGuildLeaveSetting(guildId);
  const spamSetting = getGuildSpamSetting(guildId);
  const autoReactionSetting = getGuildAutoReactionSetting(guildId);
  const shortLinkSetting = getGuildShortLinkSetting(guildId);

  return {
    embeds: [settingpanel.buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting)],
    components: settingpanel.buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting),
  };
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    const isTarget =
      (interaction.isButton() && ["spamblock_toggle", "spamblock_open_modal"].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "spamblock_modal");

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = getGuildSpamSetting(guildId);

    if (interaction.isButton() && interaction.customId === "spamblock_toggle") {
      setGuildSpamSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(renderSettingPanel(guildId));
    }

    if (interaction.isButton() && interaction.customId === "spamblock_open_modal") {
      const modal = new ModalBuilder().setCustomId("spamblock_modal").setTitle("SpamBlock設定");

      const reportChannelInput = new TextInputBuilder()
        .setCustomId("report_channel_id")
        .setLabel("レポート送信先チャンネルID（任意）")
        .setPlaceholder("未入力でレポート送信なし")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(setting.reportChannelId || "");

      const ignoredChannelsInput = new TextInputBuilder()
        .setCustomId("ignored_channel_ids")
        .setLabel("除外チャンネルID（カンマ区切り）")
        .setPlaceholder("123...,456...")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue((setting.ignoredChannelIds || []).join(","));

      const ignoredRolesInput = new TextInputBuilder()
        .setCustomId("ignored_role_ids")
        .setLabel("除外ロールID（カンマ区切り）")
        .setPlaceholder("123...,456...")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue((setting.ignoredRoleIds || []).join(","));

      modal.addComponents(
        new ActionRowBuilder().addComponents(reportChannelInput),
        new ActionRowBuilder().addComponents(ignoredChannelsInput),
        new ActionRowBuilder().addComponents(ignoredRolesInput)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "spamblock_modal") {
      const reportChannelId = interaction.fields.getTextInputValue("report_channel_id").trim();
      const ignoredChannelIds = parseIdList(interaction.fields.getTextInputValue("ignored_channel_ids"));
      const ignoredRoleIds = parseIdList(interaction.fields.getTextInputValue("ignored_role_ids"));

      const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

      if (reportChannelId.length > 0) {
        const channel = interaction.guild.channels.cache.get(reportChannelId);
        if (!channel || !textLike.includes(channel.type)) {
          return interaction.reply({
            content: "❌ レポート送信先はテキストチャンネルIDを入力してください。",
            flags: MessageFlags.Ephemeral,
          });
        }

        const botMember = interaction.guild.members.me;
        const channelPerms = channel.permissionsFor(botMember);
        if (!channelPerms?.has(PermissionsBitField.Flags.SendMessages)) {
          return interaction.reply({
            content: "❌ そのレポート先チャンネルに送信権限がありません。",
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      for (const channelId of ignoredChannelIds) {
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel || !textLike.includes(channel.type)) {
          return interaction.reply({
            content: "❌ 除外チャンネルIDに無効な値があります。",
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      for (const roleId of ignoredRoleIds) {
        if (!interaction.guild.roles.cache.has(roleId)) {
          return interaction.reply({
            content: "❌ 除外ロールIDに無効な値があります。",
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      setGuildSpamSetting(guildId, {
        ...setting,
        reportChannelId,
        ignoredChannelIds,
        ignoredRoleIds,
      });

      return interaction.reply({
        ...renderSettingPanel(guildId),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
