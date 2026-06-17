import {
	EmbedBuilder,
	Events,
	type Message,
	PermissionsBitField,
} from "discord.js";
import { prisma } from "@/database/db";

export default {
	name: Events.MessageCreate,

	async execute(message: Message): Promise<void> {
		if (!message.guild || message.author.bot) return;

		// サーバー設定の取得
		const setting = (await prisma.serverSetting.findUnique({
			where: { serverId: message.guild.id },
		})) as any;

		// 設定がない、またはハニーポットが無効な場合は何もしない
		if (!setting || !setting.honeypotEnabled || !setting.honeypotChannelId) return;

		// 対象チャンネル以外は無視
		if (message.channelId !== setting.honeypotChannelId) return;

		// 除外ロールのチェック
		const honeypotIgnoreRoles = (setting.honeypotIgnoreRole || "")
			.split(",")
			.filter(Boolean);
		if (
			message.member?.roles.cache.some((role) => honeypotIgnoreRoles.includes(role.id))
		)
			return;

		const member = message.member;
		if (!member) return;

		// 管理者やBot自身はBANしない
		if (
			!member.bannable ||
			member.permissions.has(PermissionsBitField.Flags.Administrator)
		) {
			return;
		}

		try {
			// BAN実行
			await member.ban({ reason: "ハニーポット検知 (自動BAN)" });

			// メッセージ削除
			await message.delete().catch(() => {});

			// 報告先チャンネルへの通知
			if (setting.honeypotReportId) {
				const reportChannel = await message.client.channels
					.fetch(setting.honeypotReportId)
					.catch(() => null);
				if (reportChannel?.isTextBased() && "send" in reportChannel) {
					const reportEmbed = new EmbedBuilder()
						.setTitle("🍯 ハニーポット検知報告")
						.setDescription("特定のチャンネルへの送信を検知したため、ユーザーを自動BANしました。")
						.addFields(
							{
								name: "ユーザー",
								value: `${member.user.tag} (${member.id})`,
								inline: true,
							},
							{
								name: "チャンネル",
								value: `${message.channel} (${message.channelId})`,
								inline: true,
							},
						)
						.setColor("Red")
						.setTimestamp();
					await reportChannel.send({ embeds: [reportEmbed] }).catch(() => {});
				}
			}
		} catch (error) {
			console.error(`ハニーポット処理失敗 (${message.guild.id})`, error);
		}
	},
};
