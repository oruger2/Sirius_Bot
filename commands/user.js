const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');

function formatDate(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('ユーザーの情報を表示します')
        .addUserOption(option => option.setName('target').setDescription('情報を表示するユーザー')),

    async execute(interaction) {
        await interaction.deferReply();

        let target = interaction.options.getUser('target');

        // ユーザーが選択されていない場合は、interaction のユーザー自身を対象にする
        if (!target) {
            target = interaction.user;
        }

        const member = interaction.guild.members.cache.get(target.id);

        if (!member) {
            await interaction.followUp('ユーザーが見つかりませんでした');
            return;
        }

        const roles = member.roles.cache
            .filter(role => role.name !== '@everyone')
            .map(role => `<@&${role.id}>`)
            .join(', ');

        // ユーザーが参加しているサーバーの数を取得
        
        const userEmbed = new EmbedBuilder()
            .setTitle('ユーザー情報')
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'ユーザー名', value: `<@${target.id}>`, inline: true },
                { name: 'ユーザーID', value: target.id, inline: true },
                { name: 'アカウント作成日', value: formatDate(target.createdAt), inline: true },
                { name: 'サーバー参加日', value: formatDate(member.joinedAt), inline: true },
                { name: 'ロール', value: roles || 'なし', inline: true }
            )
            .setColor(0x00AE86);

        await interaction.followUp({ embeds: [userEmbed] });
    },
};