import {
	EmbedBuilder,
	Events,
	type Message,
	PermissionsBitField,
} from "discord.js";
import { prisma } from "@/database/db";

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

		// サーバー設定の取得（ダッシュボードからの設定を反映）
		const setting = await prisma.serverSetting.findUnique({
			where: { serverId: message.guild.id },
		});

		// 設定がない、またはスパムブロックが無効な場合は何もしない
		if (!setting || !setting.spamBlockEnabled) return;

		// 除外チャンネルのチェック（新フィールド優先、旧フィールドにフォールバック）
		const spamIgnoredChannels = (
			setting.spamIgnoredChannels ||
			setting.ignoredChannels ||
			""
		)
			.split(",")
			.filter(Boolean);
		if (spamIgnoredChannels.includes(message.channelId)) return;

		// 除外ロールのチェック（新フィールド優先、旧フィールドにフォールバック）
		const spamIgnoredRoles = (
			setting.spamIgnoredRoles ||
			setting.ignoredRoles ||
			""
		)
			.split(",")
			.filter(Boolean);
		if (
			message.member?.roles.cache.some((role) =>
				spamIgnoredRoles.includes(role.id),
			)
		)
			return;

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

				// 報告先チャンネルへの通知
				if (setting.spamReportChannelId) {
					const reportChannel = await message.client.channels
						.fetch(setting.spamReportChannelId)
						.catch(() => null);
					if (reportChannel?.isTextBased() && "send" in reportChannel) {
						const reportEmbed = new EmbedBuilder()
							.setTitle("📢 スパム検知報告")
							.addFields(
								{
									name: "ユーザー",
									value: `${member} (${member.id})`,
									inline: true,
								},
								{
									name: "チャンネル",
									value: `${message.channel} (${message.channelId})`,
									inline: true,
								},
							)
							.setColor("Orange")
							.setTimestamp();
						await reportChannel.send({ embeds: [reportEmbed] }).catch(() => {});
					}
				}

				userMessages.delete(compositeKey);
			} catch (error) {
				console.error(`スパム処理失敗 (${compositeKey})`, error);
				// エラー時もクリーンアップ
				userMessages.delete(compositeKey);
			}
		}
	},
};
