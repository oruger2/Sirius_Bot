import { EmbedBuilder, MessageFlags, PermissionsBitField } from "discord.js";
import type { Interaction } from "discord.js";

const event = {
  name: "interactionCreate",
  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const isUnknownInteraction = (error: unknown) =>
      (error as { code?: number }).code === 10062;

    const deferredEphemeralCommands = new Set(["ban", "kick", "timeout"]);
    if (!interaction.deferred && !interaction.replied) {
      const shouldBeEphemeral = deferredEphemeralCommands.has(interaction.commandName);
      try {
        await interaction.deferReply({
          flags: shouldBeEphemeral ? MessageFlags.Ephemeral : undefined
        });
      } catch (error) {
        if (isUnknownInteraction(error)) {
          return;
        }
        // If defer fails for other reasons, stop here to avoid follow-up unknown interaction errors.
        return;
      }
    }

    const buildErrorEmbed = (content: string) =>
      new EmbedBuilder()
        .setAuthor({
          name: "エラー",
          iconURL:
            "https://cdn.discordapp.com/attachments/1477252358621630484/1480920398836142100/image.png?ex=69b16e19&is=69b01c99&hm=4ba81f76eec3144f7140e9d1b3d261108e152e487eff8a2d609ff0ada2f25c33"
        })
        .setDescription(content)
        .setColor(0xed4245)
        .setTimestamp(new Date());

    const replyOrFollowUp = async (embed: EmbedBuilder) => {
      const replyPayload = { embeds: [embed], flags: MessageFlags.Ephemeral };
      const editPayload = { embeds: [embed] };
      const followUpPayload = { embeds: [embed], flags: MessageFlags.Ephemeral };

      const tryEdit = async () => {
        try {
          await interaction.editReply(editPayload);
          return true;
        } catch (error) {
          if (isUnknownInteraction(error)) {
            return true;
          }
          if (error instanceof Error && error.name === "InteractionNotReplied") {
            return false;
          }
          throw error;
        }
      };

      const tryReply = async () => {
        try {
          await interaction.reply(replyPayload);
          return true;
        } catch (error) {
          if (isUnknownInteraction(error)) {
            return true;
          }
          if ((error as { code?: number }).code === 40060) {
            return false;
          }
          throw error;
        }
      };

      const tryFollowUp = async () => {
        try {
          await interaction.followUp(followUpPayload);
        } catch {
          // Ignore follow-up failures; avoid throwing in error path.
        }
      };

      if (interaction.deferred || interaction.replied) {
        if (await tryEdit()) {
          return;
        }
        if (await tryReply()) {
          return;
        }
        await tryFollowUp();
        return;
      }

      if (await tryReply()) {
        return;
      }
      if (await tryEdit()) {
        return;
      }
      await tryFollowUp();
    };

    const notifyUser = async (content: string) => {
      const embed = buildErrorEmbed(content);
      try {
        await replyOrFollowUp(embed);
      } catch {
        // Avoid DM fallback; per request, only attempt ephemeral response.
      }
    };

    if (!interaction.inGuild()) {
      await notifyUser("このコマンドはDMで実行されています。サーバー内で実行してください。");
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await notifyUser("サーバー情報の取得に失敗しました。もう一度お試しください。");
      return;
    }

    const botMember = await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      await notifyUser("Botの権限確認に失敗しました。もう一度お試しください。");
      return;
    }

    const channel = interaction.channel;
    if (channel && "permissionsFor" in channel) {
      const permissions = channel.permissionsFor(botMember);
      if (!permissions || !permissions.has(PermissionsBitField.Flags.ViewChannel)) {
        await notifyUser("Botがチャンネルにアクセスできません。権限を確認してください。");
        return;
      }

      if (!permissions.has(PermissionsBitField.Flags.SendMessages)) {
        await notifyUser("Botがチャンネルで発言できません。権限を確認してください。");
        return;
      }
    }

    const extendedClient = interaction.client as typeof interaction.client & {
      commands?: Map<string, { execute: (interaction: Interaction) => Promise<unknown> | unknown }>;
    };

    const command = extendedClient.commands?.get(interaction.commandName);

    if (!command) {
      const embed = buildErrorEmbed("コマンドが見つかりません");
      await replyOrFollowUp(embed);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Command Error: ${interaction.commandName}`, error);

      const embed = buildErrorEmbed("コマンド実行中にエラーが発生しました");
      await replyOrFollowUp(embed);
    }
  }
};

export default event;
