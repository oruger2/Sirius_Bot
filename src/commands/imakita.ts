import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

type OpenRouterResponse = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
};

const MAX_FETCH_COUNT = 100;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_LINE_LENGTH = 180;
const MAX_TRANSCRIPT_LENGTH = 12_000;

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();

const buildMessageBody = (message: {
	content: string;
	embeds: Array<{
		title?: string | null;
		description?: string | null;
		author?: { name?: string | null } | null;
		fields?: Array<{ name: string; value: string }>;
	}>;
	attachments: { size: number };
}) => {
	const embedText = message.embeds
		.flatMap((embed) => [
			embed.title,
			embed.description,
			embed.author?.name,
			...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
		])
		.filter((value): value is string => Boolean(value))
		.join(" ");

	const attachmentText =
		message.attachments.size > 0
			? ` 添付ファイル${message.attachments.size}件`
			: "";

	return collapseWhitespace(
		`${message.content} ${embedText}${attachmentText}`.trim(),
	);
};

const truncate = (text: string, maxLength: number) =>
	text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;

const command = {
	data: new SlashCommandBuilder()
		.setName("imakita")
		.setDescription("今話している内容をAIで簡潔にまとめます")
		.setDefaultMemberPermissions(PermissionFlagsBits.ReadMessageHistory),

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

		const channel = interaction.channel;
		if (!channel?.isTextBased() || channel.isDMBased()) {
			await replyError("❌ このコマンドはテキストチャンネルでのみ使えます。");
			return;
		}

		try {
			const fetchedMessages = await channel.messages.fetch({
				limit: MAX_FETCH_COUNT,
			});
			const cutoff = Date.now() - WINDOW_MS;

			const transcriptLines = fetchedMessages
				.filter((message) => !message.author.bot)
				.filter((message) => message.createdTimestamp >= cutoff)
				.sort((a, b) => a.createdTimestamp - b.createdTimestamp)
				.map((message) => {
					const body = buildMessageBody(message);
					if (!body) return null;

					const timestamp = new Date(
						message.createdTimestamp,
					).toLocaleTimeString("ja-JP", {
						timeZone: "Asia/Tokyo",
						hour: "2-digit",
						minute: "2-digit",
					});
					const speaker =
						message.member?.displayName ??
						message.author.globalName ??
						message.author.username;

					return `[${timestamp}] ${speaker}: ${truncate(body, MAX_LINE_LENGTH)}`;
				})
				.filter((line): line is string => Boolean(line));

			if (transcriptLines.length === 0) {
				await replyError(
					"❌ 直近15分以内の会話が見つかりませんでした。メッセージが少し増えてから試してください。",
				);
				return;
			}

			const transcript = truncate(
				transcriptLines.join("\n"),
				MAX_TRANSCRIPT_LENGTH,
			);

			const now = new Date().toLocaleString("ja-JP", {
				timeZone: "Asia/Tokyo",
			});

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
							content: `現在の日時は ${now} です。
	あなたはDiscord会話の要約係です。
	与えられた会話だけを根拠に、日本語で簡潔に要約してください。
	推測で話を補わず、不明な点は不明と書いてください。
	出力は次の形式にしてください。
	話題: 1文
	要点:
	- 箇条書きで最大3点
	必要なら最後に「未解決: ...」を1行だけ追加`,
						},
						{
							role: "user",
							content: `以下は同じチャンネルの直近会話です。今話している内容を簡潔に教えてください。\n\n${transcript}`,
						},
					],
				}),
			});

			if (!res.ok) {
				console.error("Imakita APIエラー:", await res.text());
				throw new Error("API request failed");
			}

			const data = (await res.json()) as OpenRouterResponse;
			const summary =
				data.choices?.[0]?.message?.content?.trim() ??
				"❌ 要約を取得できませんでした。";

			const embed = new EmbedBuilder()
				.setAuthor({
					name: "今北産業",
					iconURL: SUCCESS_ICON_URL,
				})
				.setColor(0x5865f2)
				.setDescription(truncate(summary, 4000))
				.addFields({
					name: "解析範囲",
					value: `直近${transcriptLines.length}件 / 15分以内 / 最大${MAX_FETCH_COUNT}件取得`,
				})
				.setTimestamp();

			await sendEphemeral(embed);
		} catch (error) {
			console.error("Imakita Error:", error);
			await replyError(
				"❌ 会話の取得またはAI要約に失敗しました。Botにメッセージ履歴閲覧権限があるかも確認してください。",
			);
		}
	},
};

export default command;
