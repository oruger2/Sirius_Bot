import {
	ChannelType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type GuildTextBasedChannel,
	MessageFlags,
	PermissionsBitField,
	SlashCommandBuilder,
	type VoiceBasedChannel,
} from "discord.js";
import {
	clearGuildTtsSession,
	getGuildTtsSession,
	setGuildTtsSession,
} from "@/tts/session";
import { connectGuildSpeech, disconnectGuildSpeech } from "@/tts/voice";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

const isVoiceChannel = (channel: unknown): channel is VoiceBasedChannel =>
	Boolean(
		channel &&
		typeof channel === "object" &&
		"isVoiceBased" in channel &&
		typeof (channel as VoiceBasedChannel).isVoiceBased === "function" &&
		(channel as VoiceBasedChannel).isVoiceBased(),
	);

const isTextChannel = (channel: unknown): channel is GuildTextBasedChannel =>
	Boolean(
		channel &&
		typeof channel === "object" &&
		"isTextBased" in channel &&
		typeof (channel as GuildTextBasedChannel).isTextBased === "function" &&
		(channel as GuildTextBasedChannel).isTextBased(),
	);

const command = {
	data: new SlashCommandBuilder()
		.setName("tts")
		.setDescription("指定したチャンネルのメッセージをVCで読み上げます")
		.setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
		.addSubcommand((sub) =>
			sub
				.setName("set")
				.setDescription("一時的な読み上げ対象チャンネルを設定")
				.addChannelOption((opt) =>
					opt
						.setName("text_channel")
						.setDescription("読み上げ元テキストチャンネル")
						.addChannelTypes(
							ChannelType.GuildText,
							ChannelType.GuildAnnouncement,
						)
						.setRequired(true),
				)
				.addChannelOption((opt) =>
					opt
						.setName("voice_channel")
						.setDescription("読み上げ先ボイスチャンネル")
						.addChannelTypes(
							ChannelType.GuildVoice,
							ChannelType.GuildStageVoice,
						)
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub.setName("off").setDescription("読み上げを停止して設定を解除"),
		)
		.addSubcommand((sub) =>
			sub.setName("status").setDescription("現在の読み上げ設定を表示"),
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

		if (!interaction.inGuild()) {
			await replyError("❌ サーバー内で実行してください。");
			return;
		}

		const guild = interaction.guild;
		if (!guild || !interaction.guildId) {
			await replyError("❌ サーバー情報を取得できませんでした。");
			return;
		}

		const subcommand = interaction.options.getSubcommand();

		if (subcommand === "set") {
			const textChannel = interaction.options.getChannel("text_channel", true);
			const voiceChannel = interaction.options.getChannel(
				"voice_channel",
				true,
			);

			if (!isTextChannel(textChannel) || !isVoiceChannel(voiceChannel)) {
				await replyError("❌ 指定されたチャンネルを取得できませんでした。");
				return;
			}

			const botMember = guild.members.me;
			if (!botMember) {
				await replyError("❌ Botメンバー情報を取得できませんでした。");
				return;
			}

			if (
				!botMember
					.permissionsIn(textChannel.id)
					.has(PermissionsBitField.Flags.ViewChannel)
			) {
				await replyError(
					`❌ Botが <#${textChannel.id}> を閲覧する権限がありません。`,
				);
				return;
			}

			if (
				!botMember
					.permissionsIn(voiceChannel.id)
					.has([
						PermissionsBitField.Flags.Connect,
						PermissionsBitField.Flags.Speak,
					])
			) {
				await replyError(
					`❌ Botが <#${voiceChannel.id}> に接続または発言する権限がありません。`,
				);
				return;
			}

			const humanCount = voiceChannel.members.filter(
				(member) => !member.user.bot,
			).size;
			if (humanCount === 0) {
				await replyError(
					`❌ <#${voiceChannel.id}> に参加中のユーザーがいません。誰かが入室した状態で実行してください。`,
				);
				return;
			}

			setGuildTtsSession(interaction.guildId, {
				textChannelId: textChannel.id,
				voiceChannelId: voiceChannel.id,
			});

			const connected = await connectGuildSpeech(guild, voiceChannel.id);
			if (!connected) {
				clearGuildTtsSession(interaction.guildId);
				await replyError(
					`❌ <#${voiceChannel.id}> への接続に失敗しました。権限と接続状態を確認してください。`,
				);
				return;
			}

			const postConnectHumanCount = voiceChannel.members.filter(
				(member) => !member.user.bot,
			).size;
			if (postConnectHumanCount === 0) {
				clearGuildTtsSession(interaction.guildId);
				disconnectGuildSpeech(interaction.guildId);
				await replyError(
					`❌ <#${voiceChannel.id}> に参加中のユーザーがいません。誰かが入室した状態で実行してください。`,
				);
				return;
			}

			const successEmbed = new EmbedBuilder()
				.setAuthor({
					name: "TTS設定完了",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(
					`読み上げ元: <#${textChannel.id}>\n読み上げ先VC: <#${voiceChannel.id}>\n\nこの設定は一時的です。Bot再起動またはVC無人で自動解除されます。`,
				)
				.setColor(0x57f287)
				.setTimestamp(new Date());
			await sendEphemeral(successEmbed);
			return;
		}

		if (subcommand === "off") {
			clearGuildTtsSession(interaction.guildId);
			disconnectGuildSpeech(interaction.guildId);

			const successEmbed = new EmbedBuilder()
				.setAuthor({
					name: "TTS停止",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription("読み上げを停止し、設定を解除しました。")
				.setColor(0xffa500)
				.setTimestamp(new Date());
			await sendEphemeral(successEmbed);
			return;
		}

		if (subcommand === "status") {
			const config = getGuildTtsSession(interaction.guildId);
			if (!config) {
				await replyError("`/tts set` で一時読み上げを開始してください。");
				return;
			}

			const statusEmbed = new EmbedBuilder()
				.setAuthor({
					name: "TTS設定状況",
					iconURL: SUCCESS_ICON_URL,
				})
				.setDescription(
					`読み上げ元: <#${config.textChannelId}>\n読み上げ先VC: <#${config.voiceChannelId}>`,
				)
				.setColor(0x5865f2)
				.setTimestamp(new Date());
			await sendEphemeral(statusEmbed);
		}
	},
};

export default command;
