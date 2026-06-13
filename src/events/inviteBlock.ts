import {
	EmbedBuilder,
	Events,
	type Message,
	PermissionsBitField,
} from "discord.js";
import { prisma } from "@/database/db";

const INVITE_REGEX =
	/(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/g;

export default {
	name: Events.MessageCreate,

	async execute(message: Message): Promise<void> {
		if (!message.guild || message.author.bot) return;

		// サーバー設定の取得
		const setting = await prisma.serverSetting.findUnique({
			where: { serverId: message.guild.id },
		});

		// 設定がない、または招待リンクブロックが無効な場合は何もしない
		if (!setting || !setting.inviteBlockEnabled) return;

		// 除外チャンネルのチェック
		const ignoredChannels = setting.ignoredChannels.split(",").filter(Boolean);
		if (ignoredChannels.includes(message.channelId)) return;

		// 除外ロールのチェック
		const ignoredRoles = setting.ignoredRoles.split(",").filter(Boolean);
		if (
			message.member?.roles.cache.some((role) => ignoredRoles.includes(role.id))
		)
			return;

		// 管理者やモデレーター権限を持つユーザーは除外
		if (
			message.member?.permissions.has(
				PermissionsBitField.Flags.Administrator,
			) ||
			message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)
		) {
			return;
		}

		// 招待リンクが含まれているかチェック
		if (INVITE_REGEX.test(message.content)) {
			try {
				await message.delete().catch(() => {});

				const embed = new EmbedBuilder()
					.setTitle("🚫 招待リンク制限")
					.setDescription(
						`${message.author} このサーバーでは招待リンクの投稿は禁止されています。`,
					)
					.setColor("Red")
					.setTimestamp();

				if (message.channel.isSendable()) {
					const warning = await message.channel.send({
						content: `${message.author}`,
						embeds: [embed],
					});
					// 5秒後に警告を削除
					setTimeout(() => warning.delete().catch(() => {}), 5000);
				}

				// 報告先チャンネルへの通知
				if (setting.inviteReportChannelId) {
					const reportChannel = await message.client.channels
						.fetch(setting.inviteReportChannelId)
						.catch(() => null);
					if (reportChannel?.isTextBased()) {
						const reportEmbed = new EmbedBuilder()
							.setTitle("📢 招待リンク検知報告")
							.addFields(
								{
									name: "ユーザー",
									value: `${message.author} (${message.author.id})`,
									inline: true,
								},
								{
									name: "チャンネル",
									value: `${message.channel} (${message.channelId})`,
									inline: true,
								},
								{ name: "内容", value: message.content || "内容なし" },
							)
							.setColor("Orange")
							.setTimestamp();
						await reportChannel.send({ embeds: [reportEmbed] }).catch(() => {});
					}
				}
			} catch (error) {
				console.error("招待リンク処理失敗", error);
			}
		}
	},
};
