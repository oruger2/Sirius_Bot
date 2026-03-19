import {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName("about")
    .setDescription("Botの情報を表示します"),

  async execute(interaction: ChatInputCommandInteraction) {

    const sendEphemeral = async (embed: EmbedBuilder, components?: any[]) => {
      const replyPayload = { embeds: [embed], components };
      const editPayload = { embeds: [embed], components };
      const followUpPayload = { embeds: [embed], components };

      const tryEdit = async () => {
        try {
          return await interaction.editReply(editPayload);
        } catch (error) {
          if (error instanceof Error && error.name === "InteractionNotReplied") {
            return null;
          }
          throw error;
        }
      };

      const tryReply = async () => {
        try {
          return await interaction.reply(replyPayload);
        } catch (error) {
          if ((error as { code?: number }).code === 40060) {
            return null;
          }
          throw error;
        }
      };

      const tryFollowUp = async () => {
        try {
          return await interaction.followUp(followUpPayload);
        } catch {
          return null;
        }
      };

      if (interaction.deferred || interaction.replied) {
        const edited = await tryEdit();
        if (edited) return edited;

        const replied = await tryReply();
        if (replied) return replied;

        await tryFollowUp();
        return;
      }

      const replied = await tryReply();
      if (replied) return replied;

      const edited = await tryEdit();
      if (edited) return edited;

      await tryFollowUp();
    };

    if (!interaction.deferred && !interaction.replied) {
      try {
        await interaction.deferReply(); // ← flags削除
      } catch {}
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: "Botについて",
        iconURL: interaction.client.user?.displayAvatarURL()
      })
      .setDescription(
        "このBotはサーバー管理・経済・AIなど様々な機能を提供します。\n\n" +
        "**Version**: 2.5.0\n" +
        "**developer**: Oruger-0730\n" +
        "**使用言語**: TypeScript\n\n" +
        "新機能の追加やバグの修正は随時行っています。ご意見がある場合はサポートサーバーまでお越しください。"
      )
      .setColor(0x5865f2)
      .setTimestamp(new Date());
    
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("サポートサーバー")
        .setStyle(ButtonStyle.Link)
        .setURL("https://discord.gg/trysmYTmNr"), 
      new ButtonBuilder()
        .setLabel("公式ホームページ")
        .setStyle(ButtonStyle.Link)
        .setURL("https://siriusbot-homepage.onrender.com/") 
    );

    await sendEphemeral(embed, [row]);
  }
};

export default command;