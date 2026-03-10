const {
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { getGuildJoinSetting } = require("../utils/joinMessageSettings");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");
const {
  getGuildShortLinkSetting,
  setGuildShortLinkSetting,
} = require("../utils/shortLinkBlockSettings");
const { getGuildInviteLinkSetting } = require("../utils/inviteLinkBlockSettings");
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
    if (!(interaction.isButton() && interaction.customId === "shortlink_toggle")) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = await getGuildShortLinkSetting(guildId);
    await setGuildShortLinkSetting(guildId, { ...setting, enabled: !setting.enabled });
    return interaction.update(await renderSettingPanel(guildId, 2));
  },
};
