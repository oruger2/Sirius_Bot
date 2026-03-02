const {
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} = require("discord.js");
const { getGuildJoinSetting } = require("../utils/joinMessageSettings");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");
const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");
const { getGuildInviteLinkSetting } = require("../utils/inviteLinkBlockSettings");
const { getGuildXpSetting } = require("../utils/xpSystem");
const { getGuildStarboardSetting } = require("../utils/starboardSettings");
const {
  getGuildBumpUpNotifierSetting,
  setGuildBumpUpNotifierSetting,
} = require("../utils/bumpUpNotifierSettings");
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
    embeds: [
      settingpanel.buildPanel(
        joinSetting,
        leaveSetting,
        spamSetting,
        autoReactionSetting,
        shortLinkSetting,
        xpSetting,
        starboardSetting,
        inviteLinkSetting,
        bumpUpNotifierSetting
      )
    ],
    components: settingpanel.buildButtons(
      joinSetting,
      leaveSetting,
      spamSetting,
      autoReactionSetting,
      shortLinkSetting,
      xpSetting,
      starboardSetting,
      inviteLinkSetting,
      bumpUpNotifierSetting,
      page
    ),
  };
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    const isTarget =
      (interaction.isButton() && [
        "bumpup_toggle",
        "bumpup_open_modal",
        "bumpup_clear_all",
      ].includes(interaction.customId)) ||
      (interaction.isChannelSelectMenu() && interaction.customId === "bumpup_notify_channel") ||
      (interaction.isRoleSelectMenu() && ["bumpup_bump_role", "bumpup_up_role"].includes(interaction.customId));

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = await getGuildBumpUpNotifierSetting(guildId);

    if (interaction.isButton() && interaction.customId === "bumpup_toggle") {
      await setGuildBumpUpNotifierSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(await renderSettingPanel(guildId, 3));
    }

    if (interaction.isButton() && interaction.customId === "bumpup_open_modal") {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("bumpup_notify_channel")
        .setPlaceholder("通知チャンネルを選択")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1);

      if (setting.notifyChannelId) {
        channelSelect.setDefaultChannels(setting.notifyChannelId);
      }

      const bumpRoleSelect = new RoleSelectMenuBuilder()
        .setCustomId("bumpup_bump_role")
        .setPlaceholder("/bump通知のメンションロール")
        .setMinValues(0)
        .setMaxValues(1);

      if (setting.bumpMentionRoleId) {
        bumpRoleSelect.setDefaultRoles(setting.bumpMentionRoleId);
      }

      const upRoleSelect = new RoleSelectMenuBuilder()
        .setCustomId("bumpup_up_role")
        .setPlaceholder("/up通知のメンションロール")
        .setMinValues(0)
        .setMaxValues(1);

      if (setting.upMentionRoleId) {
        upRoleSelect.setDefaultRoles(setting.upMentionRoleId);
      }

      const clearRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("bumpup_clear_all")
          .setLabel("通知設定をクリア")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content: "Disboard / Dissoku の通知設定を選択してください。",
        components: [
          new ActionRowBuilder().addComponents(channelSelect),
          new ActionRowBuilder().addComponents(bumpRoleSelect),
          new ActionRowBuilder().addComponents(upRoleSelect),
          clearRow,
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isButton() && interaction.customId === "bumpup_clear_all") {
      await setGuildBumpUpNotifierSetting(guildId, {
        ...setting,
        notifyChannelId: "",
        bumpMentionRoleId: "",
        upMentionRoleId: "",
      });

      return interaction.update({ ...(await renderSettingPanel(guildId, 3)), flags: MessageFlags.Ephemeral });
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === "bumpup_notify_channel") {
      await setGuildBumpUpNotifierSetting(guildId, {
        ...setting,
        notifyChannelId: interaction.values[0] || "",
      });
      return interaction.update({ ...(await renderSettingPanel(guildId, 3)), flags: MessageFlags.Ephemeral });
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === "bumpup_bump_role") {
      await setGuildBumpUpNotifierSetting(guildId, {
        ...setting,
        bumpMentionRoleId: interaction.values[0] || "",
      });
      return interaction.update({ ...(await renderSettingPanel(guildId, 3)), flags: MessageFlags.Ephemeral });
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === "bumpup_up_role") {
      await setGuildBumpUpNotifierSetting(guildId, {
        ...setting,
        upMentionRoleId: interaction.values[0] || "",
      });
      return interaction.update({ ...(await renderSettingPanel(guildId, 3)), flags: MessageFlags.Ephemeral });
    }
  },
};
