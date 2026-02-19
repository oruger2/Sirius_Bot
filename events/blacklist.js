const fs = require("fs");
const path = require("path");
const { EmbedBuilder, MessageFlags } = require("discord.js");

const blacklistPath = path.join(__dirname, "../json/blacklist.json");

function readBlacklist() {
  if (!fs.existsSync(blacklistPath)) {
    return { users: [], servers: [] };
  }

  try {
    const raw = fs.readFileSync(blacklistPath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      servers: Array.isArray(parsed.servers) ? parsed.servers : [],
    };
  } catch (error) {
    console.error("[BLACKLIST] blacklist.json の読み込みに失敗しました", error);
    return { users: [], servers: [] };
  }
}

module.exports = async function blacklistCheck(interaction) {
  if (!interaction?.isChatInputCommand?.()) return false;

  const blacklist = readBlacklist();
  const userId = interaction.user?.id;
  const guildId = interaction.guildId;

  if (userId && blacklist.users.includes(userId)) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("🚫 アクセス拒否")
          .setDescription("あなたは **ブラックリスト** に登録されています。"),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (guildId && blacklist.servers.includes(guildId)) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("DarkRed")
          .setTitle("🚫 サーバーブロック")
          .setDescription("このサーバーは **ブラックリスト** に登録されています。"),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return false;
};