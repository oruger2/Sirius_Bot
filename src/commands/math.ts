import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

type AIResponse = {
	choices: {
		message: {
			content: string;
		};
	}[];
};

const command = {
	data: new SlashCommandBuilder()
		.setName("math-ai")
		.setDescription("数学の問題を途中式付きで解きます")
		.addStringOption((option) =>
			option
				.setName("problem")
				.setDescription("問題を入力（例: x^2 - 5x + 6 = 0）")
				.setRequired(true),
		),

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

		const replyError = async (content: string) => {
			const embed = new EmbedBuilder()
				.setAuthor({
					name: "エラー",
					iconURL: ERROR_ICON_URL,
				})
				.setDescription(content)
				.setColor(0xed4245)
				.setTimestamp(new Date());
			await sendEphemeral(embed);
		};

		if (!interaction.deferred && !interaction.replied) {
			try {
				await interaction.deferReply({ flags: ["Ephemeral"] as const });
			} catch {
				// If defer fails, continue and attempt a normal reply in sendEphemeral.
			}
		}

		const problem = interaction.options.getString("problem", true);

		const now = new Date().toLocaleString("ja-JP", {
			timeZone: "Asia/Tokyo",
		});

		try {
			const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "deepseek/deepseek-chat",
					messages: [
						{
							role: "system",
							content: `
	あなたは優秀な数学教師です。
	
	【ルール】
	- 必ず途中式をすべて書く
	- 高校数学（数I・Ⅱ・Ⅲ）レベルで説明
	- 数式はわかりやすく整理
	- 最後に答えを明確に書く
	- 間違った情報を絶対に出さない
	- わからない場合は「解けません」と言う
	
	【現在日時】
	${now}
	              `,
						},
						{
							role: "user",
							content: problem,
						},
					],
				}),
			});

			if (!res.ok) {
				console.error(await res.text());
				throw new Error("API error");
			}

			const data = (await res.json()) as AIResponse;

			const answer =
				data?.choices?.[0]?.message?.content ?? "❌ 解答を取得できませんでした";

			const embed = new EmbedBuilder()
				.setAuthor({
					name: "数学AI 解答",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(answer.slice(0, 4000))
				.setColor(0x5865f2)
				.setTimestamp();

			await sendEphemeral(embed);
		} catch (error) {
			console.error("数学AIエラー:", error);
			await replyError("❌ 解答に失敗しました");
		}
	},
};

export default command;
