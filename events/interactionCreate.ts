import { EmbedBuilder, MessageFlags, PermissionsBitField } from "discord.js";
import type { Interaction } from "discord.js";

const event = {
  name: "interactionCreate",
  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const buildErrorEmbed = (content: string) =>
      new EmbedBuilder()
        .setTitle("⚠️ エラー")
        .setDescription(content)
        .setColor(0xed4245)
        .setTimestamp(new Date());

    const replyOrFollowUp = async (embed: EmbedBuilder) => {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
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
        await notifyUser("⚠️ Botがチャンネルにアクセスできません。権限を確認してください。");
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
      const embed = buildErrorEmbed("⚠️ コマンドが見つかりません");
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Command Error: ${interaction.commandName}`, error);

      const embed = buildErrorEmbed("⚠️ コマンド実行中にエラーが発生しました");
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    }
  }
};

export default event;
