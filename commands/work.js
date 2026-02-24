const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUserEconomy, addBalance, setLastWorkAt } = require("../utils/economy");

const COOLDOWN_MS = 10 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("work")
    .setDescription("10分に1回お金を稼ぎます"),

  async execute(interaction) {
    const userId = interaction.user.id;
    const now = Date.now();
    const economy = await getUserEconomy(userId);
    const elapsed = now - economy.lastWorkAt;

    if (elapsed < COOLDOWN_MS) {
      const remaining = COOLDOWN_MS - elapsed;
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.ceil((remaining % 60000) / 1000);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Orange")
            .setTitle("⏳ まだ働けません")
            .setDescription(`次の勤務まで **${minutes}分${seconds}秒** 待ってください。`),
        ],
      });
    }

    const earned = Math.floor(Math.random() * 1001) + 500;
    const updated = await addBalance(userId, earned);
    await setLastWorkAt(userId, now);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setTitle("💼 仕事完了")
          .setDescription(`**${earned}円** を稼ぎました！`)
          .addFields({ name: "現在の所持金", value: `**${updated.balance}円**` }),
      ],
    });
  },
};
