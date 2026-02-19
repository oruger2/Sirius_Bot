const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const os = require("os");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Botの稼働状況・システム情報を表示します"),

  async execute(interaction) {
    const client = interaction.client;

    // ===== Discord情報 =====
    const guildCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce(
      (total, guild) => total + guild.memberCount,
      0
    );
    const ping = client.ws.ping;

    // ===== Uptime =====
    const uptimeSec = Math.floor(client.uptime / 1000);
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = uptimeSec % 60;

    // ===== Memory =====
    const memUsage = process.memoryUsage();
    const usedMemMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const totalMemMB = (os.totalmem() / 1024 / 1024).toFixed(0);
    const memPercent = ((usedMemMB / 250) * 100).toFixed(1);

    // ===== CPU =====
    const cpuModel = os.cpus()[0].model;
    const cpuCores = os.cpus().length;
    const loadAvg = os.loadavg()[0].toFixed(2); // 1分平均

    // ===== OS =====
    const platform = os.platform();
    const arch = os.arch();
    const osRelease = os.release();

    const embed = new EmbedBuilder()
      .setTitle("📊 Bot Status")
      .setColor("Green")
      .addFields(
        { name: "🟢 Status", value: "Online", inline: true },
        { name: "📡 Ping", value: `${ping}ms`, inline: true },
        { name: "🕒 Uptime", value: `${h}h ${m}m ${s}s`, inline: true },

        { name: "🌐 Servers", value: `${guildCount}`, inline: true },
        { name: "👥 Users", value: `${userCount}`, inline: true },

        {
          name: "🧠 Memory",
          value: `${usedMemMB}MB / ${totalMemMB}MB (${memPercent}%)`,
          inline: false,
        },
        {
          name: "⚙️ CPU",
          value: `${cpuModel}\nCores: ${cpuCores} | Load: ${loadAvg}`,
          inline: false,
        },
        {
          name: "💻 OS",
          value: `${platform} ${arch}\n${osRelease}`,
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
