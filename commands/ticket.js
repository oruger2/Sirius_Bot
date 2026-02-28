const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChannelType,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("チケット作成用の埋め込みを設置します")
    .addChannelOption((option) =>
      option
        .setName("category")
        .setDescription("チケットチャンネルを作成するカテゴリ")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildCategory)
    )
    .addUserOption((option) =>
      option
        .setName("staff")
        .setDescription("チケット作成時に通知する対応者")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("埋め込みタイトル")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("埋め込み本文")
        .setRequired(true)
        .setMaxLength(2000)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        content: "❌ このコマンドは **チャンネル管理** 権限が必要です。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const category = interaction.options.getChannel("category", true);
    const staff = interaction.options.getUser("staff", true);
    const title = interaction.options.getString("title", true);
    const message = interaction.options.getString("message", true);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(title)
      .setDescription(message)
      .addFields(
        { name: "対応者", value: `<@${staff.id}>`, inline: true },
        { name: "作成先カテゴリ", value: `${category}`, inline: true }
      )
      .setFooter({ text: "下のボタンを押すとチケットチャンネルを作成します" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:create:${category.id}:${staff.id}`)
        .setLabel("チケットを作成")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎫")
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });

    return interaction.reply({
      content: "✅ チケット作成用の埋め込みを送信しました。",
      flags: MessageFlags.Ephemeral,
    });
  },
};
