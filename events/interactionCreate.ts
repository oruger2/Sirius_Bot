import { EmbedBuilder, MessageFlags, PermissionsBitField, Collection } from "discord.js";
import type { Interaction, ChatInputCommandInteraction, Client } from "discord.js";

// コマンドの構造を定義
interface Command {
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown> | unknown;
}

// commandsプロパティを持つようにClientを拡張
interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

const event = {
  name: "interactionCreate",
  async execute(interaction: Interaction) {
    // スラッシュコマンド以外は処理しない
    if (!interaction.isChatInputCommand()) {
      return;
    }

    // 共通のエラーメッセージ送信関数
    const sendError = async (content: string) => {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: "エラー",
          iconURL:
            "https://cdn.discordapp.com/attachments/1477252358621630484/1480920398836142100/image.png?ex=69b16e19&is=69b01c99&hm=4ba81f76eec3144f7140e9d1b3d261108e152e487eff8a2d609ff0ada2f25c33"
        })
        .setDescription(content)
        .setColor(0xed4245)
        .setTimestamp();

      try {
        // すでに defer または reply されている場合は followUp を使う
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
      } catch (error) {
        // Unknown Interaction (10062) などの場合は無視
        const isUnknownInteraction = (err: unknown) => (err as { code?: number }).code === 10062;
        if (!isUnknownInteraction(error)) {
          console.error("エラーメッセージの送信に失敗しました:", error);
        }
      }
    };

    // --- Defer Reply 処理 ---
    const deferredEphemeralCommands = new Set(["ban", "kick", "timeout"]);
    const shouldBeEphemeral = deferredEphemeralCommands.has(interaction.commandName);
    
    try {
      // 処理の最初で deferReply を行う
      await interaction.deferReply({
        flags: shouldBeEphemeral ? MessageFlags.Ephemeral : undefined
      });
    } catch (error) {
      const isUnknownInteraction = (err: unknown) => (err as { code?: number }).code === 10062;
      if (isUnknownInteraction(error)) return;
      console.error("deferReplyに失敗しました:", error);
      return;
    }

    // --- バリデーションチェック ---
    if (!interaction.inGuild()) {
      await sendError("このコマンドはDMで実行されています。サーバー内で実行してください。");
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await sendError("サーバー情報の取得に失敗しました。もう一度お試しください。");
      return;
    }

    // Bot自身のメンバー情報をキャッシュから取得、なければフェッチする
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      await sendError("Botの権限確認に失敗しました。もう一度お試しください。");
      return;
    }

    const channel = interaction.channel;
    // チャンネルが存在し、テキストベースチャンネルであるかを確認
    if (channel && channel.isTextBased() && !channel.isDMBased() && "permissionsFor" in channel) {
      const permissions = channel.permissionsFor(botMember);
      
      if (!permissions) {
        await sendError("権限情報の取得に失敗しました。");
        return;
      }

      if (!permissions.has(PermissionsBitField.Flags.ViewChannel)) {
        await sendError("Botがチャンネルにアクセスできません。権限を確認してください。");
        return;
      }

      if (!permissions.has(PermissionsBitField.Flags.SendMessages)) {
        await sendError("Botがチャンネルで発言できません。権限を確認してください。");
        return;
      }
    }

    // --- コマンドの実行 ---
    const client = interaction.client as ExtendedClient;
    const command = client.commands?.get(interaction.commandName);

    if (!command) {
      await sendError("コマンドが見つかりません。");
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Command Error [${interaction.commandName}]:`, error);
      await sendError("コマンド実行中にエラーが発生しました。");
    }
  }
};

export default event;