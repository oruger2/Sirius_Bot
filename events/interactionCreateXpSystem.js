const {
  MessageFlags,
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
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

async function renderSettingPanel(guildId, page = 1) {
  const joinSetting = await getGuildJoinSetting(guildId);
  const leaveSetting = await getGuildLeaveSetting(guildId);
  const spamSetting = await getGuildSpamSetting(guildId);
  const autoReactionSetting = await getGuildAutoReactionSetting(guildId);
  const shortLinkSetting = await getGuildShortLinkSetting(guildId);
  const xpSetting = await getGuildXpSetting(guildId);

  return {
    embeds: [settingpanel.buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting)],
    components: settingpanel.buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting, page),
  };
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    const isTarget =
      (interaction.isButton() && ["xp_toggle", "xp_open_modal", "xp_clear_ignored_channels"].includes(interaction.customId)) ||
      (interaction.isChannelSelectMenu() && ["xp_select_notify_channel", "xp_select_ignored_channels"].includes(interaction.customId));

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = await getGuildXpSetting(guildId);

    if (interaction.isButton() && interaction.customId === "xp_toggle") {
      if (!setting.enabled && !setting.notifyChannelId) {
        return interaction.reply({
          content: "⚠️ XPをONにするには通知チャンネル設定が必須です。先に『XP 設定』を行ってください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      await setGuildXpSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(await renderSettingPanel(guildId, 2));
    }

    if (interaction.isButton() && interaction.customId === "xp_open_modal") {
      const notifyChannelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("xp_select_notify_channel")
        .setPlaceholder("通知チャンネルを選択（必須）")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1);

      if (setting.notifyChannelId) {
        notifyChannelSelect.setDefaultChannels(setting.notifyChannelId);
      }

      const ignoredChannelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("xp_select_ignored_channels")
        .setPlaceholder("無効チャンネルを選択（複数可）")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(25);

      if ((setting.ignoredChannelIds || []).length) {
        ignoredChannelSelect.setDefaultChannels(...setting.ignoredChannelIds.slice(0, 25));
      }

      const clearIgnoredButton = new ButtonBuilder()
        .setCustomId("xp_clear_ignored_channels")
        .setLabel("無効チャンネルをクリア")
        .setStyle(ButtonStyle.Secondary);

      return interaction.reply({
        content: "通知チャンネルと無効チャンネルをセレクトメニューから選択してください。",
        components: [
          new ActionRowBuilder().addComponents(notifyChannelSelect),
          new ActionRowBuilder().addComponents(ignoredChannelSelect),
          new ActionRowBuilder().addComponents(clearIgnoredButton),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isButton() && interaction.customId === "xp_clear_ignored_channels") {
      await setGuildXpSetting(guildId, { ...setting, ignoredChannelIds: [] });
      return interaction.update({
        ...(await renderSettingPanel(guildId, 2)),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === "xp_select_notify_channel") {
      const [notifyChannelId] = interaction.values;
      const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
      const notifyChannel = interaction.guild.channels.cache.get(notifyChannelId);

      if (!notifyChannel || !textLike.includes(notifyChannel.type)) {
        return interaction.reply({
          content: "❌ 通知チャンネルはテキストチャンネルを選択してください。",
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

      await setGuildXpSetting(guildId, { ...setting, notifyChannelId });

      return interaction.update({
        ...(await renderSettingPanel(guildId, 2)),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === "xp_select_ignored_channels") {
      await setGuildXpSetting(guildId, {
        ...setting,
        ignoredChannelIds: interaction.values,
      });

      return interaction.update({
        ...(await renderSettingPanel(guildId, 2)),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
