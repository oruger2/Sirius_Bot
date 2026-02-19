const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("createimige")
    .setDescription("AI画像を生成します")
    .addStringOption((option) =>
      option
        .setName("prompt")
        .setDescription("生成したい画像の説明")
        .setRequired(true)
        .setMaxLength(300)
    ),

  async execute(interaction) {
    const prompt = interaction.options.getString("prompt", true).trim();

    await interaction.deferReply();

    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${Date.now()}&nologo=true`;

    const embed = new EmbedBuilder()
      .setTitle("🖼️ AI画像を生成しました")
      .setDescription(`**プロンプト:** ${prompt}`)
      .setColor("Blurple")
      .setImage(imageUrl)
      .setFooter({ text: "Powered by Pollinations" });

    await interaction.editReply({
      content: `画像URL: ${imageUrl}`,
      embeds: [embed],
    });
  },
};
