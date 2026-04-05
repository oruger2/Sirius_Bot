import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

type OpenRouterResponse = {
	choices: {
		message: {
			content: string;
		};
	}[];
};

const command = {
	data: new SlashCommandBuilder()
		.setName("ai")
		.setDescription("AIに質問します")
		.addStringOption((option) =>
			option.setName("prompt").setDescription("質問内容").setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName("personality")
				.setDescription("AIの性格")
				.setRequired(false)
				.addChoices(
					{ name: "普通", value: "normal" },
					{ name: "丁寧", value: "polite" },
					{ name: "ツンデレ", value: "tsundere" },
					{ name: "フレンドリー", value: "friendly" },
					{ name: "関西弁", value: "kansai" },
				),
		),

	async execute(interaction: ChatInputCommandInteraction) {
		const prompt = interaction.options.getString("prompt", true);
		const personality =
			interaction.options.getString("personality") || "normal";

		if (!interaction.deferred && !interaction.replied) {
			await interaction.deferReply();
		}

		// ✅ 現在時刻
		const now = new Date().toLocaleString("ja-JP", {
			timeZone: "Asia/Tokyo",
		});

		// ✅ 性格ごとの設定
		const personalityMap: Record<string, string> = {
			normal: "あなたは普通のAIです。簡潔に答えてください。",
			polite: "あなたは丁寧なAIです。敬語で優しく答えてください。",
			tsundere:
				"あなたはツンデレです。素直じゃないが時々優しく答えてください。",
			friendly: "あなたはフレンドリーなAIです。カジュアルに話してください。",
			kansai: "あなたは関西弁で話すAIです。自然な関西弁で答えてください。",
		};

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
							content: `現在の日時は ${now} です。
この情報を必ず正しく使用してください。
不明なことは「わかりません」と答えてください。
嘘の情報を作らないでください。`,
						},
						{
							role: "system",
							content: personalityMap[personality],
						},
						{
							role: "user",
							content: prompt,
						},
					],
				}),
			});

			if (!res.ok) {
				console.error("APIエラー:", await res.text());
				throw new Error("API request failed");
			}

			const data = (await res.json()) as OpenRouterResponse;

			const reply =
				data?.choices?.[0]?.message?.content ?? "❌ 応答が取得できませんでした";

			const embed = new EmbedBuilder()
				.setAuthor({
					name: "AIの応答",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(reply.slice(0, 4000))
				.setColor(0x5865f2)
				.setFooter({
					text: `性格: ${personality}`,
				})
				.setTimestamp();

			await interaction.editReply({
				embeds: [embed],
			});
		} catch (error) {
			console.error("AIエラー:", error);

			const embed = new EmbedBuilder()
				.setAuthor({
					name: "エラー",
					iconURL: ERROR_ICON_URL,
				})
				.setColor(0xed4245)
				.setDescription("❌ AIの取得に失敗しました");

			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ embeds: [embed] });
			} else {
				await interaction.reply({ embeds: [embed] });
			}
		}
	},
};

export default command;
