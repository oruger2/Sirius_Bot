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
		// サーバー外、またはBot自身のメッセージは無視
		if (!message.guild || message.author.bot) return;

		// 💡 1. メッセージ検知ログ
		console.log(
			`[Honeypot Test] メッセージ検知! チャンネルID: ${message.channelId}, ユーザー: ${message.author.tag}`,
		);

		// サーバー設定の取得（ここで1回だけ宣言）
		const setting = await prisma.serverSetting.findUnique({
			where: { serverId: message.guild.id },
		});

		// 💡 2. DBの取得結果ログ
		console.log("[Honeypot Test] DBの設定値:", setting);

		// 設定がない、またはハニーポットが無効な場合は何もしない
		if (!setting || !setting.honeypotEnabled || !setting.honeypotChannelId) {
			console.log(
				"[Honeypot Test] スキップ: 設定が足りないか、有効化されていません。",
			);
			return;
		}

		// 対象チャンネル以外は無視
		if (message.channelId !== setting.honeypotChannelId) {
			console.log(
				`[Honeypot Test] スキップ: チャンネルが一致しません。対象: ${setting.honeypotChannelId}`,
			);
			return;
		}

		// メンバー情報の確定（キャッシュにない場合を考慮してfetch、なければ取得）
		const member =
			message.member ??
			(await message.guild.members.fetch(message.author.id).catch(() => null));
		if (!member) {
			console.log(
				"[Honeypot Test] スキップ: メンバー情報が取得できませんでした。",
			);
			return;
		}

		// 除外ロールのチェック
		const honeypotIgnoreRoles = (setting.honeypotIgnoreRole || "")
			.split(",")
			.filter(Boolean);

		if (
			member.roles.cache.some((role) => honeypotIgnoreRoles.includes(role.id))
		) {
			console.log("[Honeypot Test] スキップ: 除外ロールを所持しています。");
			return;
		}

		// 管理者やBot自身、あるいは権限的にBANできないユーザーはスキップ
		if (
			!member.bannable ||
			member.permissions.has(PermissionsBitField.Flags.Administrator)
		) {
			console.log(
				`[Honeypot] BANをスキップ: ${member.user.tag} は管理者か、Botより高い権限を持っています。bannable: ${member.bannable}`,
			);
			return;
		}

		try {
			// BAN実行 + 過去1日分のメッセージを自動削除
			await member.ban({
				reason: "ハニーポット検知 (自動BAN)",
				deleteMessageSeconds: 24 * 60 * 60,
			});

			console.log(`[Honeypot Test] 成功: ${member.user.tag} をBANしました。`);

			// 報告先チャンネルへの通知
			if (setting.honeypotReportId) {
				const reportChannel = await message.client.channels
					.fetch(setting.honeypotReportId)
					.catch(() => null);

				if (reportChannel?.isTextBased() && "send" in reportChannel) {
					const reportEmbed = new EmbedBuilder()
						.setTitle("🍯 ハニーポット検知報告")
						.setDescription(
							"特定のチャンネルへの送信を検知したため、ユーザーを自動BANしました。",
						)
						.addFields(
							{
								name: "ユーザー",
								value: `${member.user.tag} (${member.id})`,
								inline: true,
							},
							{
								name: "チャンネル",
								value: `<#${message.channelId}> (${message.channelId})`,
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
