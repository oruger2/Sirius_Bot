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
const {
  loadTicketPanelSettings,
  saveTicketPanelSettings,
} = require("../utils/ticketPanelSettings");

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
        .setName("staff_user")
        .setDescription("チケット対応者ユーザー（任意）")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("staff_role")
        .setDescription("チケット対応者ロール（任意）")
        .setRequired(false)
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
    const staffUser = interaction.options.getUser("staff_user", false);
    const staffRole = interaction.options.getRole("staff_role", false);
    const title = interaction.options.getString("title", true);
    const message = interaction.options.getString("message", true);

    if (!staffUser && !staffRole) {
      return interaction.reply({
        content: "❌ `staff_user` または `staff_role` のどちらかは必須です。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const staffMentions = [];
    if (staffUser) staffMentions.push(`<@${staffUser.id}>`);
    if (staffRole) staffMentions.push(`<@&${staffRole.id}>`);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(title)
      .setDescription(message)
      .addFields(
        { name: "対応者", value: staffMentions.join(" "), inline: true },
        { name: "作成先カテゴリ", value: `${category}`, inline: true }
      )
      .setFooter({ text: "下のボタンを押すとチケットチャンネルを作成します" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:create")
        .setLabel("チケットを作成")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎫")
    );

    const sentMessage = await interaction.channel.send({ embeds: [embed], components: [row] });

    const panelSettings = await loadTicketPanelSettings();
    panelSettings[sentMessage.id] = {
      guildId: interaction.guildId,
      channelId: sentMessage.channelId,
      categoryId: category.id,
      staffUserId: staffUser?.id || "",
      staffRoleId: staffRole?.id || "",
    };
    await saveTicketPanelSettings(panelSettings);

    return interaction.reply({
      content: "✅ チケット作成用の埋め込みを送信しました。",
      flags: MessageFlags.Ephemeral,
    });
  },
};
