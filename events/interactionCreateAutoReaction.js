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
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const {
  getGuildAutoReactionSetting,
  setGuildAutoReactionSetting,
} = require("../utils/autoReactionSettings");
const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");
const { getGuildXpSetting } = require("../utils/xpSystem");
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

function parseEmojiList(text) {
  return [...new Set(
    String(text || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}

function toReactionValue(emoji) {
  const customEmojiMatch = emoji.match(/^<?a?:\w+:(\d+)>?$/);
  if (customEmojiMatch) return customEmojiMatch[1];

  if (/^\d+$/.test(emoji)) return emoji;
  return emoji;
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
      (interaction.isButton() && ["autoreact_toggle", "autoreact_open_modal"].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "autoreact_modal");

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = getGuildAutoReactionSetting(guildId);

    if (interaction.isButton() && interaction.customId === "autoreact_toggle") {
      if (!setting.channelIds.length || !setting.emojis.length) {
        return interaction.reply({
          content: "⚠️ ONにする前に対象チャンネルと絵文字を設定してください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      setGuildAutoReactionSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(renderSettingPanel(guildId));
    }

    if (interaction.isButton() && interaction.customId === "autoreact_open_modal") {
      const modal = new ModalBuilder().setCustomId("autoreact_modal").setTitle("自動リアクション設定");

      const channelsInput = new TextInputBuilder()
        .setCustomId("channel_ids")
        .setLabel("対象チャンネルID（カンマ区切り）")
        .setPlaceholder("123...,456...")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue((setting.channelIds || []).join(","));

      const emojisInput = new TextInputBuilder()
        .setCustomId("emoji_list")
        .setLabel("絵文字（カンマ区切り）")
        .setPlaceholder("😀,🔥,<:custom:123456789012345678>")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue((setting.emojis || []).join(","));

      modal.addComponents(
        new ActionRowBuilder().addComponents(channelsInput),
        new ActionRowBuilder().addComponents(emojisInput)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "autoreact_modal") {
      const channelIds = parseIdList(interaction.fields.getTextInputValue("channel_ids"));
      const emojis = parseEmojiList(interaction.fields.getTextInputValue("emoji_list"));
      const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

      for (const channelId of channelIds) {
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel || !textLike.includes(channel.type)) {
          return interaction.reply({
            content: "❌ 対象チャンネルIDに無効な値があります。",
            flags: MessageFlags.Ephemeral,
          });
        }

        const botMember = interaction.guild.members.me;
        const channelPerms = channel.permissionsFor(botMember);
        if (!channelPerms?.has(PermissionsBitField.Flags.AddReactions)) {
          return interaction.reply({
            content: "❌ 指定チャンネルのいずれかでリアクション権限がありません。",
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      for (const emoji of emojis) {
        const reactionValue = toReactionValue(emoji);
        if (/^\d+$/.test(reactionValue) && !interaction.guild.emojis.cache.has(reactionValue)) {
          return interaction.reply({
            content: `❌ カスタム絵文字 ${emoji} はこのサーバーで使えません。`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      setGuildAutoReactionSetting(guildId, {
        ...setting,
        channelIds,
        emojis,
      });

      return interaction.reply({
        ...renderSettingPanel(guildId),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
