const { Events, REST, Routes, ActivityType } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅  Logged in as ${client.user.tag}`);

    /* ===== ステータス更新 ===== */
    const updateStatus = () => {
      const servers = client.guilds.cache.size;

      const users = client.guilds.cache.reduce(
        (total, guild) => total + (guild.memberCount ?? 0),
        0
      );

      const ping = Math.round(client.ws.ping);

      client.user.setActivity(
        `Servers: ${servers} | Users: ${users} | Ping: ${ping}ms`,
        { type: ActivityType.Playing }
      );
    };

    // 起動直後 & 定期更新（超重要）
    updateStatus();
    setInterval(updateStatus, 30_000);

    /* ===== コマンド読み込み ===== */
    const commands = [];
    const commandFiles = fs
      .readdirSync(path.join(__dirname, "../commands"))
      .filter(file => file.endsWith(".js"));

    for (const file of commandFiles) {
      const command = require(`../commands/${file}`);
      if (command.data && command.execute) {
        commands.push(command.data.toJSON());
        console.log(`✔ Command loaded: ${command.data.name}`);
      } else {
        console.warn(`⚠ ${file} は data / execute が不足しています`);
      }
    }

    /* ===== スラッシュコマンド登録 ===== */
    const token = process.env.DISCORD_BOT_TOKEN
    if (!token) {
      console.error("❌ BOT TOKEN が設定されていません");
      return;
    }

    const rest = new REST({ version: "10" }).setToken(token);

    try {
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      console.log("✅  スラッシュコマンドの登録が完了しました");
    } catch (error) {
      console.error("❌ コマンド登録失敗:", error);
    }
  }
};
