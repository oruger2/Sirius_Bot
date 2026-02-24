const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { getUserXp, setUserXp, MAX_LEVEL } = require("../utils/xpSystem");

function isAdmin(interaction) {
  return interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

function parseAmount(value) {
  const number = Number.parseInt(String(value || "").trim(), 10);
  if (Number.isNaN(number)) return null;
  return number;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("XP/レベル管理コマンド（管理者専用）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("メンバーの現在XP/レベルを確認します")
        .addUserOption((opt) => opt.setName("member").setDescription("対象メンバー").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("メンバーにXPを追加します")
        .addUserOption((opt) => opt.setName("member").setDescription("対象メンバー").setRequired(true))
        .addIntegerOption((opt) => opt.setName("amount").setDescription("追加XP").setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("メンバーのXPを減らします")
        .addUserOption((opt) => opt.setName("member").setDescription("対象メンバー").setRequired(true))
        .addIntegerOption((opt) => opt.setName("amount").setDescription("減算XP").setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("メンバーのXPを直接設定します")
        .addUserOption((opt) => opt.setName("member").setDescription("対象メンバー").setRequired(true))
        .addIntegerOption((opt) => opt.setName("xp").setDescription("設定XP").setRequired(true).setMinValue(0))
    ),

  async execute(interaction) {
    if (!isAdmin(interaction)) {
      return interaction.reply({
        content: "❌ このコマンドは管理者のみ実行できます。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    const member = interaction.options.getUser("member");

    if (sub === "show") {
      const data = await getUserXp(guildId, member.id);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Blue")
            .setTitle("📊 レベル情報")
            .setDescription(`<@${member.id}> のXP/レベル情報です。`)
            .addFields(
              { name: "レベル", value: `${data.level}`, inline: true },
              { name: "XP", value: `${data.xp}`, inline: true },
              {
                name: "次レベルまで",
                value: data.level >= MAX_LEVEL ? "最大レベル到達" : `${data.neededXp} XP`,
                inline: true,
              }
            ),
        ],
      });
    }

    let nextXp = 0;
    let action = "";

    if (sub === "add") {
      const amount = parseAmount(interaction.options.getInteger("amount"));
      const current = await getUserXp(guildId, member.id);
      nextXp = current.xp + amount;
      action = `+${amount} XP`;
    }

    if (sub === "remove") {
      const amount = parseAmount(interaction.options.getInteger("amount"));
      const current = await getUserXp(guildId, member.id);
      nextXp = Math.max(0, current.xp - amount);
      action = `-${amount} XP`;
    }

    if (sub === "set") {
      nextXp = parseAmount(interaction.options.getInteger("xp"));
      action = `XPを ${nextXp} に設定`;
    }

    const updated = await setUserXp(guildId, member.id, nextXp);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setTitle("✅ レベル更新")
          .setDescription(`<@${member.id}> に対して **${action}** を実行しました。`)
          .addFields(
            { name: "現在レベル", value: `${updated.level}`, inline: true },
            { name: "現在XP", value: `${updated.xp}`, inline: true },
            {
              name: "次レベルまで",
              value: updated.level >= MAX_LEVEL ? "最大レベル到達" : `${updated.neededXp} XP`,
              inline: true,
            }
          ),
      ],
    });
  },
};
