import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";

type GameData = {
	streak: number;
	// タイムアウトやボタン処理で安全に画面を更新するため、元のinteractionを保持する
	commandInteraction: ChatInputCommandInteraction;
	timeout: NodeJS.Timeout;
};

// 進行中のゲームを管理するMap (Key: コマンドを実行したユーザーのID)
const games = new Map<string, GameData>();

const GAME_TIMEOUT_MS = 300000; // 5分間操作がなければ自動終了

const command = {
	data: new SlashCommandBuilder()
		.setName("redblue")
		.setDescription("赤青ゲームを開始します（1人プレイ専用）"),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.deferred && !interaction.replied) {
			try {
				await interaction.deferReply();
			} catch {
				// デファー失敗時はそのまま続行
			}
		}

		const userId = interaction.user.id;

		// 既にゲームが実行中の場合は古いセッション（タイマー含む）をクリア
		const existingGame = games.get(userId);
		if (existingGame) {
			clearTimeout(existingGame.timeout);
		}

		// 5分間の放置タイムアウトを設定
		const timeout = setTimeout(async () => {
			await handleGameTimeout(userId);
		}, GAME_TIMEOUT_MS);

		// 初期データを登録
		games.set(userId, {
			streak: 0,
			commandInteraction: interaction,
			timeout: timeout,
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

// ゲーム画面の共通Embed生成
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
		.setColor(0x5865f2)
		.setTimestamp(new Date());
}

// ⏱️ 放置された時のタイムアウト処理
async function handleGameTimeout(userId: string) {
	const game = games.get(userId);
	if (!game) return;

	games.delete(userId);

	const timeoutEmbed = new EmbedBuilder()
		.setTitle("⏳ タイムアウト")
		.setDescription(
			`一定時間操作がなかったため、ゲームを終了しました。\n\n🔥 最終記録: **${game.streak}連勝**`,
		)
		.setColor(0x95a5a6)
		.setTimestamp(new Date());

	try {
		await game.commandInteraction.editReply({
			embeds: [timeoutEmbed],
			components: [],
		});
	} catch {
		// メッセージが削除されている場合などのエラーハンドリング
	}
}

// 🔲 ボタン押下時のハンドラー
export async function handleRedBlueButton(interaction: ButtonInteraction) {
	if (
		interaction.customId !== "redblue_red" &&
		interaction.customId !== "redblue_blue"
	) {
		return;
	}

	// ボタンを押した本人のゲームデータを取得
	const clickerId = interaction.user.id;
	const game = games.get(clickerId);

	// 他人が押した、またはセッションがない場合は即弾く（インラインリプライでインタラクションを通す）
	if (!game) {
		await interaction.reply({
			content:
				"❌ これはあなたのゲーム画面ではないか、セッションが既に終了しています。自分で `/redblue` を実行して遊んでね！",
			ephemeral: true,
		});
		return;
	}

	// 【最重要】インタラクション失敗を防ぐため、まずはボタンの応答を保留(確定)する
	await interaction.deferUpdate();

	// 操作があったので既存のタイマーを一度リセットし、新しく5分計測開始
	clearTimeout(game.timeout);
	game.timeout = setTimeout(async () => {
		games.delete(clickerId);
		const timeoutEmbed = new EmbedBuilder()
			.setTitle("⏳ タイムアウト")
			.setDescription(
				`一定時間操作がなかったため、ゲームを終了しました。\n\n🔥 最終記録: **${game.streak}連勝**`,
			)
			.setColor(0x95a5a6);
		await game.commandInteraction
			.editReply({ embeds: [timeoutEmbed], components: [] })
			.catch(() => null);
	}, GAME_TIMEOUT_MS);

	// 正解をランダム決定 (1/2)
	const answer = Math.random() < 0.5 ? "red" : "blue";
	const success = interaction.customId === `redblue_${answer}`;

	// 💥 失敗（ゲームオーバー）
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
			.setColor(0xed4245)
			.setTimestamp(new Date());

		// ゲームオーバーなのでタイマーを消してMapから削除
		clearTimeout(game.timeout);
		games.delete(clickerId);

		// 元のコマンドインタラクション経由で確実に画面を更新
		await game.commandInteraction.editReply({
			embeds: [embed],
			components: [],
		});
		return;
	}

	// 🟢 成功
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
		.setColor(0x57f287)
		.setTimestamp(new Date());

	// 元のコマンドインタラクション経由で確実に画面を更新
	await game.commandInteraction.editReply({
		embeds: [embed],
		components: [row],
	});
}

export default command;
