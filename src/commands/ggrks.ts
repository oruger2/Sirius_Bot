import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

const command = {
	data: new SlashCommandBuilder()
		.setName("ggrks")
		.setDescription("Google検索URLを作成します")
		.addStringOption((option) =>
			option.setName("query").setDescription("検索語句").setRequired(true),
		),

	async execute(interaction: ChatInputCommandInteraction) {
		const query = interaction.options.getString("query", true).trim();

		if (!query) {
			const embed = new EmbedBuilder()
				.setAuthor({ name: "エラー", iconURL: ERROR_ICON_URL })
				.setColor(0xed4245)
				.setDescription("❌ 検索語句を入力してください。");

			await interaction.reply({ embeds: [embed], flags: ["Ephemeral"] });
			return;
		}

		const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
		const embed = new EmbedBuilder()
			.setAuthor({
				name: "ggrks",
				iconURL: SUCCESS_ICON_URL,
			})
			.setColor(0x4285f4)
			.setDescription(`[Googleで検索する](${searchUrl})`)
			.addFields({ name: "検索語句", value: query })
			.setTimestamp(new Date());

		await interaction.reply({ embeds: [embed] });
	},
};

export default command;
