import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type GuildMember,
	SlashCommandBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";

const command = {
	data: new SlashCommandBuilder()
		.setName("account")
		.setDescription("経済アカウントについての情報を表示します")

		.addSubcommand((sub) =>
			sub.setName("register").setDescription("経済アカウントを登録します"),
		),
};

async function execute(interaction: ChatInputCommandInteraction) {
	const subcommand = interaction.options.getSubcommand();

	if (subcommand === "register") {
		// アカウント登録処理をここに追加
		const successEmbed = new EmbedBuilder()
			.setColor("Blue")
			.setTitle("アカウント登録")
			.setDescription(
				"経済アカウントを登録するには以下のボタンをクリックしてください。",
			);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setLabel("アカウント登録ページへ")
				.setStyle(ButtonStyle.Link)
				.setURL("https://siriusbot.f5.si/register"), // アカウント登録ページのURLに置き換えてください,
		);
		await interaction.reply({ embeds: [successEmbed], ephemeral: true });
	}
}

export { command, execute };
