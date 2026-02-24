const fsp = require("fs/promises");
const path = require("path");
const { EmbedBuilder, MessageFlags } = require("discord.js");

const blacklistPath = path.join(__dirname, "../json/blacklist.json");

async function readBlacklist() {
  try {
    const raw = await fsp.readFile(blacklistPath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      servers: Array.isArray(parsed.servers) ? parsed.servers : [],
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[BLACKLIST] blacklist.json の読み込みに失敗しました", error);
    }
    return { users: [], servers: [] };
  }
}

module.exports = async function blacklistCheck(interaction) {
  if (!interaction?.isChatInputCommand?.()) return false;

  const blacklist = await readBlacklist();
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
