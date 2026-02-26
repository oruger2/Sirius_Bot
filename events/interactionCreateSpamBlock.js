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
const {
  getGuildSpamSetting,
  setGuildSpamSetting,
} = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");
const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");
const { getGuildXpSetting } = require("../utils/xpSystem");
const { getGuildStarboardSetting } = require("../utils/starboardSettings");
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

function parseInteger(text) {
  const value = Number.parseInt(String(text || "").trim(), 10);
  return Number.isNaN(value) ? null : value;
}

function parseDetectionRule(text) {
  const [secondsText = "", countText = ""] = String(text || "").split(",");
  return {
    detectionWindowSeconds: parseInteger(secondsText),
    maxMessages: parseInteger(countText),
  };
}

async function renderSettingPanel(guildId, page = 1) {
  const joinSetting = await getGuildJoinSetting(guildId);
  const leaveSetting = await getGuildLeaveSetting(guildId);
  const spamSetting = await getGuildSpamSetting(guildId);
  const autoReactionSetting = await getGuildAutoReactionSetting(guildId);
  const shortLinkSetting = await getGuildShortLinkSetting(guildId);
  const xpSetting = await getGuildXpSetting(guildId);
  const starboardSetting = await getGuildStarboardSetting(guildId);

  return {
    embeds: [settingpanel.buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting, starboardSetting)],
    components: settingpanel.buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting, starboardSetting, page),
  };
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    const isTarget =
      (interaction.isButton() && [
        "spamblock_toggle",
        "spamblock_open_modal",
        "spamblock_open_advanced_modal",
        "spamblock_clear_report_channel",
      ].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "spamblock_modal") ||
      (interaction.isChannelSelectMenu() && ["spamblock_select_report_channel", "spamblock_select_ignored_channels"].includes(interaction.customId));

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = await getGuildSpamSetting(guildId);

    if (interaction.isButton() && interaction.customId === "spamblock_toggle") {
      await setGuildSpamSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(await renderSettingPanel(guildId, 1));
    }

    if (interaction.isButton() && interaction.customId === "spamblock_open_modal") {
      const reportChannelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("spamblock_select_report_channel")
        .setPlaceholder("レポート先チャンネルを選択（任意）")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1);

      if (setting.reportChannelId) {
        reportChannelSelect.setDefaultChannels(setting.reportChannelId);
      }

      const ignoredChannelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("spamblock_select_ignored_channels")
        .setPlaceholder("除外チャンネルを選択（複数可）")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(25);

      if ((setting.ignoredChannelIds || []).length) {
        ignoredChannelSelect.setDefaultChannels(...setting.ignoredChannelIds.slice(0, 25));
      }

      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("spamblock_open_advanced_modal")
          .setLabel("詳細設定（判定・タイムアウト・除外ロール）")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("spamblock_clear_report_channel")
          .setLabel("レポート先をクリア")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content: "チャンネル系の設定はセレクトメニューから、判定条件や除外ロールは詳細設定から変更できます。",
        components: [
          new ActionRowBuilder().addComponents(reportChannelSelect),
          new ActionRowBuilder().addComponents(ignoredChannelSelect),
          buttonsRow,
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isButton() && interaction.customId === "spamblock_clear_report_channel") {
      await setGuildSpamSetting(guildId, {
        ...setting,
        reportChannelId: "",
      });
      return interaction.update({
        ...(await renderSettingPanel(guildId, 1)),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isButton() && interaction.customId === "spamblock_open_advanced_modal") {
      const modal = new ModalBuilder().setCustomId("spamblock_modal").setTitle("SpamBlock詳細設定");

      const detectionRuleInput = new TextInputBuilder()
        .setCustomId("detection_rule")
        .setLabel("判定条件（秒数,回数）")
        .setPlaceholder("例: 5,5")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(`${setting.detectionWindowSeconds || 5},${setting.maxMessages || 5}`);

      const timeoutMinutesInput = new TextInputBuilder()
        .setCustomId("timeout_minutes")
        .setLabel("タイムアウト分数（1〜1440分）")
        .setPlaceholder("例: 10")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(setting.timeoutMinutes || 10));

      const ignoredRolesInput = new TextInputBuilder()
        .setCustomId("ignored_role_ids")
        .setLabel("除外ロールID（カンマ区切り）")
        .setPlaceholder("123...,456...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setValue((setting.ignoredRoleIds || []).join(","));

      modal.addComponents(
        new ActionRowBuilder().addComponents(detectionRuleInput),
        new ActionRowBuilder().addComponents(timeoutMinutesInput),
        new ActionRowBuilder().addComponents(ignoredRolesInput)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === "spamblock_select_report_channel") {
      const [reportChannelId] = interaction.values;
      const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
      const channel = interaction.guild.channels.cache.get(reportChannelId);
      if (!channel || !textLike.includes(channel.type)) {
        return interaction.reply({
          content: "❌ レポート送信先はテキストチャンネルを選択してください。",
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

      await setGuildSpamSetting(guildId, {
        ...setting,
        reportChannelId,
      });

      return interaction.update({
        ...(await renderSettingPanel(guildId, 1)),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === "spamblock_select_ignored_channels") {
      await setGuildSpamSetting(guildId, {
        ...setting,
        ignoredChannelIds: interaction.values,
      });

      return interaction.update({
        ...(await renderSettingPanel(guildId, 1)),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isModalSubmit() && interaction.customId === "spamblock_modal") {
      const { detectionWindowSeconds, maxMessages } = parseDetectionRule(
        interaction.fields.getTextInputValue("detection_rule")
      );
      const timeoutMinutes = parseInteger(interaction.fields.getTextInputValue("timeout_minutes"));
      const ignoredRoleIds = parseIdList(interaction.fields.getTextInputValue("ignored_role_ids"));

      if (!detectionWindowSeconds || detectionWindowSeconds < 1 || detectionWindowSeconds > 60) {
        return interaction.reply({
          content: "❌ 判定条件の秒数は1〜60の整数で入力してください。（例: 5,5）",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!maxMessages || maxMessages < 2 || maxMessages > 20) {
        return interaction.reply({
          content: "❌ 判定条件の回数は2〜20の整数で入力してください。（例: 5,5）",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!timeoutMinutes || timeoutMinutes < 1 || timeoutMinutes > 1440) {
        return interaction.reply({
          content: "❌ タイムアウト分数は1〜1440の整数で入力してください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      for (const roleId of ignoredRoleIds) {
        if (!interaction.guild.roles.cache.has(roleId)) {
          return interaction.reply({
            content: "❌ 除外ロールIDに無効な値があります。",
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      await setGuildSpamSetting(guildId, {
        ...setting,
        detectionWindowSeconds,
        maxMessages,
        timeoutMinutes,
        ignoredRoleIds,
      });

      return interaction.update({
        ...(await renderSettingPanel(guildId, 1)),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
