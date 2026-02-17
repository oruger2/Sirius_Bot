const fs = require("fs");
const path = require("path");
const {
  MessageFlags,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const blacklistCheck = require("./blacklist");
const {
  getGuildJoinSetting,
  setGuildJoinSetting,
} = require("../utils/joinMessageSettings");
const settingpanel = require("../commands/settingpanel");

const configPath = path.join(__dirname, "../config.json");

function getStoppingCommands() {
  if (!fs.existsSync(configPath)) return [];

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return Array.isArray(config.stopping)
      ? config.stopping
          .map((name) => String(name).replace(/^\//, "").trim().toLowerCase())
          .filter(Boolean)
      : [];
  } catch (error) {
    console.error("[CONFIG] config.json の読み込みに失敗しました", error);
    return [];
  }
}

async function handleJoinMessagePanel(interaction) {
  if (!interaction.inGuild()) return;

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    const message = "❌ 管理者のみ操作できます。";
    if (interaction.isButton()) {
      return interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  }

  const guildId = interaction.guild.id;
  const setting = getGuildJoinSetting(guildId);

  if (interaction.isButton() && interaction.customId === "joinmsg_toggle") {
    if (!setting.channelId || !setting.message) {
      return interaction.reply({
        content: "⚠️ ONにする前にチャンネルIDとメッセージを設定してください。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const next = setGuildJoinSetting(guildId, {
      ...setting,
      enabled: !setting.enabled,
    });

    return interaction.update({
      embeds: [settingpanel.buildPanel(next)],
      components: [settingpanel.buildButtons(next)],
    });
  }

  if (interaction.isButton() && interaction.customId === "joinmsg_open_modal") {
    const modal = new ModalBuilder()
      .setCustomId("joinmsg_modal")
      .setTitle("Joinメッセージ設定");

    const channelInput = new TextInputBuilder()
      .setCustomId("channel_id")
      .setLabel("送信先チャンネルID")
      .setPlaceholder("123456789012345678")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(setting.channelId || "");

    const messageInput = new TextInputBuilder()
      .setCustomId("join_message")
      .setLabel("参加メッセージ")
      .setPlaceholder("[user] さん、ようこそ！現在 [membercount] 人です。")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue(setting.message || "");

    modal.addComponents(
      new ActionRowBuilder().addComponents(channelInput),
      new ActionRowBuilder().addComponents(messageInput)
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "joinmsg_modal") {
    const channelId = interaction.fields.getTextInputValue("channel_id").trim();
    const message = interaction.fields.getTextInputValue("join_message").trim();
    const channel = interaction.guild.channels.cache.get(channelId);

    const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
    if (!channel || !textLike.includes(channel.type)) {
      return interaction.reply({
        content: "❌ テキストチャンネルのIDを入力してください。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const botMember = interaction.guild.members.me;
    const channelPerms = channel.permissionsFor(botMember);
    if (!channelPerms?.has(PermissionsBitField.Flags.SendMessages)) {
      return interaction.reply({
        content: "❌ そのチャンネルに送信権限がありません。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const current = getGuildJoinSetting(guildId);
    const next = setGuildJoinSetting(guildId, {
      ...current,
      channelId,
      message,
    });

    return interaction.reply({
      embeds: [settingpanel.buildPanel(next)],
      components: [settingpanel.buildButtons(next)],
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    if (
      (interaction.isButton() && ["joinmsg_toggle", "joinmsg_open_modal"].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "joinmsg_modal")
    ) {
      return handleJoinMessagePanel(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    const blocked = await blacklistCheck(interaction);
    if (blocked) return;

    const stoppingCommands = getStoppingCommands();
    const commandName = interaction.commandName.toLowerCase();

    if (stoppingCommands.includes(commandName)) {
      return interaction.reply({
        content: `⛔ /${interaction.commandName} は現在停止中です。`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "❌ このコマンドはサーバー内でのみ使用できます。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember) return;

    const permissions = interaction.channel.permissionsFor(botMember);

    if (!permissions || !permissions.has(PermissionsBitField.Flags.ViewChannel)) {
      return interaction.reply({
        content: "❌ Botはこのチャンネルを**見ることができません**。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const speakPermissions = [
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
    ];

    if (interaction.channel.isThread()) {
      speakPermissions.push(PermissionsBitField.Flags.SendMessagesInThreads);
    }

    const cannotSpeak = speakPermissions.some((perm) => !permissions.has(perm));

    if (cannotSpeak) {
      return interaction.reply({
        content:
          "❌ Botはこのチャンネルで**話すことができません**。\n" +
          "（メッセージ送信または埋め込み権限が不足しています）",
        flags: MessageFlags.Ephemeral,
      });
    }

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({
        content: "❌ コマンドが見つかりません。",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[COMMAND ERROR] /${interaction.commandName}`, error);

      const msg = "❌ コマンドの実行中に予期しないエラーが発生しました。";

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: msg });
      } else {
        await interaction.reply({
          content: msg,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
