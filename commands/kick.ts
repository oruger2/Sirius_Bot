import { EmbedBuilder, MessageFlags, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("ユーザーをサーバーからKICKします")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("KICKするユーザー")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("KICK理由")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const replyError = async (content: string) => {
      const embed = new EmbedBuilder()
        .setTitle("⚠️ エラー")
        .setDescription(content)
        .setColor(0xed4245)
        .setTimestamp(new Date());
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    };

    if (!interaction.inGuild()) {
      await replyError("⚠️ このコマンドはサーバー内でのみ使用できます。");
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const reasonInput = interaction.options.getString("reason")?.trim();
    const guild = interaction.guild;
    if (!guild) {
      await replyError("❌ サーバー情報の取得に失敗しました。もう一度お試しください。");
      return;
    }

    const requestor = interaction.member as GuildMember | null;
    const requestorPermissions = interaction.memberPermissions;

    if (!requestorPermissions?.has(PermissionsBitField.Flags.KickMembers)) {
      await replyError("❌ あなたにはKICK権限がありません。");
      return;
    }

    const botMember = await guild.members.fetchMe().catch(() => null);

    if (!botMember) {
      await replyError("❌ Botの権限確認に失敗しました。もう一度お試しください。");
      return;
    }

    if (!botMember.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      await replyError("❌ BotにKICK権限がありません。権限を付与してください。");
      return;
    }

    if (targetUser.id === interaction.user.id) {
      await replyError("❌ 自分自身をKICKすることはできません。");
      return;
    }

    if (targetUser.id === guild.ownerId) {
      await replyError("❌ サーバーオーナーをKICKすることはできません。");
      return;
    }

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      await replyError("❌ 対象ユーザーがサーバーにいません。");
      return;
    }

    const requesterRolePosition = requestor?.roles.highest.position ?? 0;
    const targetRolePosition = targetMember.roles.highest.position;
    const botRolePosition = botMember.roles.highest.position;

    if (
      requestor &&
      requesterRolePosition <= targetRolePosition &&
      interaction.user.id !== guild.ownerId
    ) {
      await replyError("❌ 自分より上位または同じロールのユーザーはKICKできません。");
      return;
    }

    if (botRolePosition <= targetRolePosition) {
      await replyError("❌ Botのロールが対象ユーザー以下のためKICKできません。");
      return;
    }

    if (!targetMember.kickable) {
      await replyError("❌ このユーザーはKICKできません。権限設定を確認してください。");
      return;
    }

    const reason = reasonInput
      ? `${reasonInput} (Requested by ${interaction.user.tag})`
      : `Requested by ${interaction.user.tag}`;

    try {
      await targetMember.kick(reason);
      const embed = new EmbedBuilder()
        .setTitle("✅ KICK完了")
        .setDescription(`✅ ${targetUser.tag} をKICKしました。\n理由: ${reasonInput ?? "なし"}`)
        .setColor(0x57f287)
        .setTimestamp(new Date());
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error("❌ KICK失敗:", {
        guildId: guild.id,
        targetUserId: targetUser.id,
        error
      });
      await replyError("❌ KICKに失敗しました。権限/ロール/上限設定を確認してください。");
    }
  }
};

export default command;
