const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('ボットの情報を表示します'),
  async execute(interaction) {
      const aboutEmbed = new EmbedBuilder()
        .setColor(0x00ff00) // 緑色
        .setTitle('ボット情報')
        .setDescription('このボットの詳細情報をご確認ください。')
        .addFields(
          { name: '名前', value: 'Sirius Bot', inline: true },
          { name: 'バージョン', value: '1.00.0', inline: true },
          { name: '作者', value: 'Oruger', inline: true },
          { name: '公式ホームページ', value: '[現在非公開]()', inline: false },
          { name: 'サポート', value: '[サポートサーバーに参加](https://discord.gg/TbPtJW5pkt)', inline: false },
        )
        .setFooter({ text: 'Clystal Bot | Powered by Discord.js', iconURL: 'https://i.imgur.com/AfFp7pu.png' })
        .setTimestamp();

      await interaction.reply({ embeds: [aboutEmbed] });
  },
};