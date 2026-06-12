import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
	ComponentType,
} from "discord.js";

const command = {
	data: new SlashCommandBuilder()
		.setName("redblue")
		.setDescription("赤青ゲームを開始します"),

	async execute(interaction: ChatInputCommandInteraction) {
		let streak = 0;
		const userId = interaction.user.id;

		// ボタンを生成するヘルパー
		const getButtons = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("redblue_red")
				.setLabel("🔴 赤")
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId("redblue_blue")
				.setLabel("🔵 青")
				.setStyle(ButtonStyle.Primary),
		);

		let message;
		try {
			// 1. 最初のメッセージを送信
			await interaction.reply({
				embeds: [createGameEmbed(streak)],
				components: [getButtons()],
			});

			// 2. コレクター用にメッセージオブジェクトを確実に取得
			message = await interaction.fetchReply();
		} catch (error) {
			console.error("[🔴🔵赤青ゲーム] 初期メッセージの送信、またはフェッチに失敗しました:", error);
			return;
		}

		// 3. コレクターを作成（5分間操作がなければ自動終了）
		const collector = message.createMessageComponentCollector({
			componentType: ComponentType.Button,
			idle: 300000,
		});

		collector.on("collect", async (i: ButtonInteraction) => {
			try {
				// 他のユーザーが押した場合は、即座にephemeralで返して終了
				if (i.user.id !== userId) {
					await i.reply({
						content: "これは他のユーザーのゲームです。自分で `/redblue` を実行して遊んでね！",
						ephemeral: true,
					});
					return;
				}

				// 正解をランダム決定
				const answer = Math.random() < 0.5 ? "red" : "blue";
				const success = i.customId === `redblue_${answer}`;

				if (!success) {
					// 失敗（ゲームオーバー）処理
					const embed = new EmbedBuilder()
						.setTitle("💀 ゲームオーバー")
						.setDescription(
							[
								`正解は **${answer === "red" ? "🔴赤" : "🔵青"}** でした`,
								"",
								`🔥 最終記録: **${streak}連勝**`,
								`🎯 到達確率: **1/${(2 ** streak).toLocaleString()}**`,
							].join("\n"),
						)
						.setColor(0xed4245);

					await i.update({ embeds: [embed], components: [] });
					collector.stop("game_over");
					return;
				}

				// 成功時処理
				streak++;

				const embed = new EmbedBuilder()
					.setTitle("✅ 正解！")
					.setDescription(
						[
							`正解は **${answer === "red" ? "🔴赤" : "🔵青"}**`,
							"",
							`🔥 **${streak}連勝中**`,
							`🎯 到達確率: **1/${(2 ** streak).toLocaleString()}**`,
							"",
							"次の色を選択してください。",
						].join("\n"),
					)
					.setColor(0x57f287);

				await i.update({
					embeds: [embed],
					components: [getButtons()],
				});

			} catch (error) {
				console.error("[🔴🔵赤青ゲーム] ボタンが押された後のインタラクション処理(collect)でエラーが発生しました:", error);
			}
		});

		// タイムアウト時の処理
		collector.on("end", async (_, reason) => {
			if (reason === "idle") {
				try {
					const embed = new EmbedBuilder()
						.setTitle("⏱️ タイムアウト")
						.setDescription(`5分間操作がなかったため、ゲームを終了しました（最終記録: ${streak}連勝）`)
						.setColor(0x7289da);

					await interaction.editReply({
						embeds: [embed],
						components: [],
					});
				} catch (error) {
					console.warn("[🔴🔵赤青ゲーム] タイムアウト時のメッセージ編集に失敗しました（すでにメッセージが削除されている可能性があります）:", error);
				}
			}
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

export default command;
