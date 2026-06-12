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
		const sendEphemeral = async (embed: EmbedBuilder) => {
			const replyPayload = { embeds: [embed], flags: ["Ephemeral"] as const };
			const editPayload = { embeds: [embed] };
			const followUpPayload = {
				embeds: [embed],
				flags: ["Ephemeral"] as const,
			};
			const tryEdit = async () => {
				try {
					return await interaction.editReply(editPayload);
				} catch (error) {
					if (
						error instanceof Error &&
						error.name === "InteractionNotReplied"
					) {
						return null;
					}
					throw error;
				}
			};
			const tryReply = async () => {
				try {
					return await interaction.reply(replyPayload);
				} catch (error) {
					if ((error as { code?: number }).code === 40060) {
						return null;
					}
					throw error;
				}
			};
			const tryFollowUp = async () => {
				try {
					return await interaction.followUp(followUpPayload);
				} catch {
					return null;
				}
			};
			if (interaction.deferred || interaction.replied) {
				const edited = await tryEdit();
				if (edited) {
					return edited;
				}
				const replied = await tryReply();
				if (replied) {
					return replied;
				}
				await tryFollowUp();
				return;
			}
			const replied = await tryReply();
			if (replied) {
				return replied;
			}
			const edited = await tryEdit();
			if (edited) {
				return edited;
			}
			await tryFollowUp();
		};

		if (!interaction.deferred && !interaction.replied) {
			try {
				await interaction.deferReply({ flags: ["Ephemeral"] as const });
			} catch {
				// If defer fails, continue and attempt a normal reply in sendEphemeral.
			}
		}

		const startedAt = Date.now();
		const measuringEmbed = new EmbedBuilder()
			.setAuthor({
				name: "🏓 計測中...",
				iconURL: SUCCESS_ICON_URL,
			})
			.setDescription("レイテンシを計測しています。")
			.setColor(0x57f287)
			.setTimestamp(new Date());

		await sendEphemeral(measuringEmbed);

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

		await sendEphemeral(embed);
	},
};

export default command;
