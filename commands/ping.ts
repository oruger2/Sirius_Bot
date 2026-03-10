import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Botの応答速度を確認します"),
  async execute(interaction: ChatInputCommandInteraction) {
    const startedAt = Date.now();
    const measuringEmbed = new EmbedBuilder()
      .setTitle("🏓 計測中...")
      .setDescription("レイテンシを計測しています。")
      .setColor(0x57f287)
      .setTimestamp(new Date());

    await interaction.reply({ embeds: [measuringEmbed] });

    const repliedAt = Date.now();
    const apiLatencyMs = repliedAt - startedAt;
    const websocketLatencyMs = interaction.client.ws.ping;
    const totalElapsedMs = Date.now() - startedAt;

    const embed = new EmbedBuilder()
      .setTitle("🏓 Pong!")
      .setDescription("応答速度を種類別に表示します。")
      .addFields(
        { name: "WebSocket Ping", value: `${websocketLatencyMs}ms`, inline: true },
        { name: "API Latency", value: `${apiLatencyMs}ms`, inline: true }
      )
      .setColor(0x57f287)
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  }
};

export default command;
