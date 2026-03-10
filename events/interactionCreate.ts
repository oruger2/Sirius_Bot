import type { Interaction } from "discord.js";

const event = {
  name: "interactionCreate",
  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
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
