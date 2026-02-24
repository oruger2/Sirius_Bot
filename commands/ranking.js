const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getRanking } = require("../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("所持金ランキングを表示します"),

  async execute(interaction) {
    const ranking = await getRanking(10);

    if (ranking.length === 0) {
      return interaction.reply("まだランキングデータがありません。`/work` で稼いでみよう！");
    }

    const lines = ranking.map((entry, index) => {
      const user = interaction.client.users.cache.get(entry.userId);
      const name = entry.username || (user ? user.tag : `UserID: ${entry.userId}`);
      return `**${index + 1}.** ${name} - **${entry.balance}円**`;
    });

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Gold")
          .setTitle("🏆 所持金ランキング TOP10")
          .setDescription(lines.join("\n")),
      ],
    });
  },
};
