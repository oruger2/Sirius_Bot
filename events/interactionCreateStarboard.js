const {
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const { getGuildJoinSetting } = require('../utils/joinMessageSettings');
const { getGuildLeaveSetting } = require('../utils/leaveMessageSettings');
const { getGuildSpamSetting } = require('../utils/spamBlockSettings');
const { getGuildAutoReactionSetting } = require('../utils/autoReactionSettings');
const { getGuildShortLinkSetting } = require('../utils/shortLinkBlockSettings');
const { getGuildXpSetting } = require('../utils/xpSystem');
const { getGuildStarboardSetting, setGuildStarboardSetting } = require('../utils/starboardSettings');
const settingpanel = require('../commands/settingpanel');

function isAdmin(interaction) {
  return interaction.inGuild() && interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

function toEmojiValue(emoji) {
  const customEmojiMatch = String(emoji || '').match(/^<?a?:\w+:(\d+)>?$/);
  if (customEmojiMatch) return customEmojiMatch[1];
  if (/^\d+$/.test(String(emoji || ''))) return String(emoji);
  return String(emoji || '').trim();
}

async function renderSettingPanel(guildId, page = 1) {
  const joinSetting = await getGuildJoinSetting(guildId);
  const leaveSetting = await getGuildLeaveSetting(guildId);
  const spamSetting = await getGuildSpamSetting(guildId);
  const autoReactionSetting = await getGuildAutoReactionSetting(guildId);
  const shortLinkSetting = await getGuildShortLinkSetting(guildId);
  const xpSetting = await getGuildXpSetting(guildId);
  const starboardSetting = await getGuildStarboardSetting(guildId);

  return {
    embeds: [settingpanel.buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting, starboardSetting)],
    components: settingpanel.buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting, xpSetting, starboardSetting, page),
  };
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    const isTarget =
      (interaction.isButton() && ['starboard_toggle', 'starboard_open_modal', 'starboard_open_emoji_modal'].includes(interaction.customId)) ||
      (interaction.isChannelSelectMenu() && ['starboard_select_targets', 'starboard_select_send_channel'].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === 'starboard_modal');

    if (!isTarget) return;
    if (!interaction.inGuild()) return;

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: '❌ 管理者のみ操作できます。', flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    const setting = await getGuildStarboardSetting(guildId);

    if (interaction.isButton() && interaction.customId === 'starboard_toggle') {
      if (!setting.targetChannelIds.length || !setting.emoji || !setting.sendChannelId) {
        return interaction.reply({
          content: '⚠️ ONにする前に対象チャンネル・絵文字・送信先チャンネルを設定してください。',
          flags: MessageFlags.Ephemeral,
        });
      }

      await setGuildStarboardSetting(guildId, { ...setting, enabled: !setting.enabled });
      return interaction.update(await renderSettingPanel(guildId, 2));
    }

    if (interaction.isButton() && interaction.customId === 'starboard_open_modal') {
      const targetSelect = new ChannelSelectMenuBuilder()
        .setCustomId('starboard_select_targets')
        .setPlaceholder('対象チャンネルを選択（複数可）')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(25);

      if (setting.targetChannelIds.length) {
        targetSelect.setDefaultChannels(...setting.targetChannelIds.slice(0, 25));
      }

      const sendChannelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('starboard_select_send_channel')
        .setPlaceholder('送信チャンネルを選択（1つ）')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1);

      if (setting.sendChannelId) {
        sendChannelSelect.setDefaultChannels(setting.sendChannelId);
      }

      const emojiButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('starboard_open_emoji_modal')
          .setLabel('絵文字を編集')
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.update({
        content: '対象チャンネル / 送信チャンネルはセレクトメニュー、絵文字は下のボタンから設定できます。',
        components: [
          new ActionRowBuilder().addComponents(targetSelect),
          new ActionRowBuilder().addComponents(sendChannelSelect),
          emojiButtonRow,
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isButton() && interaction.customId === 'starboard_open_emoji_modal') {
      const modal = new ModalBuilder().setCustomId('starboard_modal').setTitle('スターボード絵文字設定');
      const emojiInput = new TextInputBuilder()
        .setCustomId('starboard_emoji')
        .setLabel('絵文字（1つのみ）')
        .setPlaceholder('⭐ または <:custom:123456789012345678>')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(setting.emoji || '');

      modal.addComponents(new ActionRowBuilder().addComponents(emojiInput));
      return interaction.showModal(modal);
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === 'starboard_select_targets') {
      const channelIds = interaction.values;
      const botMember = interaction.guild.members.me;

      for (const channelId of channelIds) {
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) {
          return interaction.reply({ content: '❌ 無効な対象チャンネルです。', flags: MessageFlags.Ephemeral });
        }

        const perms = channel.permissionsFor(botMember);
        if (!perms?.has(PermissionsBitField.Flags.ViewChannel) || !perms.has(PermissionsBitField.Flags.ReadMessageHistory)) {
          return interaction.reply({
            content: '❌ 指定チャンネルのいずれかで閲覧/履歴閲覧権限がありません。',
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      await setGuildStarboardSetting(guildId, {
        ...setting,
        targetChannelIds: channelIds,
      });

      return interaction.update({ ...(await renderSettingPanel(guildId, 2)), flags: MessageFlags.Ephemeral });
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === 'starboard_select_send_channel') {
      const sendChannelId = interaction.values[0];
      const sendChannel = interaction.guild.channels.cache.get(sendChannelId);
      const botMember = interaction.guild.members.me;
      const perms = sendChannel?.permissionsFor(botMember);

      if (!sendChannel || !perms?.has(PermissionsBitField.Flags.SendMessages) || !perms.has(PermissionsBitField.Flags.EmbedLinks)) {
        return interaction.reply({
          content: '❌ 送信先チャンネルでメッセージ送信/埋め込み権限がありません。',
          flags: MessageFlags.Ephemeral,
        });
      }

      await setGuildStarboardSetting(guildId, { ...setting, sendChannelId });
      return interaction.update({ ...(await renderSettingPanel(guildId, 2)), flags: MessageFlags.Ephemeral });
    }

    if (interaction.isModalSubmit() && interaction.customId === 'starboard_modal') {
      const emojiText = interaction.fields.getTextInputValue('starboard_emoji').trim();
      const values = [...emojiText.matchAll(/<a?:\w+:\d+>|\p{Extended_Pictographic}/gu)].map((m) => m[0]);

      if (values.length !== 1 || values[0] !== emojiText) {
        return interaction.reply({
          content: '❌ 絵文字は1つだけ指定してください。',
          flags: MessageFlags.Ephemeral,
        });
      }

      const emojiValue = toEmojiValue(emojiText);
      if (/^\d+$/.test(emojiValue) && !interaction.guild.emojis.cache.has(emojiValue)) {
        return interaction.reply({
          content: '❌ そのカスタム絵文字はこのサーバーで利用できません。',
          flags: MessageFlags.Ephemeral,
        });
      }

      await setGuildStarboardSetting(guildId, { ...setting, emoji: emojiText });
      return interaction.update({ ...(await renderSettingPanel(guildId, 2)), flags: MessageFlags.Ephemeral });
    }
  },
};
