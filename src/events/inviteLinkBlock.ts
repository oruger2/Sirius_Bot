import {
	EmbedBuilder,
	Events,
	type Message,
	PermissionsBitField,
} from "discord.js";

const inviteRegex =
	/(https?:\/\/)?(www\.)?(discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9]+/i;

export default {
	name: Events.MessageCreate,

	async execute(message: Message): Promise<void> {
		if (!message.guild || message.author.bot) return;

		// 管理者は除外
		if (
			message.member?.permissions.has(PermissionsBitField.Flags.Administrator)
		) {
			return;
		}

		if (!inviteRegex.test(message.content)) return;

		try {
			await message.delete();

			const embed = new EmbedBuilder()
				.setTitle("🚫 招待リンクは禁止です")
				.setDescription(
					`${message.author} サーバー招待リンクの送信は禁止されています。`,
				)
				.setColor("Red")
				.setTimestamp();

			if (!message.channel.isSendable()) return;

			const warning = await message.channel.send({
				content: `${message.author}`,
				embeds: [embed],
			});

			setTimeout(() => {
				warning.delete().catch(() => {});
			}, 10000);
		} catch (error) {
			console.error("招待リンク削除エラー:", error);
		}
	},
};
