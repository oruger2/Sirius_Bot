const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { getGuildLeaveSetting } = require("../utils/leaveMessageSettings");

function buildPanel(setting) {
  return new EmbedBuilder()
    .setColor(setting.enabled ? "Orange" : "Grey")
    .setTitle("⚙️ Leaveメッセージ設定")
    .setDescription("退出メッセージのON/OFFと内容を設定できます。")
    .addFields(
      { name: "状態", value: setting.enabled ? "ON" : "OFF", inline: true },
      {
        name: "チャンネル",
        value: setting.channelId ? `<#${setting.channelId}>` : "未設定",
        inline: true,
      },
      { name: "メッセージ", value: setting.message || "未設定" }
    )
    .setFooter({ text: "[user] = 退出ユーザー / [membercount] = サーバー人数" });
}

function buildButtons(setting) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("leavemsg_toggle")
      .setLabel(setting.enabled ? "OFFにする" : "ONにする")
      .setStyle(setting.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("leavemsg_open_modal")
      .setLabel("チャンネル・メッセージ設定")
      .setStyle(ButtonStyle.Primary)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leavepanel")
    .setDescription("Leaveメッセージ設定パネルを開きます")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ 管理者のみ使用できます。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const setting = getGuildLeaveSetting(interaction.guild.id);

    await interaction.reply({
      embeds: [buildPanel(setting)],
      components: [buildButtons(setting)],
      flags: MessageFlags.Ephemeral,
    });
  },

  buildPanel,
  buildButtons,
};
