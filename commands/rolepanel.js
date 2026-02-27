const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');
const fsp = require('fs/promises');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../json/rolepanels.json');

/* ===== カラー定義 ===== */
const COLOR_MAP = {
  RED: 0xed4245,
  GREEN: 0x57f287,
  BLUE: 0x3498db,
  YELLOW: 0xfee75c,
  PURPLE: 0x9b59b6,
  ORANGE: 0xe67e22,
  BLURPLE: 0x5865f2,
  GREY: 0x95a5a6,
  DARK: 0x2c2f33
};

/* ===== JSON操作 ===== */
async function loadData() {
  let raw;
  try {
    raw = await fsp.readFile(DATA_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }

  if (!raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveData(data) {
  await fsp.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fsp.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/* ===== 絵文字キー変換 ===== */
function getEmojiKeyFromString(emoji) {
  const match = emoji.match(/<(a?):(\w+):(\d+)>/);
  if (match) return match[3];
  return emoji;
}

function isValidEmojiInput(value) {
  if (!value || typeof value !== 'string') return false;

  const emoji = value.trim();
  if (!emoji) return false;

  const customEmojiRegex = /^<a?:\w{2,32}:\d{17,20}>$/;
  const unicodeEmojiRegex = /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}\uFE0F)(?:\p{Emoji_Modifier})?(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}\uFE0F)(?:\p{Emoji_Modifier})?)*)$/u;

  return customEmojiRegex.test(emoji) || unicodeEmojiRegex.test(emoji);
}

/* ===== エラーEmbed ===== */
function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('Red')
    .setTitle(title)
    .setDescription(description);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolepanel')
    .setDescription('リアクションロールパネル')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('ロールパネルを作成')
        .addStringOption(o => o.setName('emoji').setDescription('絵文字').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('付与するロール').setRequired(true))
        .addStringOption(o => o.setName('title').setDescription('タイトル').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('色 (RED, BLUE など)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('既存パネルに追加')
        .addStringOption(o => o.setName('messageid').setDescription('メッセージID').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('絵文字').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('ロール').setRequired(true))
    ),

  async execute(interaction) {
    /* ===== 権限チェック ===== */
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        embeds: [
          errorEmbed(
            '権限エラー',
            'このコマンドを使用するには **ロールの管理** 権限が必要です。'
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();
    const data = await loadData();

    /* ================= create ================= */
    if (sub === 'create') {
      const emoji = interaction.options.getString('emoji');
      const role = interaction.options.getRole('role');
      const title = interaction.options.getString('title');
      const colorName = interaction.options.getString('color').toUpperCase();

      if (!COLOR_MAP[colorName]) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              '色指定エラー',
              `指定された色 **${colorName}** は無効です。`
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      let msg;
      try {
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setColor(COLOR_MAP[colorName])
          .setDescription(`${emoji} → <@&${role.id}>`)
          .setFooter({ text: 'リアクションでロール付与' });

        msg = await interaction.channel.send({ embeds: [embed] });
        await msg.react(emoji);
      } catch {
        return interaction.reply({
          embeds: [
            errorEmbed(
              '作成失敗',
              'メッセージ送信またはリアクション追加に失敗しました。'
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const emojiKey = getEmojiKeyFromString(emoji);

      data[msg.id] = {
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        roles: { [emojiKey]: role.id }
      };

      await saveData(data);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Green')
            .setTitle('✅ 作成完了')
            .setDescription(`ロールパネルを作成しました。\n\n**メッセージID**\n\`${msg.id}\``)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    /* ================= add ================= */
    if (sub === 'add') {
      const messageId = interaction.options.getString('messageid');
      const emoji = interaction.options.getString('emoji');
      const role = interaction.options.getRole('role');

      if (!isValidEmojiInput(emoji)) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              '絵文字指定エラー',
              '絵文字以外は指定できません。有効な絵文字を指定してください。'
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const panel = data[messageId];
      if (!panel) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              'パネル未発見',
              '指定されたメッセージIDのロールパネルが存在しません。'
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      let msg;
      try {
        const channel = await interaction.client.channels.fetch(panel.channelId);
        msg = await channel.messages.fetch(messageId);
      } catch {
        return interaction.reply({
          embeds: [
            errorEmbed(
              '取得失敗',
              'パネルのメッセージまたはチャンネルを取得できませんでした。'
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      try {
        const embed = EmbedBuilder.from(msg.embeds[0]);
        embed.setDescription(`${embed.data.description}\n${emoji} → <@&${role.id}>`);

        await msg.edit({ embeds: [embed] });
        await msg.react(emoji);

        const emojiKey = getEmojiKeyFromString(emoji);
        panel.roles[emojiKey] = role.id;

        await saveData(data);
      } catch {
        return interaction.reply({
          embeds: [
            errorEmbed(
              '追加失敗',
              'リアクション追加または埋め込み編集に失敗しました。'
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Green')
            .setTitle('✅ 追加完了')
            .setDescription(`${emoji} → <@&${role.id}> を追加しました。`)
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
