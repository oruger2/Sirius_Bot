import {
	EmbedBuilder,
	Events,
	type Message,
	PermissionsBitField,
} from "discord.js";

type MessageMetadata = {
	timestamp: number;
	messageId: string;
	channelId: string;
};

const userMessages = new Map<string, MessageMetadata[]>();

// Periodic cleanup to prevent memory buildup
setInterval(() => {
	const now = Date.now();
	for (const [key, logs] of userMessages.entries()) {
		const recentLogs = logs.filter((log) => now - log.timestamp < 5000);
		if (recentLogs.length === 0) {
			userMessages.delete(key);
		} else {
			userMessages.set(key, recentLogs);
		}
	}
}, 30000); // Clean up every 30 seconds

export default {
	name: Events.MessageCreate,

	async execute(message: Message): Promise<void> {
		if (!message.guild || message.author.bot) return;

		const compositeKey = `${message.author.id}:${message.guild.id}:${message.channelId}`;
		const now = Date.now();

		const logs = userMessages.get(compositeKey) ?? [];

		const recentLogs = logs.filter((log) => now - log.timestamp < 5000);

		recentLogs.push({
			timestamp: now,
			messageId: message.id,
			channelId: message.channelId,
		});

		userMessages.set(compositeKey, recentLogs);

		if (recentLogs.length > 5) {
			const member = message.member;
			if (!member) return;

			if (
				!member.moderatable ||
				member.permissions.has(PermissionsBitField.Flags.Administrator)
			) {
				return;
			}

			try {
				// スパムメッセージ削除
				for (const log of recentLogs) {
					try {
						const channel = await message.client.channels.fetch(log.channelId);
						if (channel?.isTextBased()) {
							const msg = await channel.messages.fetch(log.messageId);
							await msg.delete().catch(() => {});
						}
					} catch {
						// メッセージ取得/削除失敗は無視
					}
				}

				// 10分タイムアウト
				await member.timeout(10 * 60 * 1000, "スパム行為");

				const embed = new EmbedBuilder()
					.setTitle("🚫 スパム検知")
					.setDescription(
						`${member} スパム行為は禁止です。\n10分間タイムアウトしました。`,
					)
					.setColor("Red")
					.setTimestamp();

				if (message.channel.isSendable())
					await message.channel.send({
						content: `${member}`,
						embeds: [embed],
					});

				userMessages.delete(compositeKey);
			} catch (error) {
				console.error(`スパム処理失敗 (${compositeKey})`, error);
				// エラー時もクリーンアップ
				userMessages.delete(compositeKey);
			}
		}
	},
};
