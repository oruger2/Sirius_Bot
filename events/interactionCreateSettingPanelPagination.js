const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { getGuildJoinSetting } = require("../utils/joinMessageSettings");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");
const { getGuildSpamSetting } = require("../utils/spamBlockSettings");
const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");
const { getGuildShortLinkSetting } = require("../utils/shortLinkBlockSettings");
const { getGuildXpSetting } = require("../utils/xpSystem");
const settingpanel = require("../commands/settingpanel");

function isAdmin(interaction) {
  return interaction.inGuild() && interaction.member.permissions.has(PermissionFlagsBits.Administrator);
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
    if (!interaction.isButton()) return;
    if (!["settingpanel_page_prev", "settingpanel_page_next"].includes(interaction.customId)) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
    }

    const page = interaction.customId === "settingpanel_page_next" ? 2 : 1;
    return interaction.update(renderSettingPanel(interaction.guild.id, page));
  },
};
