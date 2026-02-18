const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const warningsPath = path.join(__dirname, "../json/warnings.json");

const saveWarnings = (warnings) => {
  const jsonDir = path.dirname(warningsPath);

  if (!fs.existsSync(jsonDir)) {
    fs.mkdirSync(jsonDir, { recursive: true });
  }

  fs.writeFileSync(warningsPath, JSON.stringify(warnings, null, 2), "utf8");
};

const loadWarnings = () => {
  if (!fs.existsSync(warningsPath)) {
    saveWarnings({});
  }

  return JSON.parse(fs.readFileSync(warningsPath, "utf8"));
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("指定したユーザーに警告を与えます")
    .addUserOption((option) =>
      option.setName("user").setDescription("警告するユーザー").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("警告の理由").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");
    const guildId = interaction.guild.id;
    const userId = user.id;
    const guildName = interaction.guild.name;

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      const noPermissionEmbed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("エラー")
        .setDescription("あなたに以下の権限がありません。```管理者```")
        .setTimestamp();

      return interaction.reply({
        embeds: [noPermissionEmbed],
        flags: MessageFlags.Ephemeral,
      });
    }

    const warnings = loadWarnings();

    if (!warnings[guildId]) warnings[guildId] = {};
    if (!warnings[guildId][userId]) warnings[guildId][userId] = [];

    warnings[guildId][userId].push({ reason, date: new Date().toISOString() });
    saveWarnings(warnings);

    const warnCount = warnings[guildId][userId].length;

    const embed = new EmbedBuilder()
      .setColor("Yellow")
      .setTitle("警告")
      .setDescription(`<@${user.id}> に警告を与えました。`)
      .addFields(
        { name: "理由", value: reason },
        { name: "今回での警告回数", value: `${warnCount}回`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });

    try {
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("警告通知")
            .setDescription(`あなたは **${guildName}** で警告を受けました。`)
            .addFields(
              { name: "理由", value: reason },
              { name: "累計警告回数", value: `${warnCount}回` }
            )
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error(`DM送信に失敗しました: ${error}`);
    }
  },
};
