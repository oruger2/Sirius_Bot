import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import { SUCCESS_ICON_URL } from "@/utils/embedIcons";

const command = {
	data: new SlashCommandBuilder()
		.setName("about")
		.setDescription("Botの情報を表示します"),
	async execute(interaction: ChatInputCommandInteraction) {
		const sendEphemeral = async (
			embed: EmbedBuilder,
			components?: ActionRowBuilder<ButtonBuilder>[],
		) => {
			const replyPayload = {
				embeds: [embed],
				flags: ["Ephemeral"] as const,
				components,
			};
			const editPayload = { embeds: [embed], components };
			const followUpPayload = {
				embeds: [embed],
				flags: ["Ephemeral"] as const,
				components,
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

		const embed = new EmbedBuilder()
			.setAuthor({
				name: "Botについて",
				iconURL: SUCCESS_ICON_URL,
			})
			.setDescription(
				"このBotはサーバー管理・経済・AIなど様々な機能を提供します。\n\n" +
					"**Version**: 2.16.0\n" +
					"**developer**: Oruger-0730\n" +
					"**使用言語**: TypeScript\n\n" +
					"新機能の追加やバグの修正は随時行っています。ご意見がある場合はサポートサーバーまでお越しください。",
			)
			.setColor(0x5865f2)
			.setTimestamp(new Date());
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setLabel("サポートサーバー")
				.setStyle(ButtonStyle.Link)
				.setURL("https://discord.gg/trysmYTmNr"),
			new ButtonBuilder()
				.setLabel("公式ホームページ")
				.setStyle(ButtonStyle.Link)
				.setURL("https://siriusbot.f5.si/"),
		);
		await sendEphemeral(embed, [row] as const);
	},
};
export default command;
