import {
	ChannelType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type Guild,
	PermissionsBitField,
	SlashCommandBuilder,
} from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

type ViewableChannelCounts = {
	text: number;
	voice: number;
	announcement: number;
	forum: number;
	stage: number;
};

const buildViewableChannelCounts = (guild: Guild): ViewableChannelCounts => {
	const counts: ViewableChannelCounts = {
		text: 0,
		voice: 0,
		announcement: 0,
		forum: 0,
		stage: 0,
	};

	const everyoneRole = guild.roles.everyone;
	const channels = guild.channels.cache.filter((channel) =>
		channel
			.permissionsFor(everyoneRole)
			?.has(PermissionsBitField.Flags.ViewChannel),
	);

	for (const channel of channels.values()) {
		switch (channel.type) {
			case ChannelType.GuildText:
				counts.text += 1;
				break;
			case ChannelType.GuildVoice:
				counts.voice += 1;
				break;
			case ChannelType.GuildAnnouncement:
				counts.announcement += 1;
				break;
			case ChannelType.GuildForum:
				counts.forum += 1;
				break;
			case ChannelType.GuildStageVoice:
				counts.stage += 1;
				break;
			default:
				break;
		}
	}

	return counts;
};

const command = {
	data: new SlashCommandBuilder()
		.setName("server")
		.setDescription("サーバー情報を表示します"),
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

		const guild = interaction.guild;

		if (!guild) {
			await replyError("❌ サーバー情報の取得に失敗しました。");
			return;
		}

		const owner = await guild.fetchOwner().catch(() => null);
		const members = await guild.members.fetch().catch(() => null);

		const totalMembers = members?.size ?? guild.memberCount ?? 0;
		const botCount = members
			? members.filter((member) => member.user.bot).size
			: 0;
		const userCount = Math.max(0, totalMembers - botCount);

		const createdAt = guild.createdAt;
		const daysAgo = Math.max(
			0,
			Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000)),
		);
		const createdAtText = createdAt.toLocaleString("ja-JP", {
			timeZone: "Asia/Tokyo",
		});

		const viewableCounts = buildViewableChannelCounts(guild);
		const boostCount = guild.premiumSubscriptionCount ?? 0;
		const boostLevel = guild.premiumTier ?? 0;
		const shardId =
			typeof guild.shardId === "number"
				? guild.shardId
				: (interaction.client.shard?.ids[0] ?? 0);

		const embed = new EmbedBuilder()
			.setAuthor({
				name: "サーバー情報",
				iconURL: SUCCESS_ICON_URL,
			})
			.addFields(
				{ name: "サーバー名", value: guild.name, inline: false },
				{ name: "サーバーID", value: guild.id, inline: false },
				{
					name: "サーバーオーナー",
					value: owner
						? `${owner.user.tag} (<@${owner.id}>)`
						: `<@${guild.ownerId}>`,
					inline: false,
				},
				{
					name: "メンバー数",
					value: `ユーザー: ${userCount}\nBOT: ${botCount}\n合計: ${totalMembers}`,
					inline: false,
				},
				{
					name: "作成日時",
					value: `${createdAtText} (${daysAgo}日前)`,
					inline: false,
				},
				{
					name: "チャンネル数 (everyoneが見れる)",
					value:
						`テキスト: ${viewableCounts.text}\n` +
						`ボイス: ${viewableCounts.voice}\n` +
						`アナウンス: ${viewableCounts.announcement}\n` +
						`フォーラム: ${viewableCounts.forum}\n` +
						`ステージ: ${viewableCounts.stage}`,
					inline: false,
				},
				{
					name: "ブースト",
					value: `ブースト数: ${boostCount}\nレベル: ${boostLevel}`,
					inline: false,
				},
				{
					name: "シャード",
					value: `#${shardId}`,
					inline: false,
				},
			)
			.setColor(0x5865f2)
			.setTimestamp(new Date());

		const iconUrl = guild.iconURL({ size: 256 });
		if (iconUrl) {
			embed.setThumbnail(iconUrl);
		}

		await sendEphemeral(embed);
	},
};

export default command;
