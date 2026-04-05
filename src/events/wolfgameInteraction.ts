import {
	type ButtonInteraction,
	type Interaction,
	MessageFlags,
	type ModalSubmitInteraction,
} from "discord.js";
import {
	handleWolfGameButtonInteraction,
	handleWolfGameModalInteraction,
} from "@/commands/wolfgame";

export default {
	name: "interactionCreate",
	async execute(interaction: Interaction) {
		const sendWolfgameError = async (
			target: ButtonInteraction | ModalSubmitInteraction,
			scope: "button" | "modal",
		) => {
			const payload = {
				content: "人狼ゲーム処理中にエラーが発生しました。",
				flags: MessageFlags.Ephemeral,
			} as const;

			try {
				if (target.replied || target.deferred) {
					await target.followUp(payload);
					return;
				}
				await target.reply(payload);
			} catch (replyError) {
				const code =
					typeof replyError === "object" &&
					replyError !== null &&
					"code" in replyError
						? (replyError as { code?: number }).code
						: undefined;

				// reply前後でACK状態が変わるレース時はfollowUpで返す
				if (code === 40060) {
					try {
						await target.followUp(payload);
						return;
					} catch (followUpError) {
						console.error(
							`wolfgame ${scope} followUp after 40060 failed:`,
							followUpError,
						);
						return;
					}
				}

				console.error(`wolfgame ${scope} error response failed:`, replyError);
			}
		};

		if (interaction.isButton()) {
			try {
				await handleWolfGameButtonInteraction(interaction);
			} catch (error) {
				console.error("wolfgame button handler error:", error);
				await sendWolfgameError(interaction, "button");
			}
			return;
		}

		if (!interaction.isModalSubmit()) return;
		try {
			await handleWolfGameModalInteraction(interaction);
		} catch (error) {
			console.error("wolfgame modal handler error:", error);
			await sendWolfgameError(interaction, "modal");
		}
	},
};
