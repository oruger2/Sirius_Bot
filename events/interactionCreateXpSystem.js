const {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
} = require("discord.js");
const { getGuildJoinSetting } = require("../utils/joinMessageSettings");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");
const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");
const { getGuildXpSetting, setGuildXpSetting } = require("../utils/xpSystem");
const settingpanel = require("../commands/settingpanel");

function isAdmin(interaction) {
  return interaction.inGuild() && interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

function parseIdList(text) {
  return [...new Set(String(text || "").split(",").map((value) => value.trim()).filter(Boolean))];
}

function renderSettingPanel(guildId) {
  const joinSetting = getGuildJoinSetting(guildId);
  const leaveSetting = getGuildLeaveSetting(guildId);
  const spamSetting = getGuildSpamSetting(guildId);
  const autoReactionSetting = getGuildAutoReactionSetting(guildId);
  const shortLinkSetting = getGuildShortLinkSetting(guildId);
  const xpSetting = getGuildXpSetting(guildId);

  return {
    embeds: [settingpanel.buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting)],
    components: settingpanel.buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting),
  };
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    const isTarget =
      (interaction.isButton() && ["xp_toggle", "xp_open_modal"].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "xp_modal");

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = getGuildXpSetting(guildId);

    if (interaction.isButton() && interaction.customId === "xp_toggle") {
      if (!setting.enabled && !setting.notifyChannelId) {
        return interaction.reply({
          content: "⚠️ XPをONにするには通知チャンネル設定が必須です。先に『XP 設定』を行ってください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      setGuildXpSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(renderSettingPanel(guildId));
    }

    if (interaction.isButton() && interaction.customId === "xp_open_modal") {
      const modal = new ModalBuilder().setCustomId("xp_modal").setTitle("XPシステム設定");

      const notifyChannelInput = new TextInputBuilder()
        .setCustomId("notify_channel_id")
        .setLabel("通知チャンネルID（必須）")
        .setPlaceholder("123456789012345678")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(setting.notifyChannelId || "");

      const ignoredChannelsInput = new TextInputBuilder()
        .setCustomId("ignored_channel_ids")
        .setLabel("無効チャンネルID（カンマ区切り）")
        .setPlaceholder("123...,456...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setValue((setting.ignoredChannelIds || []).join(","));

      modal.addComponents(
        new ActionRowBuilder().addComponents(notifyChannelInput),
        new ActionRowBuilder().addComponents(ignoredChannelsInput)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "xp_modal") {
      const notifyChannelId = interaction.fields.getTextInputValue("notify_channel_id").trim();
      const ignoredChannelIds = parseIdList(interaction.fields.getTextInputValue("ignored_channel_ids"));

      const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
      const notifyChannel = interaction.guild.channels.cache.get(notifyChannelId);

      if (!notifyChannel || !textLike.includes(notifyChannel.type)) {
        return interaction.reply({
          content: "❌ 通知チャンネルはテキストチャンネルIDで設定してください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      const botMember = interaction.guild.members.me;
      const notifyPerms = notifyChannel.permissionsFor(botMember);
      if (!notifyPerms?.has(PermissionsBitField.Flags.SendMessages)) {
        return interaction.reply({
          content: "❌ 通知チャンネルにBotの送信権限がありません。",
          flags: MessageFlags.Ephemeral,
        });
      }

      for (const channelId of ignoredChannelIds) {
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel || !textLike.includes(channel.type)) {
          return interaction.reply({
            content: "❌ 無効チャンネルIDに無効な値があります。",
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      setGuildXpSetting(guildId, {
        ...setting,
        notifyChannelId,
        ignoredChannelIds,
      });

      return interaction.reply({
        ...renderSettingPanel(guildId),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
