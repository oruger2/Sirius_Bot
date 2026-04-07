import type {
	ButtonInteraction,
	Interaction,
	ModalSubmitInteraction,
} from "discord.js";
import {
	handleSettingButtonInteraction,
	handleSettingModalInteraction,
} from "@/commands/setting";

export default {
	name: "interactionCreate",
	async execute(interaction: Interaction) {
		if (interaction.isButton()) {
			try {
				await handleSettingButtonInteraction(interaction);
			} catch (error) {
				console.error("setting button handler error:", error);
			}
			return;
		}

		if (!interaction.isModalSubmit()) return;

		try {
			await handleSettingModalInteraction(interaction);
		} catch (error) {
			console.error("setting modal handler error:", error);
		}
	},
};
