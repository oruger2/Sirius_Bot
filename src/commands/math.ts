import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

type AIResponse = {
  choices: {
    message: {
      content: string;
    };
  }[];
};

const command = {
  data: new SlashCommandBuilder()
    .setName("math-ai")
    .setDescription("数学の問題を途中式付きで解きます")
    .addStringOption((option) =>
      option
        .setName("problem")
        .setDescription("問題を入力（例: x^2 - 5x + 6 = 0）")
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const problem = interaction.options.getString("problem", true);

    await interaction.deferReply();

    const now = new Date().toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-chat",
          messages: [
            {
              role: "system",
              content: `
あなたは優秀な数学教師です。

【ルール】
- 必ず途中式をすべて書く
- 高校数学（数I・Ⅱ・Ⅲ）レベルで説明
- 数式はわかりやすく整理
- 最後に答えを明確に書く
- 間違った情報を絶対に出さない
- わからない場合は「解けません」と言う

【現在日時】
${now}
              `,
            },
            {
              role: "user",
              content: problem,
            },
          ],
        }),
      });

      if (!res.ok) {
        console.error(await res.text());
        throw new Error("API error");
      }

      const data = (await res.json()) as AIResponse;

      const answer =
        data?.choices?.[0]?.message?.content ?? "❌ 解答を取得できませんでした";

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "数学AI 解答",
          iconURL: SUCCESS_ICON_URL,
        })
        .setDescription(answer.slice(0, 4000))
        .setColor(0x5865f2)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("数学AIエラー:", error);

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "エラー",
          iconURL: ERROR_ICON_URL,
        })
        .setColor(0xed4245)
        .setDescription("❌ 解答に失敗しました");

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
