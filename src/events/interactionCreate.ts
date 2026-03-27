import {
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  Collection,
} from "discord.js";
import type {
  Interaction,
  ChatInputCommandInteraction,
  Client,
} from "discord.js";

import path from "path";
import fsp from "fs/promises";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ===== ESM対応 =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ===== パス =====
const blacklistPath = path.join(__dirname, "../json/blacklist.json");
const stopConfigPath = path.join(__dirname, "../json/config.json");
const handlingInteractionIds = new Set<string>();
const INTERACTION_LOCK_TTL_MS = 15_000;

// ===== 型 =====
interface Command {
  execute: (
    interaction: ChatInputCommandInteraction,
  ) => Promise<unknown> | unknown;
}

interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

export default {
  name: "interactionCreate",

  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    // ===== エラーメッセージ =====
    const sendError = async (content: string) => {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: "エラー",
          iconURL:
            "https://cdn.discordapp.com/attachments/1477252358621630484/1480920398836142100/image.png",
        })
        .setDescription(content)
        .setColor(0xed4245)
        .setTimestamp();

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (err: any) {
        if (err?.code !== 10062) {
          console.error("sendError失敗:", err);
        }
      }
    };

    // ===== ギルドチェック =====
    if (!interaction.inGuild()) {
      await sendError("❌ サーバー内で実行してください。");
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await sendError("❌ サーバー取得失敗");
      return;
    }

    const client = interaction.client as ExtendedClient;
    const currentShardId = client.shard?.ids[0];

    if (
      typeof guild.shardId === "number" &&
      typeof currentShardId === "number" &&
      guild.shardId !== currentShardId
    ) {
      return;
    }

    if (handlingInteractionIds.has(interaction.id)) {
      return;
    }

    handlingInteractionIds.add(interaction.id);
    const dedupeTimer = setTimeout(() => {
      handlingInteractionIds.delete(interaction.id);
    }, INTERACTION_LOCK_TTL_MS);
    dedupeTimer.unref?.();

    // ===== Bot権限チェック =====
    const botMember =
      guild.members.me || (await guild.members.fetchMe().catch(() => null));

    if (!botMember) {
      await sendError("❌ Bot情報取得失敗");
      return;
    }

    const channel = interaction.channel;

    if (
      channel &&
      channel.isTextBased() &&
      !channel.isDMBased() &&
      "permissionsFor" in channel
    ) {
      const perms = channel.permissionsFor(botMember);

      if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) {
        await sendError("❌ チャンネル閲覧不可");
        return;
      }

      if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
        await sendError("❌ メッセージ送信不可");
        return;
      }
    }

    // ===== ブラックリスト読み込み =====
    let blacklist = { users: [] as string[], servers: [] as string[] };

    try {
      blacklist = JSON.parse(await fsp.readFile(blacklistPath, "utf8"));
    } catch {}

    if (blacklist.users.includes(interaction.user.id)) {
      await sendError("🚫 あなたはBotの利用を禁止されています。");
      return;
    }

    if (blacklist.servers.includes(guild.id)) {
      return; // サーバーごと無効（返信もしない）
    }

    // ===== 停止コマンド =====
    let config = { stopping: [] as string[] };

    try {
      config = JSON.parse(await fsp.readFile(stopConfigPath, "utf8"));
    } catch {}

    const commandName = interaction.commandName.toLowerCase();

    if (config.stopping.includes(commandName)) {
      await sendError("⛔ このコマンドは現在停止中です。");
      return;
    }

    // ===== コマンド取得 =====
    const command = client.commands.get(commandName);

    if (!command) {
      await sendError("❌ コマンドが見つかりません");
      return;
    }

    // ===== 実行 =====
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Command Error [${commandName}]`, error);
      await sendError("❌ 実行中にエラーが発生しました");
    }
  },
};
