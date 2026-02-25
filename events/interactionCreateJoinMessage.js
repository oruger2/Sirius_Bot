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
      (interaction.isButton() && ["joinmsg_toggle", "joinmsg_open_modal", "joinmsg_open_message_modal"].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "joinmsg_modal") ||
      (interaction.isChannelSelectMenu() && interaction.customId === "joinmsg_select_channel");

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = await getGuildJoinSetting(guildId);

    if (interaction.isButton() && interaction.customId === "joinmsg_toggle") {
      if (!setting.channelId || !setting.message) {
        return interaction.reply({
          content: "⚠️ ONにする前に送信先チャンネルとメッセージを設定してください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      await setGuildJoinSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(await renderSettingPanel(guildId, 1));
    }

    if (interaction.isButton() && interaction.customId === "joinmsg_open_modal") {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("joinmsg_select_channel")
        .setPlaceholder("送信先チャンネルを選択")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1);

      if (setting.channelId) {
        channelSelect.setDefaultChannels(setting.channelId);
      }

      const channelRow = new ActionRowBuilder().addComponents(channelSelect);
      const openMessageModalRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("joinmsg_open_message_modal")
          .setLabel("Joinメッセージ本文を編集")
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.reply({
        content: "送信先チャンネルはセレクトメニューから、本文は下のボタンから設定できます。",
        components: [channelRow, openMessageModalRow],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isButton() && interaction.customId === "joinmsg_open_message_modal") {
      const modal = new ModalBuilder().setCustomId("joinmsg_modal").setTitle("Joinメッセージ本文設定");

      const messageInput = new TextInputBuilder()
        .setCustomId("join_message")
        .setLabel("参加メッセージ")
        .setPlaceholder("[user] さん、ようこそ！現在 [membercount] 人です。")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue(setting.message || "");

      modal.addComponents(
        new ActionRowBuilder().addComponents(messageInput)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === "joinmsg_select_channel") {
      const [channelId] = interaction.values;
      const channel = interaction.guild.channels.cache.get(channelId);

      const botMember = interaction.guild.members.me;
      const channelPerms = channel.permissionsFor(botMember);
      if (!channelPerms?.has(PermissionsBitField.Flags.SendMessages)) {
        return interaction.reply({
          content: "❌ そのチャンネルに送信権限がありません。",
          flags: MessageFlags.Ephemeral,
        });
      }

      await setGuildJoinSetting(guildId, { ...setting, channelId });

      return interaction.reply({
        ...(await renderSettingPanel(guildId, 1)),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isModalSubmit() && interaction.customId === "joinmsg_modal") {
      const message = interaction.fields.getTextInputValue("join_message").trim();
      if (!setting.channelId) {
        return interaction.reply({
          content: "❌ 先に送信先チャンネルを選択してください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      await setGuildJoinSetting(guildId, { ...setting, message });

      return interaction.reply({
        ...(await renderSettingPanel(guildId, 1)),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
