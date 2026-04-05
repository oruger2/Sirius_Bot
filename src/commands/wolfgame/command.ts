import {
	type ChatInputCommandInteraction,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import { sessionsByGameId, sessionsByGuild } from "./registry";
import { WolfGameSession } from "./session";

const command = {
	data: new SlashCommandBuilder()
		.setName("wolfgame")
		.setDescription("人狼ゲームの募集を開始します"),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.inGuild() || !interaction.guild || !interaction.channel) {
			await interaction.reply({
				content: "このコマンドはサーバー内で実行してください。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (sessionsByGuild.has(interaction.guild.id)) {
			await interaction.reply({
				content: "このサーバーではすでに進行中の人狼ゲームがあります。",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const session = new WolfGameSession({
			client: interaction.client,
			guildId: interaction.guild.id,
			hostId: interaction.user.id,
			sourceChannelId: interaction.channel.id,
		});

		sessionsByGuild.set(interaction.guild.id, session);
		sessionsByGameId.set(session.gameId, session);

		await interaction.reply({
			embeds: [session.buildRecruitEmbed()],
			components: session.buildRecruitButtons(),
		});
		const message = await interaction.fetchReply();

		session.recruitMessageId = message.id;
	},
};

export default command;
