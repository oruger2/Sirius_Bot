import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type Guild,
	type GuildMember,
	SlashCommandBuilder,
	type User,
} from "discord.js";

import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

const command = {
	data: new SlashCommandBuilder()
		.setName("user")
		.setDescription("ユーザー情報を表示")
		.addUserOption((option) =>
			option
				.setName("target")
				.setDescription("対象ユーザー")
				.setRequired(false),
		),

	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
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

		const targetUser: User =
			interaction.options.getUser("target") ?? interaction.user;

		const guild: Guild | null = interaction.guild;

		let member: GuildMember | null = null;

		if (guild !== null) {
			try {
				member = await guild.members.fetch(targetUser.id);
			} catch {
				member = null;
			}
		}

		const userType: "🤖 Bot" | "👤 ユーザー" = targetUser.bot
			? "🤖 Bot"
			: "👤 ユーザー";

		const createdAt: string = `<t:${Math.floor(
			targetUser.createdTimestamp / 1000,
		)}:F>`;

		// ======================
		// サーバー外ユーザー
		// ======================
		if (member === null) {
			const embed = new EmbedBuilder()
				.setAuthor({
					name: `${targetUser.bot ? "🤖" : "👤"} ユーザー情報`,
					iconURL: SUCCESS_ICON_URL,
				})
				.setThumbnail(targetUser.displayAvatarURL())
				.setColor(targetUser.bot ? 0x00b0f4 : 0x57f287)
				.addFields(
					{ name: "ユーザー名", value: targetUser.username },
					{ name: "ユーザーID", value: targetUser.id },
					{ name: "タイプ", value: userType },
					{ name: "アカウント作成日", value: createdAt },
				)
				.setTimestamp();

			await sendEphemeral(embed);
			return;
		}

		// ======================
		// サーバー内ユーザー
		// ======================
		const joinedAt: string =
			member.joinedTimestamp !== null
				? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
				: "不明";

		const rolesArray: string[] = member.roles.cache
			.filter((role) => guild === null || role.id !== guild.id)
			.map((role) => `<@&${role.id}>`);

		const roles: string =
			rolesArray.length > 0 ? rolesArray.join(", ") : "なし";

		const embed = new EmbedBuilder()
			.setAuthor({
				name: `${targetUser.bot ? "🤖" : "👤"} ユーザー情報`,
				iconURL: SUCCESS_ICON_URL,
			})
			.setThumbnail(targetUser.displayAvatarURL())
			.setColor(targetUser.bot ? 0x00b0f4 : 0x57f287)
			.addFields(
				{ name: "ユーザー名", value: targetUser.username, inline: true },
				{
					name: "表示名",
					value: targetUser.globalName ?? "なし",
					inline: true,
				},
				{ name: "ユーザーID", value: targetUser.id },
				{ name: "タイプ", value: userType, inline: true },
				{ name: "アカウント作成日", value: createdAt },
				{ name: "サーバー参加日", value: joinedAt },
				{ name: "ロール", value: roles },
			)
			.setTimestamp();

		await sendEphemeral(embed);
	},
};

export default command;
