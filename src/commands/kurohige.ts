import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	ComponentType,
	EmbedBuilder,
	type Message,
	SlashCommandBuilder,
	type User,
} from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

// グローバルマッチング用のメモリキュー
interface Waiter {
	userId: string;
	interaction: ChatInputCommandInteraction;
}
let globalQueue: Waiter | null = null;

const command = {
	data: new SlashCommandBuilder()
		.setName("kurohige")
		.setDescription("黒ひげ危機一発を開始します！")
		.addStringOption((option) =>
			option
				.setName("mode")
				.setDescription("対戦モードを選択してください")
				.setRequired(true)
				.addChoices(
					{ name: "👥 サーバー内の誰かと対戦", value: "guild" },
					{ name: "🌐 グローバル対戦（他サバ含む）", value: "global" },
					{ name: "🤖 AIと対戦", value: "ai" },
				),
		),

	async execute(interaction: ChatInputCommandInteraction) {
		// banコマンドのレスポンス制御ロジックを完全再現（ゲーム仕様に合わせ通常メッセージとして配信）
		const sendGameMessage = async (
			embed: EmbedBuilder,
			components: ActionRowBuilder<ButtonBuilder>[] = [],
		) => {
			const replyPayload = { embeds: [embed], components };
			const editPayload = { embeds: [embed], components };
			const followUpPayload = { embeds: [embed], components };

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
				if (edited) return edited;
				const replied = await tryReply();
				if (replied) return replied;
				return await tryFollowUp();
			}

			const replied = await tryReply();
			if (replied) return replied;
			const edited = await tryEdit();
			if (edited) return edited;
			return await tryFollowUp();
		};

		const replyError = async (content: string) => {
			const embed = new EmbedBuilder()
				.setAuthor({
					name: "エラー",
					iconURL: ERROR_ICON_URL,
				})
				.setDescription(content)
				.setColor(0xed4245)
				.setTimestamp(new Date());

			// エラー通知は他プレイヤーに邪魔にならないよう、banと同じくEphemeralフラグ付きで別送信
			if (interaction.deferred || interaction.replied) {
				await interaction.followUp({
					embeds: [embed],
					flags: ["Ephemeral"] as const,
				});
			} else {
				await interaction.reply({
					embeds: [embed],
					flags: ["Ephemeral"] as const,
				});
			}
		};

		// 共通の事前Defer処理
		if (!interaction.deferred && !interaction.replied) {
			try {
				// ゲーム画面を第三者に見せるため、ここではデフォルトの公開Deferにしています
				await interaction.deferReply();
			} catch {
				// Deferが失敗した場合は後続のsendGameMessageで通常Replyを試みる
			}
		}

		const mode = interaction.options.getString("mode", true);
		const user1 = interaction.user;
		const guild = interaction.guild;

		// 1. AI対戦モード
		if (mode === "ai") {
			const embed = new EmbedBuilder()
				.setTitle("🤖 黒ひげ危機一発 - AI戦")
				.setDescription("AIとの対戦を開始します！")
				.setColor(0x5865f2)
				.setTimestamp(new Date());

			const msg = (await sendGameMessage(embed)) as Message | null;
			if (!msg) return;

			await startGame(interaction, msg, user1, null, true);
			return;
		}

		// 2. サーバー内対戦モード
		if (mode === "guild") {
			if (!guild) {
				await replyError("❌ サーバー情報の取得に失敗したか、DM内です。");
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle("👥 黒ひげ危機一発 - 参加者募集")
				.setDescription(
					`${user1}が対戦相手を募集しています！\n下のボタンを押してゲームに参戦してください。`,
				)
				.setColor(0x9b59b6)
				.setTimestamp(new Date());

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId("kurohige_join")
					.setLabel("対戦に参戦する！")
					.setStyle(ButtonStyle.Primary),
			);

			const msg = (await sendGameMessage(embed, [row])) as Message | null;
			if (!msg) return;

			const collector = msg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 60000,
			});

			collector.on("collect", async (i) => {
				if (i.user.id === user1.id) {
					await i.reply({
						content: "❌ 自分自身と対戦することはできません！",
						ephemeral: true,
					});
					return;
				}
				collector.stop("matched");
				await i.deferUpdate();

				const matchedEmbed = new EmbedBuilder()
					.setTitle("⚔️ 対戦決定")
					.setDescription(
						`プレイヤー1: ${user1}\nプレイヤー2: ${i.user}\n\nゲームを開始します！`,
					)
					.setColor(0x57f287)
					.setTimestamp(new Date());

				await msg.edit({ embeds: [matchedEmbed], components: [] });
				await startGame(interaction, msg, user1, i.user, false);
			});

			collector.on("end", async (_, reason) => {
				if (reason !== "matched") {
					const timeoutEmbed = new EmbedBuilder()
						.setDescription(
							"⏳ 誰も来なかったため、募集がキャンセルされました。",
						)
						.setColor(0x95a5a6);
					await msg
						.edit({ embeds: [timeoutEmbed], components: [] })
						.catch(() => null);
				}
			});
			return;
		}

		// 3. グローバルマッチングモード
		if (mode === "global") {
			if (globalQueue && globalQueue.userId !== user1.id) {
				const opponent = globalQueue.interaction;

				const matchEmbed = new EmbedBuilder()
					.setTitle("🌐 グローバルマッチング成立！")
					.setDescription(
						`マッチングが完了しました！\n対戦相手: ${opponent.user} vs ${user1}`,
					)
					.setColor(0x57f287)
					.setTimestamp(new Date());

				// 両方のチャンネルでマッチングを報告
				try {
					await opponent.followUp({ embeds: [matchEmbed] });
					const msg = (await interaction.followUp({
						embeds: [matchEmbed],
					})) as Message;

					// 通知成功後にキューをクリア
					globalQueue = null;

					// 今回呼び出された側のコンテキスト上でゲームを開始
					await startGame(interaction, msg, opponent.user, user1, false);
				} catch (error) {
					// 通知失敗時はキューを保持
					await replyError(
						"❌ マッチング通知の送信に失敗しました。もう一度お試しください。",
					);
				}
			} else {
				globalQueue = { userId: user1.id, interaction };
				const waitEmbed = new EmbedBuilder()
					.setTitle("🌐 グローバルマッチング中")
					.setDescription(
						"他サーバーからの対戦相手を待っています...\n見つかるまでこのまましばらくお待ちください。",
					)
					.setColor(0xf1c40f)
					.setTimestamp(new Date());
				await sendGameMessage(waitEmbed);
			}
		}
	},
};

