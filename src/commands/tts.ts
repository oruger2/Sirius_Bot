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

const buildEmbed = (
	title: string,
	description: string,
	color: number,
	iconURL: string,
) =>
	new EmbedBuilder()
		.setAuthor({ name: title, iconURL })
		.setDescription(description)
		.setColor(color)
		.setTimestamp(new Date());

const replyEmbed = async (
	interaction: ChatInputCommandInteraction,
	embed: EmbedBuilder,
) => {
	if (interaction.deferred || interaction.replied) {
		await interaction.editReply({ embeds: [embed] });
		return;
	}

	await interaction.reply({
		embeds: [embed],
		flags: MessageFlags.Ephemeral,
	});
};

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
if (!interaction.inGuild()) {
await replyEmbed(
interaction,
buildEmbed(
"エラー",
"❌ サーバー内で実行してください。",
0xed4245,
ERROR_ICON_URL,
),
);
return;
}

if (!interaction.deferred && !interaction.replied) {
await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

const guild = interaction.guild;
if (!guild || !interaction.guildId) {
await replyEmbed(
interaction,
buildEmbed(
"エラー",
"❌ サーバー情報を取得できませんでした。",
0xed4245,
ERROR_ICON_URL,
),
);
return;
}

		const subcommand = interaction.options.getSubcommand();

if (subcommand === "set") {
const textChannel = interaction.options.getChannel("text_channel", true);
const voiceChannel = interaction.options.getChannel("voice_channel", true);

			if (!isTextChannel(textChannel) || !isVoiceChannel(voiceChannel)) {
				await replyEmbed(
					interaction,
					buildEmbed(
						"エラー",
						"❌ 指定されたチャンネルを取得できませんでした。",
						0xed4245,
						ERROR_ICON_URL,
					),
				);
				return;
			}

const botMember = guild.members.me;
if (!botMember) {
await replyEmbed(
interaction,
buildEmbed(
"エラー",
"❌ Botメンバー情報を取得できませんでした。",
0xed4245,
ERROR_ICON_URL,
),
);
return;
}

if (!botMember.permissionsIn(textChannel.id).has(PermissionsBitField.Flags.ViewChannel)) {
await replyEmbed(
interaction,
buildEmbed(
"エラー",
`❌ Botが <#${textChannel.id}> を閲覧する権限がありません。`,
0xed4245,
ERROR_ICON_URL,
),
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
				await replyEmbed(
					interaction,
					buildEmbed(
						"エラー",
						`❌ Botが <#${voiceChannel.id}> に接続または発言する権限がありません。`,
						0xed4245,
						ERROR_ICON_URL,
					),
				);
				return;
			}

const humanCount = voiceChannel.members.filter(
(member) => !member.user.bot,
).size;
if (humanCount === 0) {
await replyEmbed(
interaction,
buildEmbed(
"エラー",
`❌ <#${voiceChannel.id}> に参加中のユーザーがいません。誰かが入室した状態で実行してください。`,
0xed4245,
ERROR_ICON_URL,
),
);
return;
}

const connected = await connectGuildSpeech(guild, voiceChannel.id);
if (!connected) {
await replyEmbed(
interaction,
buildEmbed(
"エラー",
`❌ <#${voiceChannel.id}> への接続に失敗しました。権限と接続状態を確認してください。`,
0xed4245,
ERROR_ICON_URL,
),
);
return;
}

const postConnectHumanCount = voiceChannel.members.filter(
(member) => !member.user.bot,
).size;
if (postConnectHumanCount === 0) {
disconnectGuildSpeech(interaction.guildId);
await replyEmbed(
interaction,
buildEmbed(
"エラー",
`❌ <#${voiceChannel.id}> に参加中のユーザーがいません。誰かが入室した状態で実行してください。`,
0xed4245,
ERROR_ICON_URL,
),
);
return;
}

setGuildTtsSession(interaction.guildId, {
textChannelId: textChannel.id,
voiceChannelId: voiceChannel.id,
});

await replyEmbed(
interaction,
buildEmbed(
"TTS設定完了",
`読み上げ元: <#${textChannel.id}>
読み上げ先VC: <#${voiceChannel.id}>

この設定は一時的です。Bot再起動またはVC無人で自動解除されます。`,
					0x57f287,
					SUCCESS_ICON_URL,
				),
			);
			return;
		}

		if (subcommand === "off") {
			clearGuildTtsSession(interaction.guildId);
			disconnectGuildSpeech(interaction.guildId);

await replyEmbed(
interaction,
buildEmbed(
"TTS停止",
"読み上げを停止し、設定を解除しました。",
0xffa500,
SUCCESS_ICON_URL,
),
);
return;
}

if (subcommand === "status") {
const config = getGuildTtsSession(interaction.guildId);
if (!config) {
await replyEmbed(
interaction,
buildEmbed(
"TTS未開始",
"`/tts set` で一時読み上げを開始してください。",
0xed4245,
ERROR_ICON_URL,
),
);
return;
}

await replyEmbed(
interaction,
buildEmbed(
"TTS設定状況",
`読み上げ元: <#${config.textChannelId}>
読み上げ先VC: <#${config.voiceChannelId}>`,
					0x5865f2,
					SUCCESS_ICON_URL,
				),
			);
		}
	},
};

export default command;
