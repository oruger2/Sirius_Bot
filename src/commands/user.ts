import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type User
} from "discord.js";

import { SUCCESS_ICON_URL } from "@/utils/embedIcons";

const command = {
  data: new SlashCommandBuilder()
    .setName("user")
    .setDescription("ユーザー情報を表示")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("対象ユーザー")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser: User =
      interaction.options.getUser("target") ?? interaction.user;

    const guild: Guild | null = interaction.guild;

    let member: GuildMember | null = null;

    if (guild !== null) {
      try {
        member = await guild.members.fetch(targetUser.id);
      } catch {
        member = null;
      }
    }

    const userType: "🤖 Bot" | "👤 ユーザー" = targetUser.bot
      ? "🤖 Bot"
      : "👤 ユーザー";

    const createdAt: string = `<t:${Math.floor(
      targetUser.createdTimestamp / 1000
    )}:F>`;

    // ======================
    // サーバー外ユーザー
    // ======================
    if (member === null) {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: `${targetUser.bot ? "🤖" : "👤"} ユーザー情報`,
          iconURL: SUCCESS_ICON_URL
        })
        .setThumbnail(targetUser.displayAvatarURL())
        .setColor(targetUser.bot ? 0x00b0f4 : 0x57f287)
        .addFields(
          { name: "ユーザー名", value: targetUser.username },
          { name: "ユーザーID", value: targetUser.id },
          { name: "タイプ", value: userType },
          { name: "アカウント作成日", value: createdAt }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ======================
    // サーバー内ユーザー
    // ======================
    const joinedAt: string =
      member.joinedTimestamp !== null
        ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
        : "不明";

    const rolesArray: string[] = member.roles.cache
      .filter((role) => guild === null || role.id !== guild.id)
      .map((role) => `<@&${role.id}>`);

    const roles: string =
      rolesArray.length > 0 ? rolesArray.join(", ") : "なし";

    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${targetUser.bot ? "🤖" : "👤"} ユーザー情報`,
        iconURL: SUCCESS_ICON_URL
      })
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(targetUser.bot ? 0x00b0f4 : 0x57f287)
      .addFields(
        { name: "ユーザー名", value: targetUser.username, inline: true },
        {
          name: "表示名",
          value: targetUser.globalName ?? "なし",
          inline: true
        },
        { name: "ユーザーID", value: targetUser.id },
        { name: "タイプ", value: userType, inline: true },
        { name: "アカウント作成日", value: createdAt },
        { name: "サーバー参加日", value: joinedAt },
        { name: "ロール", value: roles }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

export default command;
