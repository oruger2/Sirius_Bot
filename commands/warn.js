const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const fsp = require("fs/promises");
const path = require("path");

const warningsPath = path.join(__dirname, "../json/warnings.json");

const saveWarnings = async (warnings) => {
  const jsonDir = path.dirname(warningsPath);
  await fsp.mkdir(jsonDir, { recursive: true });
  await fsp.writeFile(warningsPath, JSON.stringify(warnings, null, 2), "utf8");
};

const loadWarnings = async () => {
  let raw;
  try {
    raw = await fsp.readFile(warningsPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      await saveWarnings({});
      return {};
    }
    throw err;
  }
  return JSON.parse(raw);
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
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");
    const guildId = interaction.guild.id;
    const userId = user.id;
    const guildName = interaction.guild.name;

    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      const noPermissionEmbed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("エラー")
        .setDescription("あなたに以下の権限がありません。```メンバー管理```")
        .setTimestamp();

      return interaction.reply({
        embeds: [noPermissionEmbed],
        flags: MessageFlags.Ephemeral,
      });
    }

    const warnings = await loadWarnings();

    if (!warnings[guildId]) warnings[guildId] = {};
    if (!warnings[guildId][userId]) warnings[guildId][userId] = [];

    warnings[guildId][userId].push({ reason, date: new Date().toISOString() });
    await saveWarnings(warnings);

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
