import {
	ChannelType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	PermissionsBitField,
	SlashCommandBuilder,
} from "discord.js";
import {
	clearGuildTtsSession,
	getGuildTtsSession,
	setGuildTtsSession,
} from "@/tts/session";
import { connectGuildSpeech, disconnectGuildSpeech } from "@/tts/voice";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

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
		if (!interaction.inGuild()) {
			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setAuthor({
							name: "エラー",
							iconURL: ERROR_ICON_URL,
						})
						.setDescription("❌ サーバー内で実行してください。"),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (!interaction.deferred && !interaction.replied) {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		}

		const guildId = interaction.guildId;
		if (!guildId) {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xed4245)
						.setAuthor({
							name: "エラー",
							iconURL: ERROR_ICON_URL,
						})
						.setDescription("❌ サーバーIDを取得できませんでした。"),
				],
			});
			return;
		}
		const sub = interaction.options.getSubcommand();

		if (sub === "set") {
			const textChannel = interaction.options.getChannel("text_channel", true);
			const voiceChannel = interaction.options.getChannel(
				"voice_channel",
				true,
			);
			const resolvedVoiceChannel = interaction.guild?.channels.cache.get(
				voiceChannel.id,
			);

			// Botの権限チェック
			const botMember = interaction.guild?.members.me;
			if (!botMember) return;

			const textPerms = botMember.permissionsIn(textChannel.id);
			const voicePerms = botMember.permissionsIn(voiceChannel.id);

			if (!textPerms.has(PermissionsBitField.Flags.ViewChannel)) {
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({ name: "エラー", iconURL: ERROR_ICON_URL })
							.setDescription(
								`❌ Botが <#${textChannel.id}> を閲覧する権限がありません。`,
							),
					],
				});
				return;
			}

			if (
				!voicePerms.has([
					PermissionsBitField.Flags.Connect,
					PermissionsBitField.Flags.Speak,
				])
			) {
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({ name: "エラー", iconURL: ERROR_ICON_URL })
							.setDescription(
								`❌ Botが <#${voiceChannel.id}> に接続または発言する権限がありません。`,
							),
					],
				});
				return;
			}

			if (!resolvedVoiceChannel?.isVoiceBased()) {
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({ name: "エラー", iconURL: ERROR_ICON_URL })
							.setDescription("❌ 読み上げ先VCの取得に失敗しました。"),
					],
				});
				return;
			}

			const humanCount = resolvedVoiceChannel.members.filter(
				(member) => !member.user.bot,
			).size;
			if (humanCount === 0) {
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({ name: "エラー", iconURL: ERROR_ICON_URL })
							.setDescription(
								`❌ <#${voiceChannel.id}> に参加中のユーザーがいません。誰かが入室した状態で実行してください。`,
							),
					],
				});
				return;
			}

			const connected = await connectGuildSpeech(
				interaction.guild,
				voiceChannel.id,
			);
			if (!connected) {
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({ name: "エラー", iconURL: ERROR_ICON_URL })
							.setDescription(
								`❌ <#${voiceChannel.id}> への接続に失敗しました。権限と接続状態を確認してください。`,
							),
					],
				});
				return;
			}

			// Post-connect check: re-verify that users are still present
			const postConnectHumanCount = resolvedVoiceChannel.members.filter(
				(member) => !member.user.bot,
			).size;
			if (postConnectHumanCount === 0) {
				disconnectGuildSpeech(guildId);
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({ name: "エラー", iconURL: ERROR_ICON_URL })
							.setDescription(
								`❌ <#${voiceChannel.id}> に参加中のユーザーがいません。誰かが入室した状態で実行してください。`,
							),
					],
				});
				return;
			}

			setGuildTtsSession(guildId, {
				textChannelId: textChannel.id,
				voiceChannelId: voiceChannel.id,
			});

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setAuthor({
							name: "TTS設定完了",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription(
							`読み上げ元: <#${textChannel.id}>\n読み上げ先VC: <#${voiceChannel.id}>\n\nこの設定は一時的です。Bot再起動またはVC無人で自動解除されます。`,
						),
				],
			});
			return;
		}

		if (sub === "off") {
			clearGuildTtsSession(guildId);
			disconnectGuildSpeech(guildId);

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xffa500)
						.setAuthor({
							name: "TTS停止",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription("読み上げを停止し、設定を解除しました。"),
				],
			});
			return;
		}

		if (sub === "status") {
			const config = getGuildTtsSession(guildId);
			if (!config) {
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setAuthor({
								name: "TTS未開始",
								iconURL: ERROR_ICON_URL,
							})
							.setDescription("`/tts set` で一時読み上げを開始してください。"),
					],
				});
				return;
			}

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x5865f2)
						.setAuthor({
							name: "TTS設定状況",
							iconURL: SUCCESS_ICON_URL,
						})
						.setDescription(
							`読み上げ元: <#${config.textChannelId}>\n読み上げ先VC: <#${config.voiceChannelId}>`,
						),
				],
			});
		}
	},
};

export default command;
