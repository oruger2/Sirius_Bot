import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type GuildMember,
	PermissionsBitField,
	SlashCommandBuilder,
} from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

const command = {
	data: new SlashCommandBuilder()
		.setName("kick")
		.setDescription("ユーザーをサーバーからKICKします")
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("KICKするユーザー")
				.setRequired(true),
		)
		.addStringOption((option) =>
			option.setName("reason").setDescription("KICK理由").setRequired(false),
		),
	async execute(interaction: ChatInputCommandInteraction) {
		const sendEphemeral = async (embed: EmbedBuilder) => {
			const replyPayload = { embeds: [embed], flags: ["Ephemeral"] as const };
			const editPayload = { embeds: [embed] };
			const followUpPayload = {
				embeds: [embed],
				flags: ["Ephemeral"] as const,
			};

			const tryEdit = async () => {
				try {
					return await interaction.editReply(editPayload);
				} catch (error) {
					if (
						error instanceof Error &&
						error.name === "InteractionNotReplied"
					) {
						return null;
					}
					throw error;
				}
			};

			const tryReply = async () => {
				try {
					return await interaction.reply(replyPayload);
				} catch (error) {
					if ((error as { code?: number }).code === 40060) {
						return null;
					}
					throw error;
				}
			};

			const tryFollowUp = async () => {
				try {
					return await interaction.followUp(followUpPayload);
				} catch {
					return null;
				}
			};

			if (interaction.deferred || interaction.replied) {
				const edited = await tryEdit();
				if (edited) {
					return edited;
				}
				const replied = await tryReply();
				if (replied) {
					return replied;
				}
				await tryFollowUp();
				return;
			}

			const replied = await tryReply();
			if (replied) {
				return replied;
			}
			const edited = await tryEdit();
			if (edited) {
				return edited;
			}
			await tryFollowUp();
		};

		const replyError = async (content: string) => {
			const embed = new EmbedBuilder()
				.setAuthor({
					name: "エラー",
					iconURL: ERROR_ICON_URL,
				})
				.setDescription(content)
				.setColor(0xed4245)
				.setTimestamp(new Date());
			await sendEphemeral(embed);
		};

		if (!interaction.deferred && !interaction.replied) {
			try {
				await interaction.deferReply({ flags: ["Ephemeral"] as const });
			} catch {
				// If defer fails, continue and attempt a normal reply in sendEphemeral.
			}
		}

		const targetUser = interaction.options.getUser("user", true);
		const reasonInput = interaction.options.getString("reason")?.trim();
		const guild = interaction.guild;
		if (!guild) {
			await replyError(
				"❌ サーバー情報の取得に失敗しました。もう一度お試しください。",
			);
			return;
		}

		let requestor = interaction.member as GuildMember | null;
		const requestorPermissions = interaction.memberPermissions;

		if (!requestorPermissions?.has(PermissionsBitField.Flags.KickMembers)) {
			await replyError("❌ あなたにはKICK権限がありません。");
			return;
		}

		const botMember = await guild.members.fetchMe().catch(() => null);

		if (!botMember) {
			await replyError(
				"❌ Botの権限確認に失敗しました。もう一度お試しください。",
			);
			return;
		}

		if (!botMember.permissions.has(PermissionsBitField.Flags.KickMembers)) {
			await replyError(
				"❌ BotにKICK権限がありません。権限を付与してください。",
			);
			return;
		}

		if (targetUser.id === interaction.user.id) {
			await replyError("❌ 自分自身をKICKすることはできません。");
			return;
		}

		if (targetUser.id === guild.ownerId) {
			await replyError("❌ サーバーオーナーをKICKすることはできません。");
			return;
		}

		const targetMember = await guild.members
			.fetch(targetUser.id)
			.catch(() => null);

		if (!targetMember) {
			await replyError("❌ 対象ユーザーがサーバーにいません。");
			return;
		}

		if (!requestor) {
			requestor = await guild.members
				.fetch(interaction.user.id)
				.catch(() => null);
		}

		const requesterRolePosition = requestor?.roles.highest.position ?? 0;
		const targetRolePosition = targetMember.roles.highest.position;
		const botRolePosition = botMember.roles.highest.position;

		if (
			requestor &&
			requesterRolePosition <= targetRolePosition &&
			interaction.user.id !== guild.ownerId
		) {
			await replyError(
				"❌ 自分より上位または同じロールのユーザーはKICKできません。",
			);
			return;
		}

		if (botRolePosition <= targetRolePosition) {
			await replyError(
				"❌ Botのロールが対象ユーザー以下のためKICKできません。",
			);
			return;
		}

		if (!targetMember.kickable) {
			await replyError(
				"❌ このユーザーはKICKできません。権限設定を確認してください。",
			);
			return;
		}

		const reason = reasonInput
			? `${reasonInput} (Requested by ${interaction.user.tag})`
			: `Requested by ${interaction.user.tag}`;

		try {
			await targetMember.kick(reason);
			const embed = new EmbedBuilder()
				.setAuthor({
					name: "✅ KICK完了",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(
					`✅ ${targetUser.tag} をKICKしました。\n理由: ${reasonInput ?? "なし"}`,
				)
				.setColor(0x57f287)
				.setTimestamp(new Date());
			await sendEphemeral(embed);
		} catch (error) {
			if (requestor) {
				const requesterRolePosition = requestor.roles.highest.position;
				const targetRolePosition = targetMember.roles.highest.position;
				if (
					requesterRolePosition <= targetRolePosition &&
					interaction.user.id !== guild.ownerId
				) {
					await replyError(
						"❌ 自分より上位または同じロールのユーザーはKICKできません。",
					);
					return;
				}
			}
			console.error("❌ KICK失敗:", {
				guildId: guild.id,
				targetUserId: targetUser.id,
				error,
			});
			await replyError(
				"❌ KICKに失敗しました。権限/ロール/上限設定を確認してください。",
			);
		}
	},
};

export default command;
