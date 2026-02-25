const fsp = require('fs/promises');
const path = require('path');
const { EmbedBuilder, MessageFlags } = require('discord.js');

const DATA_PATH = path.join(__dirname, '../json/rolepanels.json');

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    if (user.bot) return;

    /* ===== partial 対応 ===== */
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }

    let data;
    try {
      const raw = await fsp.readFile(DATA_PATH, 'utf8');
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const messageId = reaction.message.id;
    const emojiKey = reaction.emoji.id ?? reaction.emoji.name;

    if (!data[messageId]?.roles[emojiKey]) return;

    /* ===== ロール処理 ===== */
    const roleId = data[messageId].roles[emojiKey];
    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const role = guild.roles.cache.get(roleId);
    if (!role) return;

    let actionText;

    try {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(role);
        actionText = '❌ ロールを削除しました';
      } else {
        await member.roles.add(role);
        actionText = '✅ ロールを付与しました';
      }

      /* ===== 通知 Embed ===== */
      const embed = new EmbedBuilder()
        .setColor(member.roles.cache.has(roleId) ? 'Red' : 'Green')
        .setTitle(actionText)
        .setDescription(`${user}\n**${role.name}**`)
        .setTimestamp();

      const msg = await reaction.message.channel.send({
        embeds: [embed],
                flags: MessageFlags.Ephemeral
      });

      /* 5秒後に削除 */
      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 5000);

      /* リアクション削除 */
      await reaction.users.remove(user.id).catch(() => {});

    } catch (err) {
      console.error('reaction role error:', err);
    }
  }
};
