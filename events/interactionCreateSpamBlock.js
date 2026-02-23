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
      return interaction.update(renderSettingPanel(guildId, 1));
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
        new ActionRowBuilder().addComponents(detectionRuleInput),
        new ActionRowBuilder().addComponents(timeoutMinutesInput),
        new ActionRowBuilder().addComponents(ignoredChannelsInput),
        new ActionRowBuilder().addComponents(ignoredRolesInput)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "spamblock_modal") {
      const reportChannelId = interaction.fields.getTextInputValue("report_channel_id").trim();
      const { detectionWindowSeconds, maxMessages } = parseDetectionRule(
        interaction.fields.getTextInputValue("detection_rule")
      );
      const timeoutMinutes = parseInteger(interaction.fields.getTextInputValue("timeout_minutes"));
      const ignoredChannelIds = parseIdList(interaction.fields.getTextInputValue("ignored_channel_ids"));
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
        detectionWindowSeconds,
        maxMessages,
        timeoutMinutes,
        ignoredChannelIds,
        ignoredRoleIds,
      });

      return interaction.reply({
        ...renderSettingPanel(guildId, 1),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
