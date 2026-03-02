const { getGuildBumpUpNotifierSetting } = require("../utils/bumpUpNotifierSettings");

const DISBOARD_BOT_ID = "302050872383242240";
const DISSOKU_BOT_ID = "761562078095867916";
const BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const UP_COOLDOWN_MS = 60 * 60 * 1000;

const timers = new Map();

function getGuildTimerState(guildId) {
  if (!timers.has(guildId)) {
    timers.set(guildId, { bump: null, up: null });
  }
  return timers.get(guildId);
}

function hasText(message, regex) {
  if (regex.test(message.content || "")) return true;

  for (const embed of message.embeds || []) {
    if (regex.test(embed.title || "")) return true;
    if (regex.test(embed.description || "")) return true;
    for (const field of embed.fields || []) {
      if (regex.test(field.name || "") || regex.test(field.value || "")) return true;
    }
  }

  return false;
}

function scheduleNotify(message, type, delayMs, mentionRoleId) {
  const guildId = message.guild.id;
  const state = getGuildTimerState(guildId);

  if (state[type]) {
    clearTimeout(state[type]);
  }

  state[type] = setTimeout(async () => {
    try {
      const setting = await getGuildBumpUpNotifierSetting(guildId);
      if (!setting.enabled || !setting.notifyChannelId) return;

      const channel = await message.client.channels.fetch(setting.notifyChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) return;

      const roleId = type === "bump" ? setting.bumpMentionRoleId : setting.upMentionRoleId;
      const mention = roleId ? `<@&${roleId}> ` : "";
      const label = type === "bump" ? "/bump" : "/up";

      await channel.send(`${mention}🔔 ${label} の時間です！`);
    } catch (error) {
      console.error(`[BUMP/UP NOTIFIER] ${type} 通知送信失敗`, error);
    } finally {
      const latest = getGuildTimerState(guildId);
      latest[type] = null;
    }
  }, delayMs);
}

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (!message.guild || !message.author.bot) return;

    const setting = await getGuildBumpUpNotifierSetting(message.guild.id);
    if (!setting.enabled || !setting.notifyChannelId) return;

    if (
      message.author.id === DISBOARD_BOT_ID &&
      hasText(message, /bump done|表示順をアップ|次にbumpできる|next bump/i)
    ) {
      scheduleNotify(message, "bump", BUMP_COOLDOWN_MS, setting.bumpMentionRoleId);
      return;
    }

    if (
      message.author.id === DISSOKU_BOT_ID &&
      hasText(message, /up done|次にup|表示順をアップ|アップを受け付け/i)
    ) {
      scheduleNotify(message, "up", UP_COOLDOWN_MS, setting.upMentionRoleId);
    }
  },
};
