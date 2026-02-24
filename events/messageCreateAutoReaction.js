const { getGuildAutoReactionSetting } = require("../utils/autoReactionSettings");

function toReactionValue(emoji) {
  const customEmojiMatch = String(emoji).match(/^<?a?:\w+:(\d+)>?$/);
  if (customEmojiMatch) return customEmojiMatch[1];
  if (/^\d+$/.test(String(emoji))) return String(emoji);
  return emoji;
}

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const setting = await getGuildAutoReactionSetting(message.guild.id);
    if (!setting.enabled) return;
    if (!setting.channelIds.includes(message.channel.id)) return;
    if (!Array.isArray(setting.emojis) || setting.emojis.length === 0) return;

    for (const emoji of setting.emojis) {
      try {
        await message.react(toReactionValue(emoji));
      } catch (error) {
        console.warn(`[AUTO REACTION] リアクション失敗: guild=${message.guild.id} emoji=${emoji}`);
      }
    }
  },
};
