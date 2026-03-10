const { getGuildInviteLinkSetting } = require("../utils/inviteLinkBlockSettings");

const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/i;

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const setting = await getGuildInviteLinkSetting(message.guild.id);
    if (!setting.enabled) return;

    if (!inviteRegex.test(message.content)) return;

    if ((setting.allowedChannelIds || []).includes(message.channel.id)) return;

    const memberRoleIds = new Set(message.member?.roles?.cache?.keys() || []);
    if ((setting.allowedRoleIds || []).some((roleId) => memberRoleIds.has(roleId))) return;

    try {
      await message.delete();
      await message.channel.send(`<@${message.author.id}> 招待リンクは禁止されています。`);
    } catch (error) {
      console.error("[INVITE LINK BLOCK] メッセージの削除に失敗しました", error);
    }
  },
};
