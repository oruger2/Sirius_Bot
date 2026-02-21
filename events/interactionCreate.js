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
const {
  getGuildLeaveSetting,
  setGuildLeaveSetting,
} = require("../utils/leaveMessageSettings");
const {
  getGuildSpamSetting,
  setGuildSpamSetting,
} = require("../utils/spamBlockSettings");
const {
  getGuildAutoReactionSetting,
  setGuildAutoReactionSetting,
} = require("../utils/autoReactionSettings");
const {
  getGuildShortLinkSetting,
  setGuildShortLinkSetting,
} = require("../utils/shortLinkBlockSettings");
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

function isAdmin(interaction) {
  return interaction.inGuild() && interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

function parseIdList(text) {
  return [...new Set(
    String(text || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}



function parseEmojiList(text) {
  return [...new Set(
    String(text || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}

function toReactionValue(emoji) {
  const customEmojiMatch = emoji.match(/^<?a?:\w+:(\d+)>?$/);
  if (customEmojiMatch) return customEmojiMatch[1];

  if (/^\d+$/.test(emoji)) return emoji;
  return emoji;
}

async function handleAutoReactionPanel(interaction) {
  if (!interaction.inGuild()) return;

  if (!isAdmin(interaction)) {
    return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
  }

  const guildId = interaction.guild.id;
  const setting = getGuildAutoReactionSetting(guildId);

  if (interaction.isButton() && interaction.customId === "autoreact_toggle") {
    if (!setting.channelIds.length || !setting.emojis.length) {
      return interaction.reply({
        content: "⚠️ ONにする前に対象チャンネルと絵文字を設定してください。",
        flags: MessageFlags.Ephemeral,
      });
    }

    setGuildAutoReactionSetting(guildId, { ...setting, enabled: !setting.enabled });
    return interaction.update(renderSettingPanel(guildId));
  }

  if (interaction.isButton() && interaction.customId === "autoreact_open_modal") {
    const modal = new ModalBuilder().setCustomId("autoreact_modal").setTitle("自動リアクション設定");

    const channelsInput = new TextInputBuilder()
      .setCustomId("channel_ids")
      .setLabel("対象チャンネルID（カンマ区切り）")
      .setPlaceholder("123...,456...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue((setting.channelIds || []).join(","));

    const emojisInput = new TextInputBuilder()
      .setCustomId("emoji_list")
      .setLabel("絵文字（カンマ区切り）")
      .setPlaceholder("😀,🔥,<:custom:123456789012345678>")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue((setting.emojis || []).join(","));

    modal.addComponents(
      new ActionRowBuilder().addComponents(channelsInput),
      new ActionRowBuilder().addComponents(emojisInput)
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "autoreact_modal") {
    const channelIds = parseIdList(interaction.fields.getTextInputValue("channel_ids"));
    const emojis = parseEmojiList(interaction.fields.getTextInputValue("emoji_list"));
    const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

    for (const channelId of channelIds) {
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel || !textLike.includes(channel.type)) {
        return interaction.reply({
          content: "❌ 対象チャンネルIDに無効な値があります。",
          flags: MessageFlags.Ephemeral,
        });
      }

      const botMember = interaction.guild.members.me;
      const channelPerms = channel.permissionsFor(botMember);
      if (!channelPerms?.has(PermissionsBitField.Flags.AddReactions)) {
        return interaction.reply({
          content: "❌ 指定チャンネルのいずれかでリアクション権限がありません。",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    for (const emoji of emojis) {
      const reactionValue = toReactionValue(emoji);
      if (/^\d+$/.test(reactionValue) && !interaction.guild.emojis.cache.has(reactionValue)) {
        return interaction.reply({
          content: `❌ カスタム絵文字 ${emoji} はこのサーバーで使えません。`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    setGuildAutoReactionSetting(guildId, {
      ...setting,
      channelIds,
      emojis,
    });

    return interaction.reply({
      ...renderSettingPanel(guildId),
      flags: MessageFlags.Ephemeral,
    });
  }
}
function renderSettingPanel(guildId) {
  const joinSetting = getGuildJoinSetting(guildId);
  const leaveSetting = getGuildLeaveSetting(guildId);
  const spamSetting = getGuildSpamSetting(guildId);
  const autoReactionSetting = getGuildAutoReactionSetting(guildId);
  const shortLinkSetting = getGuildShortLinkSetting(guildId);

  return {
    embeds: [settingpanel.buildPanel(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting)],
    components: settingpanel.buildButtons(joinSetting, leaveSetting, spamSetting, autoReactionSetting, shortLinkSetting),
  };
}

async function handleShortLinkBlockPanel(interaction) {
  if (!interaction.inGuild()) return;

  if (!isAdmin(interaction)) {
    return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
  }

  if (!(interaction.isButton() && interaction.customId === "shortlink_toggle")) return;

  const guildId = interaction.guild.id;
  const setting = getGuildShortLinkSetting(guildId);
  setGuildShortLinkSetting(guildId, { ...setting, enabled: !setting.enabled });
  return interaction.update(renderSettingPanel(guildId));
}

async function handleJoinMessagePanel(interaction) {
  if (!interaction.inGuild()) return;

  if (!isAdmin(interaction)) {
    return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
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

    setGuildJoinSetting(guildId, { ...setting, enabled: !setting.enabled });
    return interaction.update(renderSettingPanel(guildId));
  }

  if (interaction.isButton() && interaction.customId === "joinmsg_open_modal") {
    const modal = new ModalBuilder().setCustomId("joinmsg_modal").setTitle("Joinメッセージ設定");

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

    setGuildJoinSetting(guildId, { ...setting, channelId, message });

    return interaction.reply({
      ...renderSettingPanel(guildId),
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleLeaveMessagePanel(interaction) {
  if (!interaction.inGuild()) return;

  if (!isAdmin(interaction)) {
    return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
  }

  const guildId = interaction.guild.id;
  const setting = getGuildLeaveSetting(guildId);

  if (interaction.isButton() && interaction.customId === "leavemsg_toggle") {
    if (!setting.channelId || !setting.message) {
      return interaction.reply({
        content: "⚠️ ONにする前にチャンネルIDとメッセージを設定してください。",
        flags: MessageFlags.Ephemeral,
      });
    }

    setGuildLeaveSetting(guildId, { ...setting, enabled: !setting.enabled });
    return interaction.update(renderSettingPanel(guildId));
  }

  if (interaction.isButton() && interaction.customId === "leavemsg_open_modal") {
    const modal = new ModalBuilder().setCustomId("leavemsg_modal").setTitle("Leaveメッセージ設定");

    const channelInput = new TextInputBuilder()
      .setCustomId("channel_id")
      .setLabel("送信先チャンネルID")
      .setPlaceholder("123456789012345678")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(setting.channelId || "");

    const messageInput = new TextInputBuilder()
      .setCustomId("leave_message")
      .setLabel("退出メッセージ")
      .setPlaceholder("[user] さんが退出しました。現在 [membercount] 人です。")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue(setting.message || "");

    modal.addComponents(
      new ActionRowBuilder().addComponents(channelInput),
      new ActionRowBuilder().addComponents(messageInput)
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "leavemsg_modal") {
    const channelId = interaction.fields.getTextInputValue("channel_id").trim();
    const message = interaction.fields.getTextInputValue("leave_message").trim();
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

    setGuildLeaveSetting(guildId, { ...setting, channelId, message });

    return interaction.reply({
      ...renderSettingPanel(guildId),
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleSpamBlockPanel(interaction) {
  if (!interaction.inGuild()) return;

  if (!isAdmin(interaction)) {
    return interaction.reply({ content: "❌ 管理者のみ操作できます。", flags: MessageFlags.Ephemeral });
  }

  const guildId = interaction.guild.id;
  const setting = getGuildSpamSetting(guildId);

  if (interaction.isButton() && interaction.customId === "spamblock_toggle") {
    setGuildSpamSetting(guildId, { ...setting, enabled: !setting.enabled });
    return interaction.update(renderSettingPanel(guildId));
  }

  if (interaction.isButton() && interaction.customId === "spamblock_open_modal") {
    const modal = new ModalBuilder().setCustomId("spamblock_modal").setTitle("SpamBlock設定");

    const reportChannelInput = new TextInputBuilder()
      .setCustomId("report_channel_id")
      .setLabel("レポート送信先チャンネルID（任意）")
      .setPlaceholder("未入力でレポート送信なし")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(setting.reportChannelId || "");

    const ignoredChannelsInput = new TextInputBuilder()
      .setCustomId("ignored_channel_ids")
      .setLabel("除外チャンネルID（カンマ区切り）")
      .setPlaceholder("123...,456...")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue((setting.ignoredChannelIds || []).join(","));

    const ignoredRolesInput = new TextInputBuilder()
      .setCustomId("ignored_role_ids")
      .setLabel("除外ロールID（カンマ区切り）")
      .setPlaceholder("123...,456...")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue((setting.ignoredRoleIds || []).join(","));

    modal.addComponents(
      new ActionRowBuilder().addComponents(reportChannelInput),
      new ActionRowBuilder().addComponents(ignoredChannelsInput),
      new ActionRowBuilder().addComponents(ignoredRolesInput)
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "spamblock_modal") {
    const reportChannelId = interaction.fields.getTextInputValue("report_channel_id").trim();
    const ignoredChannelIds = parseIdList(interaction.fields.getTextInputValue("ignored_channel_ids"));
    const ignoredRoleIds = parseIdList(interaction.fields.getTextInputValue("ignored_role_ids"));

    const textLike = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

    if (reportChannelId.length > 0) {
      const channel = interaction.guild.channels.cache.get(reportChannelId);
      if (!channel || !textLike.includes(channel.type)) {
        return interaction.reply({
          content: "❌ レポート送信先はテキストチャンネルIDを入力してください。",
          flags: MessageFlags.Ephemeral,
        });
      }

      const botMember = interaction.guild.members.me;
      const channelPerms = channel.permissionsFor(botMember);
      if (!channelPerms?.has(PermissionsBitField.Flags.SendMessages)) {
        return interaction.reply({
          content: "❌ そのレポート先チャンネルに送信権限がありません。",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    for (const channelId of ignoredChannelIds) {
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel || !textLike.includes(channel.type)) {
        return interaction.reply({
          content: "❌ 除外チャンネルIDに無効な値があります。",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    for (const roleId of ignoredRoleIds) {
      if (!interaction.guild.roles.cache.has(roleId)) {
        return interaction.reply({
          content: "❌ 除外ロールIDに無効な値があります。",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    setGuildSpamSetting(guildId, {
      ...setting,
      reportChannelId,
      ignoredChannelIds,
      ignoredRoleIds,
    });

    return interaction.reply({
      ...renderSettingPanel(guildId),
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

    if (
      (interaction.isButton() && ["leavemsg_toggle", "leavemsg_open_modal"].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "leavemsg_modal")
    ) {
      return handleLeaveMessagePanel(interaction);
    }

    if (
      (interaction.isButton() && ["spamblock_toggle", "spamblock_open_modal"].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "spamblock_modal")
    ) {
      return handleSpamBlockPanel(interaction);
    }

    if (
      (interaction.isButton() && ["autoreact_toggle", "autoreact_open_modal"].includes(interaction.customId)) ||
      (interaction.isModalSubmit() && interaction.customId === "autoreact_modal")
    ) {
      return handleAutoReactionPanel(interaction);
    }

    if (interaction.isButton() && interaction.customId === "shortlink_toggle") {
      return handleShortLinkBlockPanel(interaction);
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
