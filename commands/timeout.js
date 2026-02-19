const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('メンバーをタイムアウトします')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('タイムアウトするユーザー')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('minutes')
        .setDescription('タイムアウト時間（分）')
        .setMinValue(1)
        .setMaxValue(40320) // 28日
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
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason') ?? '理由なし';
    const guild = interaction.guild;

    try {
      /* ===== 実行者権限 ===== */
      if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('権限エラー')
              .setDescription('あなたに **タイムアウト** 権限がありません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      /* ===== Bot権限 ===== */
      const botMember = guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('Bot権限エラー')
              .setDescription('Botに **タイムアウト** 権限がありません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      /* ===== メンバー取得 ===== */
      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('エラー')
              .setDescription('指定されたユーザーが見つかりません。')
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
              .setDescription('自分自身をタイムアウトすることはできません。')
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
              .setDescription('Botをタイムアウトすることはできません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

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
              .setDescription('自分と同等以上のロールを持つユーザーはタイムアウトできません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if (
        targetMember.roles.highest.position >=
        guild.members.me.roles.highest.position
      ) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('エラー')
              .setDescription('Botより上位のロールを持つユーザーはタイムアウトできません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      /* ===== タイムアウト実行 ===== */
      const durationMs = minutes * 60 * 1000;
      await targetMember.timeout(durationMs, reason);

      /* ===== 成功 ===== */
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('Green')
            .setTitle('⏱️ タイムアウト完了')
            .addFields(
              { name: 'ユーザー', value: targetUser.tag, inline: true },
              { name: '時間', value: `${minutes} 分`, inline: true },
              { name: '実行者', value: interaction.user.tag, inline: true },
              { name: '理由', value: reason }
            )
            .setTimestamp()
        ]
      });

    } catch (error) {
      console.error('timeout command error:', error);

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('エラー')
              .setDescription('タイムアウト中にエラーが発生しました。')
          ]
        });
      }
    }
  }
};
