import { PermissionsBitField } from "discord.js";
import type { Interaction } from "discord.js";

const event = {
  name: "interactionCreate",
  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const replyOrFollowUp = async (content: string) => {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content, ephemeral: true });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    };

    const notifyUser = async (content: string) => {
      try {
        await replyOrFollowUp(content);
      } catch {
        await interaction.user.send({ content }).catch(() => null);
      }
    };

    if (!interaction.inGuild()) {
      await notifyUser("⚠️ このコマンドはDMで実行されています。サーバー内で実行してください。");
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await notifyUser("⚠️ サーバー情報の取得に失敗しました。もう一度お試しください。");
      return;
    }

    const botMember = await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      await notifyUser("⚠️ Botの権限確認に失敗しました。もう一度お試しください。");
      return;
    }

    const channel = interaction.channel;
    if (channel && "permissionsFor" in channel) {
      const permissions = channel.permissionsFor(botMember);
      if (!permissions || !permissions.has(PermissionsBitField.Flags.ViewChannel)) {
        await interaction.user
          .send({ content: "⚠️ Botがチャンネルにアクセスできません。権限を確認してください。" })
          .catch(() => null);
        return;
      }

      if (!permissions.has(PermissionsBitField.Flags.SendMessages)) {
        await notifyUser("⚠️ Botがチャンネルで発言できません。権限を確認してください。");
        return;
      }
    }

    const extendedClient = interaction.client as typeof interaction.client & {
      commands?: Map<string, { execute: (interaction: Interaction) => Promise<unknown> | unknown }>;
    };

    const command = extendedClient.commands?.get(interaction.commandName);

    if (!command) {
      await interaction.reply({ content: "⚠️ コマンドが見つかりません", ephemeral: true });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Command Error: ${interaction.commandName}`, error);

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "⚠️ コマンド実行中にエラーが発生しました",
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: "⚠️ コマンド実行中にエラーが発生しました",
          ephemeral: true
        });
      }
    }
  }
};

export default event;
