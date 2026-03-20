import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

// OpenRouterのレスポンス型
type OpenRouterResponse = {
  choices: {
    message: {
      content: string;
    };
  }[];
};

const command = {
  data: new SlashCommandBuilder()
    .setName("ai")
    .setDescription("AIに質問します")
    .addStringOption((option) =>
      option
        .setName("prompt")
        .setDescription("質問内容")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const prompt = interaction.options.getString("prompt", true);

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-chat", // ←おすすめ
          messages: [
            {
              role: "system",
              content: "あなたは親切で簡潔に答えるAIです。"
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      if (!res.ok) {
        console.error("APIエラー:", await res.text());
        throw new Error("API request failed");
      }

      const data = (await res.json()) as OpenRouterResponse;

      const reply =
        data?.choices?.[0]?.message?.content ??
        "❌ 応答が取得できませんでした";

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "AIの応答",
          iconURL: interaction.client.user?.displayAvatarURL() || undefined
        })
        .setDescription(reply.slice(0, 4000))
        .setColor(0x5865f2)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (error) {
      console.error("AIエラー:", error);

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setDescription("❌ AIの取得に失敗しました");

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed] });
      }
    }
  }
};

export default command;