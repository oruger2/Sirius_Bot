const fsp = require('fs/promises');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { getGuildStarboardSetting } = require('../utils/starboardSettings');

const postsPath = path.join(__dirname, '../json/starboardPosts.json');

function toEmojiValue(emoji) {
  const customEmojiMatch = String(emoji || '').match(/^<?a?:\w+:(\d+)>?$/);
  if (customEmojiMatch) return customEmojiMatch[1];
  if (/^\d+$/.test(String(emoji || ''))) return String(emoji || '');
  return String(emoji || '').trim();
}

async function loadPosts() {
  try {
    const raw = await fsp.readFile(postsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    console.error('[STARBOARD] 投稿データ読み込み失敗', error);
    return {};
  }
}

async function savePosts(data) {
  await fsp.mkdir(path.dirname(postsPath), { recursive: true });
  await fsp.writeFile(postsPath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  name: 'messageReactionAdd',

  async execute(reaction, user) {
    if (user.bot) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }

    const message = reaction.message;
    if (!message.guild || !message.channel) return;

    const setting = await getGuildStarboardSetting(message.guild.id);
    if (!setting.enabled) return;
    if (!setting.targetChannelIds.includes(message.channel.id)) return;
    if (!setting.sendChannelId || !setting.emoji) return;

    const reactionEmoji = reaction.emoji.id || reaction.emoji.name;
    if (String(reactionEmoji) !== toEmojiValue(setting.emoji)) return;

    const starboardChannel = message.guild.channels.cache.get(setting.sendChannelId);
    if (!starboardChannel || !starboardChannel.isTextBased()) return;

    const count = reaction.count || 0;
    if (count < setting.requiredCount) return;

    const posts = await loadPosts();
    const key = `${message.guild.id}:${message.id}`;

    const embed = new EmbedBuilder()
      .setColor('Yellow')
      .setAuthor({ name: message.author?.tag || 'Unknown User', iconURL: message.author?.displayAvatarURL?.() })
      .setDescription(`${message.content || '（テキストなし）'}\n\n[元メッセージへ移動](${message.url})`)
      .addFields(
        { name: 'チャンネル', value: `<#${message.channel.id}>`, inline: true },
        { name: 'リアクション', value: `${setting.emoji} x **${count}**`, inline: true }
      )
      .setTimestamp(message.createdAt);

    const imageAttachment = message.attachments.find((a) => a.contentType?.startsWith('image/'));
    if (imageAttachment) {
      embed.setImage(imageAttachment.url);
    }

    const existingMessageId = posts[key]?.starboardMessageId;

    if (existingMessageId) {
      const existingMessage = await starboardChannel.messages.fetch(existingMessageId).catch(() => null);
      if (existingMessage) {
        await existingMessage.edit({ embeds: [embed] });
        return;
      }
    }

    const sent = await starboardChannel.send({ content: `${setting.emoji} **${count}**`, embeds: [embed] });
    posts[key] = {
      guildId: message.guild.id,
      sourceChannelId: message.channel.id,
      sourceMessageId: message.id,
      starboardChannelId: starboardChannel.id,
      starboardMessageId: sent.id,
    };

    await savePosts(posts);
  },
};
