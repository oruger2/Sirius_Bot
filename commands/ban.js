const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('メンバーをBANします')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('BANするユーザー')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('理由')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? '理由なし';
    const guild = interaction.guild;

    try {
      /* ===== 実行者権限 ===== */
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('権限エラー')
              .setDescription('あなたに **BAN** 権限がありません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      /* ===== Bot権限 ===== */
      const botMember = guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('Bot権限エラー')
              .setDescription('Botに **BAN** 権限がありません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      /* ===== 自分 / Bot 防止 ===== */
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('エラー')
              .setDescription('自分自身をBANすることはできません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if (targetUser.id === interaction.client.user.id) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('エラー')
              .setDescription('BotをBANすることはできません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      /* ===== 既にBANされているか ===== */
      const bans = await guild.bans.fetch();
      if (bans.has(targetUser.id)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Yellow')
              .setTitle('警告')
              .setDescription('そのユーザーは既にBANされています。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      /* ===== メンバー取得（在籍している場合） ===== */
      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
      if (targetMember) {
        /* ===== ロール階層チェック ===== */
        if (
          targetMember.roles.highest.position >=
          interaction.member.roles.highest.position
        ) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('Red')
                .setTitle('エラー')
                .setDescription('自分と同等以上のロールを持つユーザーはBANできません。')
            ],
            flags: MessageFlags.Ephemeral
          });
        }

        if (
          targetMember.roles.highest.position >=
          botMember.roles.highest.position
        ) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('Red')
                .setTitle('エラー')
                .setDescription('Botより上位のロールを持つユーザーはBANできません。')
            ],
            flags: MessageFlags.Ephemeral
          });
        }
      }

      await interaction.deferReply();

      /* ===== BAN 実行 ===== */
      await guild.members.ban(targetUser.id, { reason });

      /* ===== 成功 ===== */
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('DarkRed')
            .setTitle('🔨 BAN 実行')
            .addFields(
              { name: 'ユーザー', value: targetUser.tag, inline: true },
              { name: '実行者', value: interaction.user.tag, inline: true },
              { name: '理由', value: reason }
            )
            .setTimestamp()
        ]
      });

    } catch (error) {
      console.error('ban command error:', error);

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('エラー')
              .setDescription('BANの実行中にエラーが発生しました。')
          ]
        });
      }
    }
  }
};
