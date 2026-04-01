import {
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  GuildMember
} from "discord.js";

import { SUCCESS_ICON_URL } from "@/utils/embedIcons";

const command = {
  data: new SlashCommandBuilder()
    .setName("user")
    .setDescription("ユーザー情報を表示")
    .addUserOption(option =>
      option
        .setName("target")
        .setDescription("対象ユーザー")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser =
      interaction.options.getUser("target") ?? interaction.user;

    const guild = interaction.guild;

    let member: GuildMember | null = null;

    if (guild) {
      member = await guild.members
        .fetch(targetUser.id)
        .catch(() => null);
    }

    const userType = targetUser.bot
      ? "🤖 Bot"
      : "👤 ユーザー";

    const createdAt = `<t:${Math.floor(
      targetUser.createdTimestamp / 1000
    )}:F>`;

    // ======================
    // サーバー外ユーザー
    // ======================
    if (!member) {
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
    const joinedAt = member.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
      : "不明";

    const roles =
      member.roles.cache
        .filter(r => r.id !== guild!.id)
        .map(r => `<@&${r.id}>`)
        .join(", ") || "なし";

    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${targetUser.bot ? "🤖" : "👤"} ユーザー情報`,
        iconURL: SUCCESS_ICON_URL
      })
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(targetUser.bot ? 0x00b0f4 : 0x57f287)
      .addFields(
        { name: "ユーザー名", value: targetUser.username, inline: true },
        { name: "表示名", value: targetUser.globalName ?? "なし", inline: true },
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
