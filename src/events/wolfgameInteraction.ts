import type { Interaction } from "discord.js";
import { handleWolfGameButtonInteraction } from "@/commands/wolfgame";

export default {
	name: "interactionCreate",
	async execute(interaction: Interaction) {
		if (!interaction.isButton()) return;
		try {
			await handleWolfGameButtonInteraction(interaction);
		} catch (error) {
			console.error("wolfgame button handler error:", error);
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({
					content: "人狼ゲーム処理中にエラーが発生しました。",
					ephemeral: true,
				});
			}
		}
	},
};
