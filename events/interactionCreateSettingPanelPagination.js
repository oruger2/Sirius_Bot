const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { getGuildJoinSetting } = require("../utils/joinMessageSettings");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");
const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");
const { getGuildInviteLinkSetting } = require("../utils/inviteLinkBlockSettings");
const { getGuildXpSetting } = require("../utils/xpSystem");
const { getGuildStarboardSetting } = require("../utils/starboardSettings");
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

  return {
    embeds: [settingpanel.buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting, starboardSetting, inviteLinkSetting)],
    components: settingpanel.buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting, starboardSetting, inviteLinkSetting, page),
  };
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (!["settingpanel_page_prev", "settingpanel_page_next"].includes(interaction.customId)) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const page = interaction.customId === "settingpanel_page_next" ? 2 : 1;
    return interaction.update(await renderSettingPanel(interaction.guild.id, page));
  },
};
