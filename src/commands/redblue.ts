import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import { SUCCESS_ICON_URL } from "@/utils/embedIcons";

type GameData = {
	streak: number;
};

const games = new Map<string, GameData>();

const command = {
	data: new SlashCommandBuilder()
		.setName("redblue")
		.setDescription("赤青ゲームを開始します"),

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
				await interaction.deferReply();
			} catch {
				// If defer fails, continue.
			}
		}

		games.set(interaction.user.id, {
			streak: 0,
		});

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("redblue_red")
				.setLabel("🔴 赤")
				.setStyle(ButtonStyle.Danger),

			new ButtonBuilder()
				.setCustomId("redblue_blue")
				.setLabel("🔵 青")
				.setStyle(ButtonStyle.Primary),
		);

		const embed = createGameEmbed(0);
		await interaction.editReply({
			embeds: [embed],
			components: [row],
		});
	},
};

function createGameEmbed(streak: number) {
	const odds = 2 ** streak;

	return new EmbedBuilder()
		.setTitle("🔴🔵 赤青ゲーム")
		.setDescription(
			[
				`🔥 **${streak}連勝中**`,
				`🎯 到達確率: **1/${odds.toLocaleString()}**`,
				"",
				"赤か青を選択してください。",
			].join("\n"),
		)
		.setColor(0x5865f2);
}

export async function handleRedBlueButton(interaction: ButtonInteraction) {
	if (
		interaction.customId !== "redblue_red" &&
		interaction.customId !== "redblue_blue"
	) {
		return;
	}

	const game = games.get(interaction.user.id);

	if (!game) {
		await interaction.reply({
			content: "ゲームが開始されていません。",
			ephemeral: true,
		});
		return;
	}

	// 正解をランダム決定
	const answer = Math.random() < 0.5 ? "red" : "blue";

	const success = interaction.customId === `redblue_${answer}`;

	// 失敗
	if (!success) {
		const embed = new EmbedBuilder()
			.setTitle("💀 ゲームオーバー")
			.setDescription(
				[
					`正解は **${answer === "red" ? "🔴赤" : "🔵青"}** でした`,
					"",
					`🔥 最終記録: **${game.streak}連勝**`,
					`🎯 到達確率: **1/${(2 ** game.streak).toLocaleString()}**`,
				].join("\n"),
			)
			.setColor(0xed4245);

		games.delete(interaction.user.id);

		await interaction.update({
			embeds: [embed],
			components: [],
		});

		return;
	}

	// 成功
	game.streak++;

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("redblue_red")
			.setLabel("🔴 赤")
			.setStyle(ButtonStyle.Danger),

		new ButtonBuilder()
			.setCustomId("redblue_blue")
			.setLabel("🔵 青")
			.setStyle(ButtonStyle.Primary),
	);

	const embed = new EmbedBuilder()
		.setTitle("✅ 正解！")
		.setDescription(
			[
				`正解は **${answer === "red" ? "🔴赤" : "🔵青"}**`,
				"",
				`🔥 **${game.streak}連勝中**`,
				`🎯 到達確率: **1/${(2 ** game.streak).toLocaleString()}**`,
				"",
				"次の色を選択してください。",
			].join("\n"),
		)
		.setColor(0x57f287);

	await interaction.update({
		embeds: [embed],
		components: [row],
	});
}

export default command;
