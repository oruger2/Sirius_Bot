import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Botの応答速度を確認します"),
  async execute(interaction: ChatInputCommandInteraction) {
    const getCodeOrName = (error: unknown) =>
      (error as { code?: number | string; name?: string }).code ??
      (error as { code?: number | string; name?: string }).name;
    const getErrorMessage = (error: unknown) =>
      error instanceof Error ? error.message : String(error ?? "");
    const isUnknownInteraction = (error: unknown) =>
      getCodeOrName(error) === 10062 || /unknown interaction/i.test(getErrorMessage(error));

    const startedAt = Date.now();
    const measuringEmbed = new EmbedBuilder()
      .setTitle("🏓 計測中...")
      .setDescription("レイテンシを計測しています。")
      .setColor(0x57f287)
      .setTimestamp(new Date());

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }
      await interaction.editReply({ embeds: [measuringEmbed] });
    } catch (error) {
      if (isUnknownInteraction(error)) {
        return;
      }
      throw error;
    }

    const repliedAt = Date.now();
    const apiLatencyMs = repliedAt - startedAt;
    const websocketLatencyMs = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: "🏓Pong!",
        iconURL:
          "https://cdn.discordapp.com/attachments/1477252358621630484/1480920036628627606/image.png?ex=69b16dc2&is=69b01c42&hm=b19997b57ee8665a02efdf9299d0bf5acc44e49a5585712bc43d85b66da76193"
      })
      .addFields(
        { name: "WebSocket Ping", value: `${websocketLatencyMs}ms`, inline: true },
        { name: "API Latency", value: `${apiLatencyMs}ms`, inline: true }
      )
      .setColor(0x57f287)
      .setTimestamp(new Date());

    try {
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      if (isUnknownInteraction(error)) {
        return;
      }
      throw error;
    }
  }
};

export default command;