// --- コア・ゲームロジック関数 ---
async function startGame(
	interaction: ChatInputCommandInteraction,
	message: Message,
	player1: User,
	player2: User | null,
	isAi: boolean,
) {
	const totalHoles = 8;
	const loseHole = Math.floor(Math.random() * totalHoles);
	const safeHoles: number[] = [];
	let turn = 1; // 1 = player1, 2 = player2 or AI

	const getActivePlayer = (): User | { username: string; id: string } => {
		return turn === 1 ? player1 : (player2 ?? { username: "AI🤖", id: "ai" });
	};

	// ボタンの再生成ロジック
	const buildButtons = (): ActionRowBuilder<ButtonBuilder>[] => {
		const rows: ActionRowBuilder<ButtonBuilder>[] = [];
		let currentRow = new ActionRowBuilder<ButtonBuilder>();

		for (let i = 0; i < totalHoles; i++) {
			if (i > 0 && i % 4 === 0) {
				rows.push(currentRow);
				currentRow = new ActionRowBuilder<ButtonBuilder>();
			}

			const btn = new ButtonBuilder().setCustomId(`hole_click_${i}`);
			if (safeHoles.includes(i)) {
				btn.setLabel("🗡️").setStyle(ButtonStyle.Secondary).setDisabled(true);
			} else {
				btn.setLabel(`穴 ${i + 1}`).setStyle(ButtonStyle.Success);
			}
			currentRow.addComponents(btn);
		}
		rows.push(currentRow);
		return rows;
	};

	// ゲーム状態の埋め込み生成
	const buildGameEmbed = (extraText = "") => {
		return new EmbedBuilder()
			.setTitle("🏴‍☠️ 黒ひげ危機一発")
			.setDescription(`${extraText}\n👉 **現在の手番:** ${getActivePlayer()}`)
			.setColor(0x3498db)
			.setFooter({ text: `安全な穴: ${safeHoles.length} / ${totalHoles - 1}` })
			.setTimestamp(new Date());
	};

	// 初期ゲーム画面への更新
	await message
		.edit({
			embeds: [
				buildGameEmbed(
					"順番に穴を刺してください。ハズレを引くと黒ひげが飛び出します！",
				),
			],
			components: buildButtons(),
		})
		.catch(() => null);

	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		time: 300000, // 5分間のゲーム上限タイムアウト
	});

	// AIの手番自動処理
	const handleAiAction = async () => {
		await new Promise((resolve) => setTimeout(resolve, 1500)); // 思考用ディレイ

		const remainingHoles = Array.from(
			{ length: totalHoles },
			(_, i) => i,
		).filter((h) => !safeHoles.includes(h));
		const aiChoice =
			remainingHoles[Math.floor(Math.random() * remainingHoles.length)];

		if (aiChoice === loseHole) {
			collector.stop("gameover");
			const winEmbed = new EmbedBuilder()
				.setAuthor({
					name: "💥 ドカーン！ゲーム終了",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(
					`🤖 AIがハズレの穴を刺しました！\n\n🏆 **勝者: ${player1}**`,
				)
				.setColor(0x57f287)
				.setTimestamp(new Date());
			await message
				.edit({ embeds: [winEmbed], components: [] })
				.catch(() => null);
		} else {
			safeHoles.push(aiChoice);
			turn = 1;
			await message
				.edit({
					embeds: [buildGameEmbed("🤖 AIはセーフでした！")],
					components: buildButtons(),
				})
				.catch(() => null);
		}
	};

	collector.on("collect", async (i) => {
		const activePlayer = getActivePlayer();

		if (i.user.id !== activePlayer.id) {
			await i.reply({
				content: "❌ あなたのターンではありません！",
				ephemeral: true,
			});
			return;
		}

		await i.deferUpdate();
		const selected = parseInt(i.customId.split("_")[2]);

		if (selected === loseHole) {
			collector.stop("gameover");
			const winner = turn === 1 ? (isAi ? "AI🤖" : player2!) : player1;

			const loseEmbed = new EmbedBuilder()
				.setAuthor({ name: "💥 ドカーン！ゲーム終了", iconURL: ERROR_ICON_URL })
				.setDescription(
					`${i.user} がハズレを刺してしまいました！黒ひげが飛び出します！\n\n🏆 **勝者: ${winner}**`,
				)
				.setColor(0xed4245)
				.setTimestamp(new Date());

			await message
				.edit({ embeds: [loseEmbed], components: [] })
				.catch(() => null);
		} else {
			safeHoles.push(selected);

			if (isAi) {
				turn = 2;
				const aiThinkEmbed = new EmbedBuilder()
					.setTitle("🏴‍☠️ 黒ひげ危機一発")
					.setDescription("🤖 AIが穴を選択しています...")
					.setColor(0xf1c40f)
					.setTimestamp(new Date());

				await message
					.edit({ embeds: [aiThinkEmbed], components: buildButtons() })
					.catch(() => null);
				await handleAiAction();
			} else {
				turn = turn === 1 ? 2 : 1;
				await message
					.edit({
						embeds: [buildGameEmbed(`${i.user} はセーフ！`)],
						components: buildButtons(),
					})
					.catch(() => null);
			}
		}
	});

	collector.on("end", async (_, reason) => {
		if (reason === "time") {
			const timeoutEmbed = new EmbedBuilder()
				.setDescription(
					"⏳ プレイヤーの操作が無かったため、時間切れで終了しました。",
				)
				.setColor(0x95a5a6);
			await message
				.edit({ embeds: [timeoutEmbed], components: [] })
				.catch(() => null);
		}
	});
}

export default command;
