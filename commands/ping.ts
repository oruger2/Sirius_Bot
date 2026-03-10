import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Botの応答速度を確認します"),
  async execute(interaction: ChatInputCommandInteraction) {
    const sentAt = Date.now();
    await interaction.reply({ content: "🏓 計測中...", fetchReply: true });

    const responseLatency = Date.now() - sentAt;
    const apiLatency = interaction.client.ws.ping;

    await interaction.editReply(
      `🏓 Pong! 応答速度: ${responseLatency}ms / API: ${apiLatency}ms`
    );
  }
};

export default command;
