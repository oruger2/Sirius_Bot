const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getGuildXpSetting, getUserXp, getGuildXpRanking } = require("../utils/xpSystem");
const { getUserEconomy } = require("../utils/economy");

function formatDateWithDays(date) {
  const now = Date.now();
  const diffDays = Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));
  return `<t:${Math.floor(date.getTime() / 1000)}:F>（${diffDays}日前）`;
}

function createXpChartUrl({ level, xp, neededXp, rank, total }) {
  const progress = neededXp <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((xp / (xp + neededXp)) * 100)));
  const config = {
    type: "radialGauge",
    data: {
      datasets: [
        {
          data: [progress],
          backgroundColor: ["#5865F2"],
        },
      ],
    },
    options: {
      domain: [0, 100],
      trackColor: "#23272A",
      centerPercentage: 75,
      centerArea: {
        text: `${progress}%`,
      },
      title: {
        display: true,
        text: `Lv.${level} | XP:${xp} | Rank:#${rank}/${total}`,
      },
    },
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}`;
}

function formatRoles(member) {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => role.toString());

  if (roles.length === 0) return "なし";
  return roles.slice(0, 15).join(" ") + (roles.length > 15 ? `\n...他 ${roles.length - 15} 個` : "");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user")
    .setDescription("ユーザー情報（XP/順位・所持金/順位・右上アバター）を表示します")
    .addUserOption((opt) =>
      opt.setName("member").setDescription("表示対象ユーザー（未指定で自分）").setRequired(false)
    ),

  async execute(interaction) {
    await interaction.guild.members.fetch();

    const targetUser = interaction.options.getUser("member") || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id);
    const xpSetting = await getGuildXpSetting(interaction.guild.id);
    const isXpEnabled = xpSetting.enabled;

    const joinedAt = member.joinedAt || new Date();
    let xpData = null;
    let xpRank = 0;
    let xpRanking = [];
    let xpImageUrl = null;

    const memberIds = interaction.guild.members.cache.map((m) => m.id);
    if (isXpEnabled) {
      xpData = await getUserXp(interaction.guild.id, targetUser.id);
      xpRanking = await getGuildXpRanking(interaction.guild.id, memberIds);
      xpRank = xpRanking.findIndex((entry) => entry.userId === targetUser.id) + 1;
      xpImageUrl = createXpChartUrl({
        level: xpData.level,
        xp: xpData.xp,
        neededXp: xpData.neededXp,
        rank: xpRank || xpRanking.length || 1,
        total: xpRanking.length || 1,
      });
    }

    const economyEntries = await Promise.all(
      memberIds.map(async (id) => {
        const data = await getUserEconomy(id);
        return { userId: id, balance: data.balance };
      })
    );
    economyEntries.sort((a, b) => b.balance - a.balance || a.userId.localeCompare(b.userId));

    const moneyData = economyEntries.find((entry) => entry.userId === targetUser.id) || { balance: 0 };
    const moneyRank = economyEntries.findIndex((entry) => entry.userId === targetUser.id) + 1;

    const embed = new EmbedBuilder()
      .setColor("Aqua")
      .setTitle(`👤 ${targetUser.tag} のユーザー情報`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 512 }))
      .addFields(
        { name: "ユーザー名", value: targetUser.tag, inline: true },
        { name: "ユーザーID", value: targetUser.id, inline: true },
        { name: "作成日", value: formatDateWithDays(targetUser.createdAt), inline: false },
        { name: "サーバー参加日", value: formatDateWithDays(joinedAt), inline: false },
        { name: "持ちロール", value: formatRoles(member), inline: false },
        {
          name: "持ち金",
          value: `${moneyData.balance}円\n順位: **#${moneyRank || "-"}/${economyEntries.length || 1}**`,
          inline: true,
        }
      )
      .setTimestamp();

    if (isXpEnabled && xpData && xpImageUrl) {
      embed
        .addFields({
          name: "サーバーでのレベル(XP)",
          value: `レベル: **${xpData.level}**\nXP: **${xpData.xp}**\n順位: **#${xpRank || "-"}/${xpRanking.length || 1}**`,
          inline: true,
        })
        .setImage(xpImageUrl)
        .setFooter({ text: "XPは画像で可視化しています" });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
