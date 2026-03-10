const fsp = require("fs/promises");
const path = require("path");
const {
  MessageFlags,
  PermissionsBitField,
} = require("discord.js");
const blacklistCheck = require("./blacklist");

const stopConfigPath = path.join(__dirname, "../json/config.json");

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}

async function safelyReplyToInteraction(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp(payload);
    }

    return await interaction.reply(payload);
  } catch (error) {
    if (isIgnorableInteractionError(error)) {
      console.warn("[INTERACTION] レスポンス期限切れのため返信をスキップしました", {
        command: interaction.commandName,
        code: error.code,
      });
      return null;
    }

    throw error;
  }
}

function normalizeStopping(list) {
  return Array.isArray(list)
    ? list
        .map((name) => String(name).replace(/^\//, "").trim().toLowerCase())
        .filter(Boolean)
    : [];
}

async function getStoppingCommands() {
  try {
    const raw = await fsp.readFile(stopConfigPath, "utf8");
    const config = JSON.parse(raw);
    return normalizeStopping(config.stopping);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[CONFIG] json/confg.json の読み込みに失敗しました", error);
      return [];
    }
  }

  try {
    const raw = await fsp.readFile(legacyConfigPath, "utf8");
    const config = JSON.parse(raw);
    return normalizeStopping(config.stopping);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[CONFIG] config.json の読み込みに失敗しました", error);
    }
    return [];
  }
}

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const blocked = await blacklistCheck(interaction);
    if (blocked) return;

    const stoppingCommands = await getStoppingCommands();
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

      await safelyReplyToInteraction(interaction, {
        content: msg,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
