import { EmbedBuilder, MessageFlags, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember, User } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("ユーザーに警告を送信します")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("警告するユーザー")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("警告理由")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const sendEphemeral = async (embed: EmbedBuilder) => {
      const replyPayload = { embeds: [embed], flags: MessageFlags.Ephemeral };
      const editPayload = { embeds: [embed] };
      const followUpPayload = { embeds: [embed], flags: MessageFlags.Ephemeral };

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

    const buildErrorEmbed = (content: string) =>
      new EmbedBuilder()
        .setAuthor({
          name: "エラー",
          iconURL:
            "https://cdn.discordapp.com/attachments/1477252358621630484/1480920398836142100/image.png?ex=69b16e19&is=69b01c99&hm=4ba81f76eec3144f7140e9d1b3d261108e152e487eff8a2d609ff0ada2f25c33"
        })
        .setDescription(content)
        .setColor(0xed4245)
        .setTimestamp(new Date());

    const replyError = async (content: string) => {
      await sendEphemeral(buildErrorEmbed(content));
    };

    if (!interaction.deferred && !interaction.replied) {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch {
        // If defer fails, continue and attempt a normal reply in sendEphemeral.
      }
    }

    const guild = interaction.guild;
    if (!guild) {
      await replyError("❌ サーバー情報の取得に失敗しました。もう一度お試しください。");
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const reasonInput = interaction.options.getString("reason")?.trim();

    const requestorPermissions = interaction.memberPermissions;
    if (!requestorPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
      await replyError("❌ あなたには警告を行う権限がありません。");
      return;
    }

    const botMember = await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      await replyError("❌ Botの権限確認に失敗しました。もう一度お試しください。");
      return;
    }

    if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      await replyError("❌ Botに警告権限がありません。権限を付与してください。");
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await replyError("❌ 自分自身に警告することはできません。");
      return;
    }

    if (targetUser.id === guild.ownerId) {
      await replyError("❌ サーバーオーナーに警告することはできません。");
      return;
    }

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      await replyError("❌ 対象ユーザーがサーバーにいません。");
      return;
    }

    let requestor = interaction.member as GuildMember | null;
    if (!requestor) {
      requestor = await guild.members.fetch(interaction.user.id).catch(() => null);
    }

    const requesterRolePosition = requestor?.roles.highest.position ?? 0;
    const targetRolePosition = targetMember.roles.highest.position;
    const botRolePosition = botMember.roles.highest.position;

    if (
      requestor &&
      requesterRolePosition <= targetRolePosition &&
      interaction.user.id !== guild.ownerId
    ) {
      await replyError("❌ 自分より上位または同じロールのユーザーには警告できません。");
      return;
    }

    if (botRolePosition <= targetRolePosition) {
      await replyError("❌ Botのロールが対象ユーザー以下のため警告できません。");
      return;
    }

    const reason = reasonInput ?? "なし";
    const dmEmbed = new EmbedBuilder()
      .setAuthor({
        name: "⚠️ 警告通知",
        iconURL:
          "https://cdn.discordapp.com/attachments/1477252358621630484/1480920036628627606/image.png?ex=69b16dc2&is=69b01c42&hm=b19997b57ee8665a02efdf9299d0bf5acc44e49a5585712bc43d85b66da76193"
      })
      .setDescription(
        `サーバー「${guild.name}」から警告が届きました。\n理由: ${reason}\n実行者: ${interaction.user.tag}`
      )
      .setColor(0xfee75c)
      .setTimestamp(new Date());

    const sendDm = async (user: User) => {
      try {
        await user.send({ embeds: [dmEmbed] });
        return true;
      } catch {
        return false;
      }
    };

    const dmSent = await sendDm(targetUser);

    const resultEmbed = new EmbedBuilder()
      .setAuthor({
        name: "⚠️ 警告完了",
        iconURL:
          "https://cdn.discordapp.com/attachments/1477252358621630484/1480920036628627606/image.png?ex=69b16dc2&is=69b01c42&hm=b19997b57ee8665a02efdf9299d0bf5acc44e49a5585712bc43d85b66da76193"
      })
      .setDescription(
        `⚠️ ${targetUser.tag} に警告しました。\n理由: ${reason}` +
          (dmSent ? "" : "\n※ DMの送信に失敗しました。")
      )
      .setColor(0xfee75c)
      .setTimestamp(new Date());

    await sendEphemeral(resultEmbed);
  }
};

export default command;
