import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import { SUCCESS_ICON_URL } from "@/utils/embedIcons";

const command = {
	data: new SlashCommandBuilder()
		.setName("ping")
		.setDescription("Botの応答速度を確認します"),
	async execute(interaction: ChatInputCommandInteraction) {
		const startedAt = Date.now();
		const measuringEmbed = new EmbedBuilder()
			.setAuthor({
				name: "🏓 計測中...",
				iconURL: SUCCESS_ICON_URL,
			})
			.setDescription("レイテンシを計測しています。")
			.setColor(0x57f287)
			.setTimestamp(new Date());

		if (interaction.deferred) {
			await interaction.editReply({ embeds: [measuringEmbed] });
		} else {
			await interaction.reply({ embeds: [measuringEmbed] });
		}

		const repliedAt = Date.now();
		const apiLatencyMs = repliedAt - startedAt;
		const websocketLatencyMs = interaction.client.ws.ping;

		const embed = new EmbedBuilder()
			.setAuthor({
				name: "🏓Pong!",
				iconURL: SUCCESS_ICON_URL,
			})
			.addFields(
				{
					name: "WebSocket Ping",
					value: `${websocketLatencyMs}ms`,
					inline: true,
				},
				{ name: "API Latency", value: `${apiLatencyMs}ms`, inline: true },
			)
			.setColor(0x57f287)
			.setTimestamp(new Date());

		await interaction.editReply({ embeds: [embed] });
	},
};

export default command;
