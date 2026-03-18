import { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("メッセージを削除します")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("削除する数 (1〜100)")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const sendEphemeral = async (embed: EmbedBuilder) => {
      const replyPayload = { embeds: [embed], ephemeral: true };
      const editPayload = { embeds: [embed] };
      const followUpPayload = { embeds: [embed], ephemeral: true };

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
        if (edited) {
          return edited;
        }
        const replied = await tryReply();
        if (replied) {
          return replied;
        }
        await tryFollowUp();
        return;
      }

      const replied = await tryReply();
      if (replied) {
        return replied;
      }
      const edited = await tryEdit();
      if (edited) {
        return edited;
      }
      await tryFollowUp();
    };

    const replyError = async (content: string) => {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: "エラー",
          iconURL:
            "https://cdn.discordapp.com/attachments/1477252358621630484/1480920398836142100/image.png?ex=69b16e19&is=69b01c99&hm=4ba81f76eec3144f7140e9d1b3d261108e152e487eff8a2d609ff0ada2f25c33"
        })
        .setDescription(content)
        .setColor(0xed4245)
        .setTimestamp(new Date());
      await sendEphemeral(embed);
    };

    if (!interaction.deferred && !interaction.replied) {
      try {
        await interaction.deferReply({ ephemeral: true });
      } catch {
        // If defer fails, continue and attempt a normal reply in sendEphemeral.
      }
    }

    const amount = interaction.options.getInteger("amount", true);
    const channel = interaction.channel;

    if (!channel) {
      await replyError("❌ チャンネルの取得に失敗しました。");
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await replyError("❌ あなたにはメッセージ管理権限がありません。");
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await replyError("❌ サーバー情報の取得に失敗しました。");
      return;
    }

    const botMember = await guild.members.fetchMe().catch(() => null);

    if (!botMember) {
      await replyError("❌ Botの権限確認に失敗しました。");
      return;
    }

    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await replyError("❌ Botにメッセージ管理権限がありません。");
      return;
    }

    if (amount < 1 || amount > 100) {
      await replyError("❌ 削除できる数は1〜100件です。");
      return;
    }

    try {
      const messages = await channel.messages.fetch({ limit: amount });

      if (messages.size === 0) {
        await replyError("❌ 削除するメッセージが見つかりません。");
        return;
      }

      const now = Date.now();
      const deletable = messages.filter(
        (m) => now - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
      );

      if (deletable.size === 0) {
        await replyError("❌ 14日以上前のメッセージは削除できません。");
        return;
      }

      const deleted = await channel.bulkDelete(deletable, true);

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "✅ 削除完了",
          iconURL:
            "https://cdn.discordapp.com/attachments/1477252358621630484/1480920036628627606/image.png?ex=69b16dc2&is=69b01c42&hm=b19997b57ee8665a02efdf9299d0bf5acc44e49a5585712bc43d85b66da76193"
        })
        .setDescription(`✅ ${deleted.size}件のメッセージを削除しました。`)
        .setColor(0x57f287)
        .setTimestamp(new Date());

      await sendEphemeral(embed);
    } catch (error) {
      console.error("❌ CLEAR失敗:", error);
      await replyError("❌ 削除に失敗しました。");
    }
  }
};

export default command;