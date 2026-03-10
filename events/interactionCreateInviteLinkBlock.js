const {
  MessageFlags,
  PermissionFlagsBits,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require("discord.js");
const { getGuildJoinSetting } = require("../utils/joinMessageSettings");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");
const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");
const {
  getGuildInviteLinkSetting,
  setGuildInviteLinkSetting,
} = require("../utils/inviteLinkBlockSettings");
const { getGuildXpSetting } = require("../utils/xpSystem");
const { getGuildStarboardSetting } = require("../utils/starboardSettings");
const { getGuildBumpUpNotifierSetting } = require("../utils/bumpUpNotifierSettings");
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
      (interaction.isButton() && [
        "invitelink_toggle",
        "invitelink_open_modal",
        "invitelink_clear_allowed",
      ].includes(interaction.customId)) ||
      (interaction.isChannelSelectMenu() && interaction.customId === "invitelink_allowed_channels") ||
      (interaction.isRoleSelectMenu() && interaction.customId === "invitelink_allowed_roles");

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = await getGuildInviteLinkSetting(guildId);

    if (interaction.isButton() && interaction.customId === "invitelink_toggle") {
      await setGuildInviteLinkSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(await renderSettingPanel(guildId, 2));
    }

    if (interaction.isButton() && interaction.customId === "invitelink_open_modal") {
      const allowedChannelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("invitelink_allowed_channels")
        .setPlaceholder("許可チャンネルを選択（複数可）")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(25);

      if ((setting.allowedChannelIds || []).length) {
        allowedChannelSelect.setDefaultChannels(...setting.allowedChannelIds.slice(0, 25));
      }

      const allowedRoleSelect = new RoleSelectMenuBuilder()
        .setCustomId("invitelink_allowed_roles")
        .setPlaceholder("許可ロールを選択（複数可）")
        .setMinValues(0)
        .setMaxValues(25);

      if ((setting.allowedRoleIds || []).length) {
        allowedRoleSelect.setDefaultRoles(...setting.allowedRoleIds.slice(0, 25));
      }

      const clearRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("invitelink_clear_allowed")
          .setLabel("許可設定をクリア")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content: "招待リンクブロックの許可チャンネル/許可ロールを設定してください。",
        components: [
          new ActionRowBuilder().addComponents(allowedChannelSelect),
          new ActionRowBuilder().addComponents(allowedRoleSelect),
          clearRow,
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isButton() && interaction.customId === "invitelink_clear_allowed") {
      await setGuildInviteLinkSetting(guildId, {
        ...setting,
        allowedChannelIds: [],
        allowedRoleIds: [],
      });
      return interaction.update({
        ...(await renderSettingPanel(guildId, 2)),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === "invitelink_allowed_channels") {
      await setGuildInviteLinkSetting(guildId, {
        ...setting,
        allowedChannelIds: interaction.values,
      });
      return interaction.update({
        ...(await renderSettingPanel(guildId, 2)),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === "invitelink_allowed_roles") {
      await setGuildInviteLinkSetting(guildId, {
        ...setting,
        allowedRoleIds: interaction.values,
      });
      return interaction.update({
        ...(await renderSettingPanel(guildId, 2)),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
