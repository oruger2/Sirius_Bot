import { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "../utils/embedIcons.ts";

const command = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("ユーザーをタイムアウトします")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("タイムアウトするユーザー")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("タイムアウト時間(分)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("タイムアウト理由")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const sendEphemeral = async (embed: EmbedBuilder) => {
      const replyPayload = { embeds: [embed], flags: ["Ephemeral"] as const };
      const editPayload = { embeds: [embed] };
      const followUpPayload = { embeds: [embed], flags: ["Ephemeral"] as const };

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
          iconURL: ERROR_ICON_URL
        })
        .setDescription(content)
        .setColor(0xed4245)
        .setTimestamp(new Date());

    const replyError = async (content: string) => {
      await sendEphemeral(buildErrorEmbed(content));
    };

    if (!interaction.deferred && !interaction.replied) {
      try {
        await interaction.deferReply({ flags: ["Ephemeral"] as const });
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
    const minutes = interaction.options.getInteger("minutes", true);
    const reasonInput = interaction.options.getString("reason")?.trim();

    const requestorPermissions = interaction.memberPermissions;
    if (!requestorPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
      await replyError("❌ あなたにはタイムアウト権限がありません。");
      return;
    }

    const botMember = await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      await replyError("❌ Botの権限確認に失敗しました。もう一度お試しください。");
      return;
    }

    if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      await replyError("❌ Botにタイムアウト権限がありません。権限を付与してください。");
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
      targetUser.id !== interaction.user.id &&
      requesterRolePosition <= targetRolePosition &&
      interaction.user.id !== guild.ownerId
    ) {
      await replyError("❌ 自分より上位または同じロールのユーザーはタイムアウトできません。");
      return;
    }

    if (botRolePosition <= targetRolePosition) {
      await replyError("❌ Botのロールが対象ユーザー以下のためタイムアウトできません。");
      return;
    }

    const reason = reasonInput
      ? `${reasonInput} (Requested by ${interaction.user.tag})`
      : `Requested by ${interaction.user.tag}`;

    const durationMs = minutes * 60 * 1000;

    try {
      await targetMember.timeout(durationMs, reason);
      const successEmbed = new EmbedBuilder()
        .setAuthor({
          name: "✅ タイムアウト完了",
          iconURL: SUCCESS_ICON_URL
        })
        .setDescription(
          `✅ ${targetUser.tag} を${minutes}分タイムアウトしました。\n理由: ${reasonInput ?? "なし"}`
        )
        .setColor(0x57f287)
        .setTimestamp(new Date());
      await sendEphemeral(successEmbed);
    } catch (error) {
      if (requestor) {
        const requesterRolePosition = requestor.roles.highest.position;
        const targetRolePosition = targetMember.roles.highest.position;
        if (
          requesterRolePosition <= targetRolePosition &&
          interaction.user.id !== guild.ownerId
        ) {
          await replyError("❌ 自分より上位または同じロールのユーザーはタイムアウトできません。");
          return;
        }
      }
      console.error("❌ TIMEOUT失敗:", {
        guildId: guild.id,
        targetUserId: targetUser.id,
        error
      });
      await replyError("❌ タイムアウトに失敗しました。権限/ロール/上限設定を確認してください。");
    }
  }
};

export default command;
