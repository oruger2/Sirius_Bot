const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Botの応答速度を表示します"),

  async execute(interaction) {
    // 先に仮返信
    await interaction.reply("🏓 計測中...");
    const sent = await interaction.fetchReply();

    const embed = new EmbedBuilder()
      .setTitle("🏓 Pong!")
      .setColor("Green")
      .addFields(
        {
          name: "WebSocket Ping",
          value: `${interaction.client.ws.ping}ms`,
          inline: true,
        },
        {
          name: "API Latency",
          value: `${sent.createdTimestamp - interaction.createdTimestamp}ms`,
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};
