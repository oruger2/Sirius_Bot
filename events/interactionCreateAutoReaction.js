const {
  MessageFlags,
  PermissionsBitField,
  ModalBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
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
const { getGuildInviteLinkSetting } = require("../utils/inviteLinkBlockSettings");
const { getGuildXpSetting } = require("../utils/xpSystem");
const { getGuildStarboardSetting } = require("../utils/starboardSettings");
const { getGuildBumpUpNotifierSetting } = require("../utils/bumpUpNotifierSettings");
const settingpanel = require("../commands/settingpanel");

function isAdmin(interaction) {
  return interaction.inGuild() && interaction.member.permissions.has(PermissionFlagsBits.Administrator);
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

async function renderSettingPanel(guildId, page = 1) {
  const joinSetting = await getGuildJoinSetting(guildId);
  const leaveSetting = await getGuildLeaveSetting(guildId);
  const spamSetting = await getGuildSpamSetting(guildId);
  const autoReactionSetting = await getGuildAutoReactionSetting(guildId);
  const shortLinkSetting = await getGuildShortLinkSetting(guildId);
  const inviteLinkSetting = await getGuildInviteLinkSetting(guildId);
  const xpSetting = await getGuildXpSetting(guildId);
  const starboardSetting = await getGuildStarboardSetting(guildId);
  const bumpUpNotifierSetting = await getGuildBumpUpNotifierSetting(guildId);

  return {
    embeds: [settingpanel.buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting, starboardSetting, inviteLinkSetting, bumpUpNotifierSetting)],
    components: settingpanel.buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting, starboardSetting, inviteLinkSetting, bumpUpNotifierSetting, page),
  };
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    const isTarget =
      (interaction.isButton() && ["autoreact_toggle", "autoreact_open_modal", "autoreact_open_emoji_modal"].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "autoreact_modal") ||
      (interaction.isChannelSelectMenu() && interaction.customId === "autoreact_select_channels");

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = await getGuildAutoReactionSetting(guildId);

    if (interaction.isButton() && interaction.customId === "autoreact_toggle") {
      if (!setting.channelIds.length || !setting.emojis.length) {
        return interaction.reply({
          content: "⚠️ ONにする前に対象チャンネルと絵文字を設定してください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      await setGuildAutoReactionSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(await renderSettingPanel(guildId, 2));
    }

    if (interaction.isButton() && interaction.customId === "autoreact_open_modal") {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("autoreact_select_channels")
        .setPlaceholder("対象チャンネルを選択（複数可）")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(25);

      if ((setting.channelIds || []).length) {
        channelSelect.setDefaultChannels(...setting.channelIds.slice(0, 25));
      }

      const openEmojiModalRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("autoreact_open_emoji_modal")
          .setLabel("絵文字を編集")
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.update({
        content: "対象チャンネルはセレクトメニューから、絵文字は下のボタンから設定できます。",
        components: [new ActionRowBuilder().addComponents(channelSelect), openEmojiModalRow],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isButton() && interaction.customId === "autoreact_open_emoji_modal") {
      const modal = new ModalBuilder().setCustomId("autoreact_modal").setTitle("自動リアクション絵文字設定");

      const emojisInput = new TextInputBuilder()
        .setCustomId("emoji_list")
        .setLabel("絵文字（カンマ区切り）")
        .setPlaceholder("😀,🔥,<:custom:123456789012345678>")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue((setting.emojis || []).join(","));

      modal.addComponents(
        new ActionRowBuilder().addComponents(emojisInput)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === "autoreact_select_channels") {
      const channelIds = interaction.values;
      const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

      for (const channelId of channelIds) {
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel || !textLike.includes(channel.type)) {
          return interaction.reply({
            content: "❌ 対象チャンネルに無効な値があります。",
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

      await setGuildAutoReactionSetting(guildId, {
        ...setting,
        channelIds,
      });

      return interaction.update({
        ...(await renderSettingPanel(guildId, 2)),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isModalSubmit() && interaction.customId === "autoreact_modal") {
      const emojis = parseEmojiList(interaction.fields.getTextInputValue("emoji_list"));

      for (const emoji of emojis) {
        const reactionValue = toReactionValue(emoji);
        if (/^\d+$/.test(reactionValue) && !interaction.guild.emojis.cache.has(reactionValue)) {
          return interaction.reply({
            content: `❌ カスタム絵文字 ${emoji} はこのサーバーで使えません。`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      await setGuildAutoReactionSetting(guildId, {
        ...setting,
        emojis,
      });

      return interaction.update({
        ...(await renderSettingPanel(guildId, 2)),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
