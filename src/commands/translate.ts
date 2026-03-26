import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "../utils/embedIcons.ts";

// 言語マップ
const LANG_MAP: Record<string, string> = {
	日本語: "ja",
	英語: "en",
	中国語: "zh",
	韓国語: "ko",
	アラビア語: "ar",
};

// 🔍 自動言語判定
function detectLang(text: string): string {
	if (/[\u3040-\u30ff]/.test(text)) return "ja"; // 日本語
	if (/[\u4e00-\u9fff]/.test(text)) return "zh"; // 中国語
	if (/[\uac00-\ud7af]/.test(text)) return "ko"; // 韓国語
	if (/[\u0600-\u06FF]/.test(text)) return "ar"; // アラビア語
	return "en"; // デフォルト英語
}

export default {
	data: new SlashCommandBuilder()
		.setName("translate")
		.setDescription("テキストを翻訳します")
		.addStringOption((option) =>
			option.setName("text").setDescription("翻訳する文章").setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName("to")
				.setDescription("翻訳先言語")
				.setRequired(true)
				.addChoices(
					{ name: "日本語", value: "日本語" },
					{ name: "英語", value: "英語" },
					{ name: "中国語", value: "中国語" },
					{ name: "韓国語", value: "韓国語" },
					{ name: "アラビア語", value: "アラビア語" },
				),
		),

	async execute(interaction: ChatInputCommandInteraction) {
		const text = interaction.options.getString("text", true);
		const toInput = interaction.options.getString("to", true);

		const targetLang = LANG_MAP[toInput];
		const sourceLang = detectLang(text);

		try {
			// 同じ言語チェック
			if (sourceLang === targetLang) {
				const errorEmbed = new EmbedBuilder()
					.setAuthor({
						name: "エラー",
						iconURL: ERROR_ICON_URL,
					})
					.setDescription("❌ 同じ言語には翻訳できません")
					.setColor(0xed4245)
					.setTimestamp();
				return await interaction.reply({
					embeds: [errorEmbed],
					ephemeral: true,
				});
			}

			// 🔥 API
			const res = await fetch(
				"https://api.mymemory.translated.net/get?q=" +
					encodeURIComponent(text) +
					"&langpair=" +
					sourceLang +
					"|" +
					targetLang,
			);

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(errText);
			}

			const data = await res.json();

			const translated =
				data?.responseData?.translatedText || "翻訳できませんでした";

			const embed = new EmbedBuilder()
				.setAuthor({
					name: "翻訳結果",
					iconURL: SUCCESS_ICON_URL,
				})
				.addFields(
					{
						name: "入力",
						value: `\`\`\`\n${text}\n\`\`\``,
					},
					{
						name: "翻訳",
						value: `\`\`\`\n${translated}\n\`\`\``,
					},
				)
				.setColor(0x00bfff)
				.setTimestamp();

			// ✅ replyのみ使用（安全）
			await interaction.reply({
				embeds: [embed],
			});
		} catch (error) {
			console.error("Translate Error:", error);

			// ❗ 必ずreply
			if (!interaction.replied) {
				const errorEmbed = new EmbedBuilder()
					.setAuthor({
						name: "エラー",
						iconURL: ERROR_ICON_URL,
					})
					.setDescription("❌ 翻訳に失敗しました")
					.setColor(0xed4245)
					.setTimestamp();
				await interaction.reply({
					embeds: [errorEmbed],
					ephemeral: true,
				});
			}
		}
	},
};
