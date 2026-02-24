const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUserEconomy } = require("../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("money")
    .setDescription("現在の所持金を表示します")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("所持金を確認するユーザー（省略時は自分）")
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user") || interaction.user;
    const economy = await getUserEconomy(target.id);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Blue")
          .setTitle("💰 所持金")
          .setDescription(`${target} の所持金は **${economy.balance}円** です。`),
      ],
    });
  },
};
