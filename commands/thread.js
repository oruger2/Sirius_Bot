const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  MessageFlags
} = require('discord.js');

/* ===== クールタイム管理 ===== */
const cooldown = new Map();
const COOLDOWN_TIME = 60 * 1000; // 60秒

module.exports = {
  data: new SlashCommandBuilder()
    .setName('thread')
    .setDescription('スレッドを作成します（クールタイムあり）')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('スレッド名')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('archive')
        .setDescription('自動アーカイブ時間')
        .addChoices(
          { name: '1時間', value: 60 },
          { name: '24時間', value: 1440 },
          { name: '3日', value: 4320 },
          { name: '7日', value: 10080 }
        )
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const now = Date.now();

    /* ===== クールタイムチェック ===== */
    const lastUsed = cooldown.get(userId);
    if (lastUsed && now - lastUsed < COOLDOWN_TIME) {
      const remaining = Math.ceil(
        (COOLDOWN_TIME - (now - lastUsed)) / 1000
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Yellow')
            .setTitle('⏳ クールタイム中')
            .setDescription(`あと **${remaining} 秒** 待ってください。`)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const name = interaction.options.getString('name');
    const archive = interaction.options.getInteger('archive') ?? 1440;
    const channel = interaction.channel;

    try {
      /* ===== チャンネル確認 ===== */
      if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        return interaction.reply({
          content: 'このチャンネルではスレッドを作成できません。',
          flags: MessageFlags.Ephemeral
        });
      }

      /* ===== 実行者権限 ===== */
      if (!interaction.member.permissions.has(PermissionFlagsBits.CreatePublicThreads)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('権限エラー')
              .setDescription('あなたに **スレッド作成** 権限がありません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      /* ===== Bot権限 ===== */
      const botPerms = channel.permissionsFor(interaction.guild.members.me);
      if (!botPerms?.has([
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.SendMessagesInThreads
      ])) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('権限エラー')
              .setDescription('Botに **スレッド作成 / スレッド送信** 権限がありません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      /* ===== スレッド作成 ===== */
      const thread = await channel.threads.create({
        name,
        autoArchiveDuration: archive,
        reason: `Created by ${interaction.user.tag}`
      });

      /* ===== クールタイム記録 ===== */
      cooldown.set(userId, now);

      /* ===== 成功 ===== */
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('Green')
            .setTitle('🧵 スレッド作成完了')
            .addFields(
              { name: '名前', value: thread.name, inline: true },
              { name: 'アーカイブ', value: `${archive} 分`, inline: true },
              { name: 'クールタイム', value: '60秒', inline: true }
            )
            .setTimestamp()
        ]
      });

    } catch (error) {
      console.error('thread command error:', error);

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('エラー')
              .setDescription('スレッド作成中にエラーが発生しました。')
          ]
        });
      }
    }
  }
};
