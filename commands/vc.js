const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const {
  getSession,
  getVoiceLib,
  startSession,
  stopSession,
} = require("../utils/vcReader");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vc")
    .setDescription("VC読み上げ機能")
    .addSubcommand((sub) =>
      sub
        .setName("read")
        .setDescription("指定したチャンネルを読み上げます")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("読み上げ対象のテキストチャンネル")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("stop")
        .setDescription("読み上げを停止してVCから退出します")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "stop") {
      const stopped = stopSession(interaction.guildId);
      return interaction.reply({
        content: stopped
          ? "⏹️ 読み上げを停止し、VCから退出しました。"
          : "ℹ️ 現在アクティブな読み上げはありません。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const voiceLib = getVoiceLib();
    if (!voiceLib) {
      return interaction.reply({
        content:
          "❌ VC読み上げ機能を使うには `@discordjs/voice` のインストールが必要です。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ 先にあなたがVCへ参加してください。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetChannel = interaction.options.getChannel("channel", true);
    const voicePerms = voiceChannel.permissionsFor(interaction.guild.members.me);

    if (!voicePerms?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      return interaction.reply({
        content: "❌ BotにVCの接続/発言権限がありません。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const readPerms = targetChannel.permissionsFor(interaction.guild.members.me);
    if (!readPerms?.has(PermissionFlagsBits.ViewChannel)) {
      return interaction.reply({
        content: "❌ 指定チャンネルを閲覧する権限がありません。",
        flags: MessageFlags.Ephemeral,
      });
    }

    startSession({
      guildId: interaction.guildId,
      voiceChannel,
      textChannelId: targetChannel.id,
      guildVoiceAdapterCreator: interaction.guild.voiceAdapterCreator,
    });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const session = getSession(interaction.guildId);
    try {
      await voiceLib.entersState(session.connection, voiceLib.VoiceConnectionStatus.Ready, 15_000);
    } catch {
      stopSession(interaction.guildId);
      return interaction.editReply({
        content: "❌ VCへの接続に失敗しました。時間を置いて再実行してください。",
      });
    }

    return interaction.editReply({
      content: `🔊 ${voiceChannel} で ${targetChannel} の読み上げを開始しました。\n停止する場合は /vc stop を実行してください。`,
    });
  },
};
