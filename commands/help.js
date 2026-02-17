const { EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  name: "help",

  data: {
    name: "help",
    description: "利用できるコマンド一覧を表示します",
  },

  async execute(interaction) {
    const commands = Array.from(interaction.client.commands.values());

    const commandLines = commands
      .map((command) => {
        const name = command?.data?.name || command?.name;
        const description = command?.data?.description || "説明は未設定です。";
        return name ? `• /${name} - ${description}` : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ja"));

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("📘 ヘルプ")
      .setDescription(
        commandLines.length > 0
          ? commandLines.join("\n")
          : "表示できるコマンドがありません。"
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
