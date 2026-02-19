const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('指定した数のメッセージを削除します')
    .addIntegerOption(option =>
      option
        .setName('count')
        .setDescription('削除する数 (1〜99)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(99)
    ),

  async execute(interaction) {
    const count = interaction.options.getInteger('count');
    const channel = interaction.channel;

    try {
      /* ===== 実行者権限 ===== */
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('権限エラー')
              .setDescription('あなたに **メッセージ管理** 権限がありません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      /* ===== Bot権限 ===== */
      if (!channel.permissionsFor(interaction.guild.members.me)
        ?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('権限エラー')
              .setDescription('Botに **メッセージ管理** 権限がありません。')
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral
      });

      /* ===== メッセージ取得 ===== */
      const messages = await channel.messages.fetch({ limit: count });

      if (messages.size === 0) {
        return interaction.editReply('削除対象のメッセージがありません。');
      }

      /* ===== 削除 ===== */
      await channel.bulkDelete(messages, true);

      /* ===== 成功 ===== */
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('Green')
            .setTitle('✅ 削除完了')
            .setDescription(`${messages.size} 件のメッセージを削除しました`)
            .setTimestamp()
        ]
      });

    } catch (error) {
      console.error('clear command error:', error);

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('エラー')
              .setDescription('削除中にエラーが発生しました。')
          ]
        });
      }
    }
  }
};
